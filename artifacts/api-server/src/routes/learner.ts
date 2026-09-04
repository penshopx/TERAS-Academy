import { Router, type IRouter } from "express";
import crypto from "node:crypto";
import { CompleteRemediationParams, CompleteRemediationResponse, CreateEvidenceBody, CreateEvidenceResponse, CreatePracticeAttemptBody, CreatePracticeAttemptParams, CreatePracticeAttemptResponse, GetCapabilityPassportResponse, GetLearnerDashboardResponse, GetLearnerJourneyResponse, GetLearnerLearningPlanResponse, GetLearnerReadinessResponse, ListEvidenceResponse, ListGapsResponse, ListRemediationResponse, SelectLearnerPathwayBody, SelectLearnerPathwayResponse } from "@workspace/api-zod";
import { db, assessmentAttemptsTable, enrollmentPathwayEventsTable, evidenceReviewsTable, evidenceTable, learningTransitionEventsTable, modulesTable, pathwaysTable, practiceAttemptsTable, practiceTasksTable } from "@workspace/db";
import { and, desc, eq, sql } from "drizzle-orm";
import { catalogue, evidenceRecords, gapRecords, learnerContext, moduleSummary, pathwaySummary, progressByModule, readiness, remediationRecords } from "../lib/teras";
import { authorizeLearner } from "../lib/authorization";
import { learningNextAction, transitionLearningState, type LearningState, type LearningTransitionResult } from "../lib/learning-transition";
const router: IRouter = Router(); const id = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;
function bad(req: any, res: any, error: string) { req.log.warn({ error }, "Invalid request"); res.status(400).json({ error }); }
const digest = (value: unknown) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const scopedIdempotencyKey = (operation: string, learnerId: string, key: string) => `${operation}:${digest({ learnerId, key })}`;
function idempotencyConflict(res: any) {
  res.status(409).json({
    error: "IDEMPOTENCY_KEY_REUSED",
    message: "The idempotency key was already used with a different payload.",
  });
}
class RejectedLearningTransition extends Error {
  constructor(readonly result: Extract<LearningTransitionResult, { ok: false }>) {
    super(result.value.message);
  }
}
async function learningWrite<T>(write: (tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) => Promise<T>) {
  try {
    return await db.transaction(write);
  } catch (error) {
    if (error instanceof RejectedLearningTransition) return { kind: "rejected" as const, transition: error.result };
    throw error;
  }
}
async function pathwayTimeline(learnerId: string) { const context = await learnerContext(learnerId); const [events, pathways] = await Promise.all([db.select().from(enrollmentPathwayEventsTable).where(eq(enrollmentPathwayEventsTable.enrollmentId, context.enrollment.id)).orderBy(enrollmentPathwayEventsTable.sequence), db.select().from(pathwaysTable)]); const map = new Map(pathways.map((pathway) => [pathway.id, pathway])); const original = map.get(context.enrollment.pathwayId) ?? context.pathway; return { context, steps: [{ id: "pathway-enrol", pathwayId: original.id, pathwayName: original.name, label: "Pathway started", description: `Enrolled on ${original.name}.`, status: "Complete", date: new Date("2025-01-06T09:00:00Z"), href: "/programs/solar-pv-tech" }, ...events.map((event) => { const pathway = map.get(event.pathwayId); return { id: `pathway-${event.id}`, pathwayId: event.pathwayId, pathwayName: pathway?.name ?? "Unknown pathway", label: "Pathway selected", description: `Activated ${pathway?.name ?? "capability pathway"}.`, status: "Complete", date: event.createdAt, href: "/programs/solar-pv-tech" }; })] }; }
router.get("/evidence", async (req, res): Promise<void> => { const learnerId = await authorizeLearner(req, res); if (!learnerId) return; res.json(ListEvidenceResponse.parse(await evidenceRecords(learnerId))); });
router.post("/learner/pathway", async (req, res): Promise<void> => { const parsed = SelectLearnerPathwayBody.safeParse(req.body); if (!parsed.success) { bad(req, res, parsed.error.message); return; } const learnerId = await authorizeLearner(req, res); if (!learnerId) return; const context = await learnerContext(learnerId); const [pathway] = await db.select().from(pathwaysTable).where(eq(pathwaysTable.id, parsed.data.pathwayId)); if (!pathway || pathway.programId !== context.program.id) { res.status(404).json({ error: "Pathway not found for the enrolled program" }); return; } const event = await db.transaction(async (tx) => { await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${context.enrollment.id}))`); const [previous] = await tx.select().from(enrollmentPathwayEventsTable).where(eq(enrollmentPathwayEventsTable.enrollmentId, context.enrollment.id)).orderBy(desc(enrollmentPathwayEventsTable.sequence)).limit(1); return (await tx.insert(enrollmentPathwayEventsTable).values({ id: id("pathway-selection"), enrollmentId: context.enrollment.id, pathwayId: pathway.id, programId: context.program.id, sequence: (previous?.sequence ?? 0) + 1, createdBy: learnerId }).returning())[0]; }); const summary = await pathwaySummary(pathway.id); if (!summary) throw new Error(`Missing pathway catalogue for ${pathway.id}`); res.status(201).json(SelectLearnerPathwayResponse.parse({ pathway: summary, programId: pathway.programId, selectedAt: event.createdAt })); });
router.post("/evidence", async (req, res): Promise<void> => {
  const parsed = CreateEvidenceBody.safeParse(req.body);
  if (!parsed.success) { bad(req, res, parsed.error.message); return; }
  const learnerId = await authorizeLearner(req, res);
  if (!learnerId) return;
  const context = await learnerContext(learnerId);
  const [module, task, attempt, latestTransition] = await Promise.all([
    db.select().from(modulesTable).where(eq(modulesTable.id, parsed.data.moduleId)).then(rows => rows[0]),
    db.select().from(practiceTasksTable).where(eq(practiceTasksTable.id, parsed.data.taskId)).then(rows => rows[0]),
    db.select().from(practiceAttemptsTable).where(eq(practiceAttemptsTable.id, parsed.data.practiceAttemptId)).then(rows => rows[0]),
    db.select().from(learningTransitionEventsTable).where(and(
      eq(learningTransitionEventsTable.activityId, parsed.data.sourceActivityId),
      eq(learningTransitionEventsTable.learnerId, learnerId),
      eq(learningTransitionEventsTable.pathwayId, context.pathway.id),
    )).orderBy(desc(learningTransitionEventsTable.createdAt), desc(learningTransitionEventsTable.id)).limit(1).then(rows => rows[0]),
  ]);
  if (!module || module.pathwayId !== context.pathway.id || !task || task.moduleId !== module.id || !attempt || attempt.taskId !== task.id || attempt.learnerId !== learnerId || attempt.pathwayId !== context.pathway.id) {
    res.status(404).json({ error: "Linked practice attempt was not found for the enrolled pathway" });
    return;
  }
  const transitionKey = scopedIdempotencyKey("evidence-submit", learnerId, parsed.data.idempotencyKey);
  const fingerprint = digest({
    moduleId: parsed.data.moduleId, taskId: parsed.data.taskId, title: parsed.data.title, type: parsed.data.type,
    description: parsed.data.description, fileName: parsed.data.fileName, sourceActivityId: parsed.data.sourceActivityId,
    practiceAttemptId: parsed.data.practiceAttemptId,
  });
  const result = await learningWrite(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${transitionKey}))`);
    const [duplicate] = await tx.select().from(learningTransitionEventsTable).where(eq(learningTransitionEventsTable.idempotencyKey, transitionKey)).limit(1);
    if (duplicate) {
      const metadata = duplicate.metadata as { idempotencyFingerprint?: string } | null;
      return metadata?.idempotencyFingerprint === fingerprint
        ? { kind: "duplicate" as const, entityId: duplicate.entityReference }
        : { kind: "conflict" as const };
    }
    const record = { id: id("evidence"), learnerId, pathwayId: context.pathway.id, moduleId: parsed.data.moduleId, taskId: parsed.data.taskId, title: parsed.data.title, type: parsed.data.type, description: parsed.data.description, fileName: parsed.data.fileName, createdBy: learnerId };
    await tx.insert(evidenceTable).values(record);
    await tx.insert(evidenceReviewsTable).values({ id: id("evidence-review"), evidenceId: record.id, status: "Under review", quality: { valid: false, relevant: false, sufficient: false, traceable: false }, createdBy: learnerId });
    const transition = await transitionLearningState({
      currentState: (latestTransition?.toState ?? "NOT_STARTED") as LearningState,
      targetState: "EVIDENCE_SUBMITTED",
      learnerId,
      pathwayId: context.pathway.id,
      programId: context.program.id,
      activityId: parsed.data.sourceActivityId,
      entityReference: record.id,
      reason: "Learner submitted evidence linked to a practice attempt",
      idempotencyKey: transitionKey,
      idempotencyFingerprint: fingerprint,
      references: { practiceAttemptId: attempt.id, evidenceId: record.id },
    }, { id: learnerId, role: "learner" }, tx);
    if (!transition.ok) throw new RejectedLearningTransition(transition);
    return { kind: "created" as const, entityId: record.id };
  });
  if (result.kind === "rejected") { res.status(result.transition.statusCode).json(result.transition.value); return; }
  if (result.kind === "conflict") { idempotencyConflict(res); return; }
  const response = (await evidenceRecords(learnerId)).find(item => item.id === result.entityId);
  if (!response) throw new Error(`Idempotent evidence result ${result.entityId} was not found`);
  res.status(result.kind === "duplicate" ? 200 : 201).json(CreateEvidenceResponse.parse(response));
});
router.post("/practice/tasks/:taskId/attempts", async (req, res): Promise<void> => {
  const params = CreatePracticeAttemptParams.safeParse(req.params), body = CreatePracticeAttemptBody.safeParse(req.body);
  if (!params.success) { bad(req, res, params.error.message); return; }
  if (!body.success) { bad(req, res, body.error.message); return; }
  const learnerId = await authorizeLearner(req, res);
  if (!learnerId) return;
  const context = await learnerContext(learnerId);
  const [task] = await db.select().from(practiceTasksTable).where(eq(practiceTasksTable.id, params.data.taskId));
  const [module] = task ? await db.select().from(modulesTable).where(eq(modulesTable.id, task.moduleId)) : [];
  const [latestTransition] = await db.select().from(learningTransitionEventsTable).where(and(
    eq(learningTransitionEventsTable.activityId, body.data.sourceActivityId),
    eq(learningTransitionEventsTable.learnerId, learnerId),
    eq(learningTransitionEventsTable.pathwayId, context.pathway.id),
  )).orderBy(desc(learningTransitionEventsTable.createdAt), desc(learningTransitionEventsTable.id)).limit(1);
  if (!task || !module || module.pathwayId !== context.pathway.id) { res.status(404).json({ error: "Practice task not found for the enrolled pathway" }); return; }
  const currentState = (latestTransition?.toState ?? "NOT_STARTED") as LearningState;
  const transitionKey = scopedIdempotencyKey("practice-attempt", learnerId, body.data.idempotencyKey);
  const fingerprint = digest({ taskId: task.id, reflection: body.data.reflection, outputSummary: body.data.outputSummary, sourceActivityId: body.data.sourceActivityId });
  const result = await learningWrite(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${transitionKey}))`);
    const [duplicate] = await tx.select().from(learningTransitionEventsTable).where(eq(learningTransitionEventsTable.idempotencyKey, transitionKey)).limit(1);
    if (duplicate) {
      const metadata = duplicate.metadata as { idempotencyFingerprint?: string } | null;
      if (metadata?.idempotencyFingerprint !== fingerprint) return { kind: "conflict" as const };
      const [existing] = await tx.select().from(practiceAttemptsTable).where(eq(practiceAttemptsTable.id, duplicate.entityReference)).limit(1);
      if (!existing) throw new Error(`Idempotent practice result ${duplicate.entityReference} was not found`);
      return { kind: "duplicate" as const, row: existing };
    }
    const [row] = await tx.insert(practiceAttemptsTable).values({ id: id("practice"), taskId: task.id, learnerId, pathwayId: context.pathway.id, reflection: body.data.reflection, outputSummary: body.data.outputSummary, status: "Submitted", createdBy: learnerId }).returning();
    if (!row) throw new Error("Practice attempt insert returned no row");
    const transition = await transitionLearningState({
      currentState,
      targetState: "PRACTICE_IN_PROGRESS",
      learnerId,
      pathwayId: context.pathway.id,
      programId: context.program.id,
      activityId: body.data.sourceActivityId,
      entityReference: row.id,
      reason: "Learner created a pathway-scoped practice attempt",
      idempotencyKey: transitionKey,
      idempotencyFingerprint: fingerprint,
      references: { practiceAttemptId: row.id },
    }, { id: learnerId, role: "learner" }, tx);
    if (!transition.ok) throw new RejectedLearningTransition(transition);
    return { kind: "created" as const, row };
  });
  if (result.kind === "rejected") { res.status(result.transition.statusCode).json(result.transition.value); return; }
  if (result.kind === "conflict") { idempotencyConflict(res); return; }
  const row = result.row;
  res.status(result.kind === "duplicate" ? 200 : 201).json(CreatePracticeAttemptResponse.parse({
    id: row.id,
    taskId: row.taskId,
    submittedAt: row.createdAt,
    status: row.status,
    reflection: row.reflection,
    outputSummary: row.outputSummary,
    pathwayId: row.pathwayId,
    sourceActivityId: body.data.sourceActivityId,
    nextAction: learningNextAction("PRACTICE_IN_PROGRESS", { activityId: body.data.sourceActivityId, taskId: task.id, practiceAttemptId: row.id }),
    feedback: null,
  }));
});
router.get("/gaps", async (req, res): Promise<void> => { const learnerId = await authorizeLearner(req, res); if (!learnerId) return; res.json(ListGapsResponse.parse(await gapRecords(learnerId))); }); router.get("/remediation", async (req, res): Promise<void> => { const learnerId = await authorizeLearner(req, res); if (!learnerId) return; res.json(ListRemediationResponse.parse(await remediationRecords(learnerId))); });
router.post("/remediation/:remediationId/complete", async (req, res): Promise<void> => { const parsed = CompleteRemediationParams.safeParse(req.params); if (!parsed.success) { bad(req, res, parsed.error.message); return; } const learnerId = await authorizeLearner(req, res); if (!learnerId) return; const context = await learnerContext(learnerId); const plan = (await remediationRecords(learnerId, context.pathway.id)).find((item) => item.id === parsed.data.remediationId); if (!plan) { res.status(404).json({ error: "Remediation plan not found" }); return; } const incompleteActivities = plan.activities.filter((activity) => activity.status !== "Completed"); if (incompleteActivities.length > 0) { req.log.warn({ remediationId: plan.id, incompleteActivityIds: incompleteActivities.map((activity) => activity.id) }, "Rejected remediation completion without recorded prerequisites"); res.status(409).json({ error: "REMEDIATION_PREREQUISITES_NOT_MET", message: "Complete every required remediation activity, re-practice, evidence review, and reassessment before closing this plan." }); return; } res.json(CompleteRemediationResponse.parse(plan)); });
router.get("/readiness", async (req, res): Promise<void> => { const learnerId = await authorizeLearner(req, res); if (!learnerId) return; res.json(GetLearnerReadinessResponse.parse(await readiness(await learnerContext(learnerId)))); });
router.get("/learner/journey", async (req, res): Promise<void> => { const learnerId = await authorizeLearner(req, res); if (!learnerId) return; const [timeline, view] = await Promise.all([pathwayTimeline(learnerId), readiness(await learnerContext(learnerId))]); res.json(GetLearnerJourneyResponse.parse([...timeline.steps, { id: "journey-current", pathwayId: timeline.context.pathway.id, pathwayName: timeline.context.pathway.name, label: "Current gate", description: view.currentGate.requirement, status: view.status, date: null, href: "/readiness" }])); });
router.get("/learner/learning-plan", async (req, res): Promise<void> => { const learnerId = await authorizeLearner(req, res); if (!learnerId) return; const [context, { modules }] = await Promise.all([learnerContext(learnerId), catalogue()]); const progress = await progressByModule(learnerId, context.pathway.id); res.json(GetLearnerLearningPlanResponse.parse(modules.filter((module) => module.pathwayId === context.pathway.id && progress(module.id).progress < 100).sort((a, b) => a.sequence - b.sequence).map((module, index) => ({ id: `plan-${module.id}`, module: moduleSummary(module, progress(module.id).progress, progress(module.id).status), priority: index === 0 ? "High" : "Normal", reason: "Continue pathway learning.", estimatedMinutes: 90, status: progress(module.id).status })))); });
router.get("/learner/dashboard", async (req, res): Promise<void> => { const learnerId = await authorizeLearner(req, res); if (!learnerId) return; const [context, { modules, tasks, enrollments }] = await Promise.all([learnerContext(learnerId), catalogue()]); const [view, gaps, evidence, progress] = await Promise.all([readiness(context), gapRecords(learnerId, context.pathway.id), evidenceRecords(learnerId, context.pathway.id), progressByModule(learnerId, context.pathway.id)]); const pathwayModules = modules.filter((module) => module.pathwayId === context.pathway.id).sort((a, b) => a.sequence - b.sequence); const current = pathwayModules.find((module) => progress(module.id).progress < 100) ?? pathwayModules[0]; const task = tasks.find((item) => item.moduleId === current.id); if (!current || !task) throw new Error(`Incomplete curriculum for ${context.pathway.name}`); res.json(GetLearnerDashboardResponse.parse({ learner: context.learner, program: { ...context.program, moduleCount: pathwayModules.length, learnerCount: new Set(enrollments.filter((item) => item.programId === context.program.id).map((item) => item.learnerId)).size }, pathway: view.pathway, capabilityProgress: Math.round(pathwayModules.reduce((sum, module) => sum + progress(module.id).progress, 0) / pathwayModules.length), readiness: view, currentLearning: moduleSummary(current, progress(current.id).progress, progress(current.id).status), currentPractice: { ...task, status: "Available" }, mainGap: gaps.find((gap) => gap.status !== "Resolved") ?? null, evidenceCounts: { total: evidence.length, valid: evidence.filter((item) => item.status === "Valid").length, underReview: evidence.filter((item) => item.status === "Under review").length, needsRevision: evidence.filter((item) => item.status === "Needs revision").length }, nextAction: { title: `Continue ${current.code}`, description: "Continue your active pathway learning.", href: `/modules/${current.id}`, priority: "High" } })); });
router.get("/passport", async (req, res): Promise<void> => { const learnerId = await authorizeLearner(req, res); if (!learnerId) return; const [timeline, attempts, pathways] = await Promise.all([pathwayTimeline(learnerId), db.select().from(assessmentAttemptsTable).where(and(eq(assessmentAttemptsTable.learnerId, learnerId), eq(assessmentAttemptsTable.decision, "Competent"))), db.select().from(pathwaysTable)]); const view = await readiness(timeline.context); if (!view.pathway) throw new Error(`Missing pathway catalogue for ${timeline.context.pathway.id}`); const map = new Map(pathways.map((item) => [item.id, item])); const m03 = attempts.find((attempt) => attempt.assessmentId === "assessment-m03"); const achievement = m03 ? { id: "achievement-m03", capability: "Electrical safety", level: "Verified", program: timeline.context.program.name, pathway: map.get(m03.pathwayId)?.name ?? "Unknown pathway", achievedAt: m03.createdAt, evidenceCount: (await evidenceRecords(learnerId, m03.pathwayId)).filter((item) => item.moduleId === "m03").length, status: "Achieved" as const } : null; res.json(GetCapabilityPassportResponse.parse({ learner: timeline.context.learner, pathway: view.pathway, headline: `${view.pathway.name} — Solar PV Technician capability passport`, subtitle: "A longitudinal record of verified practice and readiness.", readiness: view, achievements: achievement ? [achievement] : [], timeline: timeline.steps })); });
export default router;