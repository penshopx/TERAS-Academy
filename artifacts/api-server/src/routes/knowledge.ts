// @ts-nocheck
import { Router, type IRouter } from "express";
import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import {
  CreateAdminKnowledgeArticleBody, CreateAdminKnowledgeArticleResponse,
  ListAdminKnowledgeArticlesResponse, PublishAdminKnowledgeArticleParams,
  PublishAdminKnowledgeArticleResponse, SearchAssistantKnowledgeBody,
  SearchAssistantKnowledgeResponse, UpdateAdminKnowledgeArticleBody,
  UpdateAdminKnowledgeArticleParams, UpdateAdminKnowledgeArticleResponse,
} from "@workspace/api-zod";
import { adminAuditEventsTable, db, knowledgeArticlesTable } from "@workspace/db";
import { authorizeAdmin, authorizeKnowledgeActor, type AdminActor } from "../lib/authorization";
import { hasUnsafeKnowledgeLink, isUnsafeKnowledgeInput, withReadinessDisclaimer } from "../lib/knowledge-safety";
import { buildGroundedAssistantMessages } from "../lib/assistant-grounding";

const router: IRouter = Router();
const parse = (schema: any, value: unknown, res: any) => {
  const result = schema.safeParse(value);
  if (!result.success) { res.status(400).json({ error: result.error.message }); return null; }
  return result.data;
};
const conflict = (message = "Article changed concurrently; reload and retry.") => Object.assign(new Error(message), { code: "CONFLICT" });
const missing = () => Object.assign(new Error("Knowledge article not found."), { code: "NOT_FOUND" });
const audienceOverlap = (roles: string[]) =>
  sql`${knowledgeArticlesTable.audience} && ARRAY[${sql.join(roles.map(role => sql`${role}`), sql`, `)}]::text[]`;
async function lockFamily(tx: any, familyId: string) {
  // Transaction-scoped locks serialize version changes without leaving locks behind.
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${familyId}, 0))`);
}
async function audit(tx: any, actor: AdminActor, action: string, id: string, before: unknown, after: unknown) {
  await tx.insert(adminAuditEventsTable).values({ id: crypto.randomUUID(), actorPersonId: actor.personId, actorClerkUserId: actor.authSubject, actorAuthProvider: "supabase", actorAuthSubject: actor.authSubject, action, entityType: "knowledge_article", entityId: id, before, after, createdBy: `supabase:${actor.authSubject}` });
}

router.post("/assistant/knowledge/search", async (req, res): Promise<void> => {
  const actor = await authorizeKnowledgeActor(req, res); if (!actor) return;
  const input = parse(SearchAssistantKnowledgeBody, req.body, res); if (!input) return;
  if (isUnsafeKnowledgeInput(input.question) || hasUnsafeKnowledgeLink(input.question)) {
    res.status(400).json({ error: "Unsafe or instruction-like input is not accepted." }); return;
  }
  const terms = input.question.trim().split(/\s+/).filter((term: string) => term.length > 2).slice(0, 8);
  if (!terms.length) { res.json(SearchAssistantKnowledgeResponse.parse({ found: false, mode: "not_found", answer: "Saya belum menemukan informasi yang sesuai. Coba gunakan kata kunci yang lebih spesifik.", citations: [] })); return; }
  const clauses = terms.map((term: string) => or(ilike(knowledgeArticlesTable.title, `%${term}%`), ilike(knowledgeArticlesTable.body, `%${term}%`)));
  const matches = await db.select().from(knowledgeArticlesTable).where(and(eq(knowledgeArticlesTable.category, input.category), eq(knowledgeArticlesTable.status, "published"), audienceOverlap(actor.roles), or(...clauses))).orderBy(desc(knowledgeArticlesTable.version)).limit(12);
  const seen = new Set<string>();
  const articles = matches.filter(article => { const key = article.parentArticleId ?? article.id; if (seen.has(key)) return false; seen.add(key); return true; }).slice(0, 3);
  if (!articles.length) {
    res.json(SearchAssistantKnowledgeResponse.parse({ found: false, mode: "not_found", answer: "Saya belum menemukan artikel terbit yang sesuai. Saya tidak akan menebak; coba ubah pertanyaan atau hubungi admin TERAS.", citations: [] })); return;
  }
  const citations = articles.map(article => ({ articleId: article.id, title: article.title, version: article.version }));
  const fallback = withReadinessDisclaimer(articles.map(article => article.body).join("\n\n"));
  if (process.env.NODE_ENV === "test") {
    res.json(SearchAssistantKnowledgeResponse.parse({ found: true, mode: "knowledge_fallback", answer: fallback, citations }));
    return;
  }
  try {
    // Import only after retrieval: unavailable provider configuration must not
    // prevent deterministic, access-controlled knowledge answers.
    const { openrouter } = await import("@workspace/integrations-openrouter-ai");
    const completion = await openrouter.chat.completions.create({
        model: "qwen/qwen3.8-flash",
        max_tokens: 8192,
        temperature: 0.1,
        messages: buildGroundedAssistantMessages(input.category, input.question, articles),
      }, { timeout: 15_000 });
    const answer = completion.choices[0]?.message?.content?.trim();
    if (!answer) throw new Error("OpenRouter returned no answer");
    res.json(SearchAssistantKnowledgeResponse.parse({ found: true, mode: "ai", answer, citations }));
  } catch {
    req.log?.warn("Grounded assistant provider unavailable; using knowledge fallback");
    res.json(SearchAssistantKnowledgeResponse.parse({ found: true, mode: "knowledge_fallback", answer: fallback, citations }));
  }
});

router.get("/admin/knowledge", async (req, res): Promise<void> => {
  if (!await authorizeAdmin(req, res)) return;
  res.json(ListAdminKnowledgeArticlesResponse.parse(await db.select().from(knowledgeArticlesTable).orderBy(desc(knowledgeArticlesTable.createdAt))));
});
router.post("/admin/knowledge", async (req, res): Promise<void> => {
  const actor = await authorizeAdmin(req, res); const input = parse(CreateAdminKnowledgeArticleBody, req.body, res);
  if (!actor || !input) return;
  if (hasUnsafeKnowledgeLink(input.body)) { res.status(400).json({ error: "Unsafe links are not allowed in knowledge articles." }); return; }
  try {
    const article = await db.transaction(async tx => { const [created] = await tx.insert(knowledgeArticlesTable).values({ ...input, createdBy: `supabase:${actor.authSubject}` }).returning(); await audit(tx, actor, "create", created.id, null, created); return created; });
    res.status(201).json(CreateAdminKnowledgeArticleResponse.parse(article));
  } catch { res.status(409).json({ error: "Knowledge article ID already exists." }); }
});
router.patch("/admin/knowledge/:articleId", async (req, res): Promise<void> => {
  const actor = await authorizeAdmin(req, res); const params = parse(UpdateAdminKnowledgeArticleParams, req.params, res); const input = parse(UpdateAdminKnowledgeArticleBody, req.body, res);
  if (!actor || !params || !input) return;
  if (input.body && hasUnsafeKnowledgeLink(input.body)) { res.status(400).json({ error: "Unsafe links are not allowed in knowledge articles." }); return; }
  const [snapshot] = await db.select().from(knowledgeArticlesTable).where(eq(knowledgeArticlesTable.id, params.articleId));
  if (!snapshot) { res.status(404).json({ error: "Knowledge article not found." }); return; }
  // A published row is immutable to readers: editing starts a separate draft,
  // leaving the currently published guidance available until that draft is published.
  try {
    const article = await db.transaction(async tx => {
      const family = snapshot.parentArticleId ?? snapshot.id;
      await lockFamily(tx, family);
      const [before] = await tx.select().from(knowledgeArticlesTable).where(eq(knowledgeArticlesTable.id, params.articleId));
      if (!before) throw missing();
      if (before.version !== snapshot.version || before.status === "archived") throw conflict(before.status === "archived" ? "Archived articles are immutable." : undefined);
      if (before.status === "published") {
        const drafts = await tx.select({ id: knowledgeArticlesTable.id }).from(knowledgeArticlesTable).where(and(eq(knowledgeArticlesTable.parentArticleId, family), eq(knowledgeArticlesTable.status, "draft"))).limit(1);
        if (drafts.length) throw conflict("A draft revision already exists for this article.");
        const [draft] = await tx.insert(knowledgeArticlesTable).values({ ...before, ...input, id: crypto.randomUUID(), parentArticleId: family, status: "draft", publishedAt: null, version: before.version + 1, updatedAt: new Date(), createdBy: `supabase:${actor.authSubject}` }).returning();
        await audit(tx, actor, "create_draft_version", draft.id, before, draft); return draft;
      }
      const [updated] = await tx.update(knowledgeArticlesTable).set({ ...input, version: before.version + 1, updatedAt: new Date() }).where(and(eq(knowledgeArticlesTable.id, before.id), eq(knowledgeArticlesTable.version, before.version), eq(knowledgeArticlesTable.status, "draft"))).returning();
      if (!updated) throw conflict(); await audit(tx, actor, "update", before.id, before, updated); return updated;
    });
    res.json(UpdateAdminKnowledgeArticleResponse.parse(article));
  } catch (error: any) {
    res.status(error?.code === "NOT_FOUND" ? 404 : 409).json({ error: error?.message || "Article changed concurrently; reload and retry." });
  }
});
router.post("/admin/knowledge/:articleId/publish", async (req, res): Promise<void> => {
  const actor = await authorizeAdmin(req, res); const params = parse(PublishAdminKnowledgeArticleParams, req.params, res);
  if (!actor || !params) return;
  const [snapshot] = await db.select().from(knowledgeArticlesTable).where(eq(knowledgeArticlesTable.id, params.articleId));
  if (!snapshot) { res.status(404).json({ error: "Knowledge article not found." }); return; }
  try {
    const article = await db.transaction(async tx => {
      const parent = snapshot.parentArticleId ?? snapshot.id;
      await lockFamily(tx, parent);
      const [before] = await tx.select().from(knowledgeArticlesTable).where(eq(knowledgeArticlesTable.id, params.articleId));
      if (!before) throw missing();
      if (before.version !== snapshot.version || before.status !== "draft") throw conflict(before.status === "archived" ? "Archived articles cannot be published." : "Only draft articles can be published.");
      const publishedRows = await tx.select().from(knowledgeArticlesTable).where(and(
        or(eq(knowledgeArticlesTable.id, parent), eq(knowledgeArticlesTable.parentArticleId, parent)),
        eq(knowledgeArticlesTable.status, "published"),
      ));
      await tx.update(knowledgeArticlesTable).set({ status: "archived", updatedAt: new Date() }).where(and(
        or(eq(knowledgeArticlesTable.id, parent), eq(knowledgeArticlesTable.parentArticleId, parent)),
        eq(knowledgeArticlesTable.status, "published"),
      ));
      for (const row of publishedRows) await audit(tx, actor, "supersede", row.id, row, { ...row, status: "archived", updatedAt: new Date() });
      const [updated] = await tx.update(knowledgeArticlesTable).set({ parentArticleId: parent, status: "published", publishedAt: new Date(), version: before.version + 1, updatedAt: new Date() }).where(and(eq(knowledgeArticlesTable.id, before.id), eq(knowledgeArticlesTable.version, before.version), eq(knowledgeArticlesTable.status, "draft"))).returning();
      if (!updated) throw conflict();
      await audit(tx, actor, "publish", before.id, before, updated);
      return updated;
    });
    res.json(PublishAdminKnowledgeArticleResponse.parse(article));
  } catch (error: any) {
    res.status(error?.code === "NOT_FOUND" ? 404 : 409).json({ error: error?.message || "Article changed concurrently; reload and retry." });
  }
});
export default router;
