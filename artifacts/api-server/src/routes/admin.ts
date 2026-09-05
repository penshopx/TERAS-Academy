// Route transaction adapters span Drizzle's database and transaction executor
// types; runtime operations are constrained by the generated Zod contracts.
// @ts-nocheck
import { Router, type IRouter } from "express";
import { and, desc, eq } from "drizzle-orm";
import {
  CreateAdminCohortBody, CreateAdminCohortResponse, CreateAdminEnrollmentBody, CreateAdminEnrollmentResponse,
  CreateAdminPathwayBody, CreateAdminPathwayResponse, CreateAdminProgramBody, CreateAdminProgramResponse,
  CreateAdminUserBody, CreateAdminUserResponse, GetAdminOperationalSummaryResponse, ListAdminAuditEventsResponse, ListAdminCohortsResponse,
  ListAdminEnrollmentsResponse, ListAdminPathwaysResponse, ListAdminProgramsResponse, ListAdminUsersResponse,
  ReplaceAdminUserRolesBody, ReplaceAdminUserRolesParams, ReplaceAdminUserRolesResponse,
  UpdateAdminCohortBody, UpdateAdminCohortParams, UpdateAdminCohortResponse, UpdateAdminEnrollmentBody,
  UpdateAdminEnrollmentParams, UpdateAdminEnrollmentResponse, UpdateAdminPathwayBody, UpdateAdminPathwayParams,
  UpdateAdminPathwayResponse, UpdateAdminProgramBody, UpdateAdminProgramParams, UpdateAdminProgramResponse,
  UpdateAdminUserBody, UpdateAdminUserParams, UpdateAdminUserResponse,
} from "@workspace/api-zod";
import {
  adminAuditEventsTable, assessmentAttemptsTable, cohortsTable, db, enrollmentsTable, evidenceReviewsTable,
  evidenceTable, gapsTable, pathwaysTable, peopleTable, personRolesTable, programsTable, reassessmentLinksTable,
  remediationActivitiesTable, remediationEventsTable, remediationPlansTable,
} from "@workspace/db";
import { authorizeAdmin, type AdminActor } from "../lib/authorization";
import {
  createManagedUser,
  replaceManagedUserRoles,
  updateManagedUser,
} from "@workspace/db/admin-membership";

const router: IRouter = Router();
const conflict = (error: unknown) => String(error).includes("duplicate") || String(error).includes("unique");
const normalizeLifecycleRows = (rows: any[]) => rows.map(row => ({
  ...row,
  status: typeof row.status === "string" ? row.status.toLowerCase() : row.status,
}));
const parsed = <T>(schema: { safeParse(value: unknown): { success: boolean; data?: T; error?: { message: string } } }, value: unknown, res: any): T | null => {
  const result = schema.safeParse(value); if (!result.success) { res.status(400).json({ error: result.error?.message }); return null; } return result.data!;
};
async function audit(tx: any, actor: AdminActor, action: string, entityType: string, entityId: string, before: unknown, after: unknown) {
  await tx.insert(adminAuditEventsTable).values({ id: crypto.randomUUID(), actorPersonId: actor.personId, actorClerkUserId: actor.clerkUserId, action, entityType, entityId, before, after, createdBy: actor.clerkUserId });
}
async function user(id: string, executor: any = db) {
  const [person] = await executor.select().from(peopleTable).where(eq(peopleTable.id, id)); if (!person) return null;
  const roles = await executor.select({ role: personRolesTable.role }).from(personRolesTable).where(eq(personRolesTable.personId, id));
  return { ...person, roles: roles.map(item => item.role) };
}
async function enrollmentValid(input: { learnerId: string; programId: string; pathwayId: string; trainerId?: string | null; assessorId?: string | null; cohortId?: string | null }) {
  const [learner, program, pathway] = await Promise.all([
    db.select().from(peopleTable).where(and(eq(peopleTable.id, input.learnerId), eq(peopleTable.status, "active"))).limit(1),
    db.select().from(programsTable).where(and(eq(programsTable.id, input.programId), eq(programsTable.status, "active"))).limit(1),
    db.select().from(pathwaysTable).where(and(eq(pathwaysTable.id, input.pathwayId), eq(pathwaysTable.programId, input.programId), eq(pathwaysTable.status, "active"))).limit(1),
  ]);
  if (!learner[0] || !program[0] || !pathway[0]) return "Learner, active program, and pathway must exist and share a program";
  if (input.cohortId) { const [cohort] = await db.select().from(cohortsTable).where(and(eq(cohortsTable.id, input.cohortId), eq(cohortsTable.programId, input.programId), eq(cohortsTable.status, "active"))); if (!cohort) return "Cohort must be active and belong to the enrollment program"; }
  for (const [id, role] of [[input.trainerId, "trainer"], [input.assessorId, "assessor"]] as const) if (id) {
    const [match] = await db.select().from(personRolesTable).innerJoin(peopleTable, eq(peopleTable.id, personRolesTable.personId)).where(and(eq(personRolesTable.personId, id), eq(personRolesTable.role, role), eq(peopleTable.status, "active"))); if (!match) return `${role} must be an active person with that role`;
  }
  return null;
}
const latestBy = <T extends { createdAt: Date }>(rows: T[], key: (row: T) => string) => {
  const result = new Map<string, T>();
  for (const row of rows) {
    const previous = result.get(key(row));
    if (!previous || row.createdAt > previous.createdAt) result.set(key(row), row);
  }
  return result;
};
const latestAssessmentAttempts = <T extends { assessmentId: string; learnerId: string; pathwayId: string; number: number; createdAt: Date }>(rows: T[]) => {
  const result = new Map<string, T>();
  for (const row of rows) {
    const key = `${row.assessmentId}:${row.learnerId}:${row.pathwayId}`;
    const previous = result.get(key);
    if (!previous || row.number > previous.number || (row.number === previous.number && row.createdAt > previous.createdAt)) result.set(key, row);
  }
  return result;
};

router.get("/admin/summary", async (req, res): Promise<void> => {
  if (!await authorizeAdmin(req, res)) return;
  const [
    roles, people, programs, pathways, cohorts, enrollments, evidence, evidenceReviews, attempts,
    gaps, remediationPlans, remediationActivities, remediationEvents, reassessmentLinks,
  ] = await Promise.all([
    db.select().from(personRolesTable), db.select().from(peopleTable), db.select().from(programsTable),
    db.select().from(pathwaysTable), db.select().from(cohortsTable), db.select().from(enrollmentsTable), db.select().from(evidenceTable),
    db.select().from(evidenceReviewsTable), db.select().from(assessmentAttemptsTable),
    db.select().from(gapsTable),
    db.select().from(remediationPlansTable), db.select().from(remediationActivitiesTable),
    db.select().from(remediationEventsTable), db.select().from(reassessmentLinksTable),
  ]);
  const activePeople = new Set(people.filter(person => person.status === "active").map(person => person.id));
  const activeEnrollments = enrollments.filter(enrollment => enrollment.status === "active" && activePeople.has(enrollment.learnerId));
  const activeContexts = new Set(activeEnrollments.map(enrollment => `${enrollment.learnerId}:${enrollment.pathwayId}`));
  const enrollmentByContext = new Map(activeEnrollments.map(enrollment => [`${enrollment.learnerId}:${enrollment.pathwayId}`, enrollment]));
  const peopleById = new Map(people.map(person => [person.id, person]));
  const pathwaysById = new Map(pathways.map(pathway => [pathway.id, pathway]));
  const inActiveContext = (row: { learnerId: string; pathwayId: string }) => activeContexts.has(`${row.learnerId}:${row.pathwayId}`);
  const queueItem = (row: { id: string; learnerId: string; pathwayId: string; createdAt: Date }, title: string, status: string) => {
    const enrollment = enrollmentByContext.get(`${row.learnerId}:${row.pathwayId}`);
    const learner = peopleById.get(row.learnerId);
    const pathway = pathwaysById.get(row.pathwayId);
    const trainer = enrollment?.trainerId ? peopleById.get(enrollment.trainerId) : undefined;
    const assessor = enrollment?.assessorId ? peopleById.get(enrollment.assessorId) : undefined;
    return {
      id: row.id, title, status,
      learnerId: row.learnerId, learnerName: learner?.name ?? row.learnerId,
      pathwayId: row.pathwayId, pathwayName: pathway?.name ?? row.pathwayId,
      trainerId: enrollment?.trainerId ?? null, trainerName: trainer?.name ?? null,
      assessorId: enrollment?.assessorId ?? null, assessorName: assessor?.name ?? null,
      createdAt: row.createdAt,
    };
  };
  const learners = new Set(roles.filter(role => role.role === "learner" && activePeople.has(role.personId)).map(role => role.personId)).size;
  const latestEvidenceReviews = latestBy(evidenceReviews, review => review.evidenceId);
  const evidenceItems = evidence
    .filter(item => inActiveContext(item) && latestEvidenceReviews.get(item.id)?.status === "Under review")
    .map(item => queueItem(item, item.title, "Under review"));
  const activeAttempts = attempts.filter(inActiveContext);
  const latestAttempts = latestAssessmentAttempts(activeAttempts);
  const assessmentItems = [...latestAttempts.values()]
    .filter(attempt => !attempt.decision)
    .map(attempt => queueItem(attempt, `Assessment attempt #${attempt.number}`, attempt.status));
  const latestRemediationEvents = latestBy(remediationEvents, event => event.activityId);
  const planActivities = new Map<string, typeof remediationActivities>();
  for (const activity of remediationActivities) planActivities.set(activity.planId, [...(planActivities.get(activity.planId) ?? []), activity]);
  const activeGapIds = new Set(gaps.filter(inActiveContext).map(gap => gap.id));
  const openRemediationPlanIds = new Set(remediationPlans.filter(plan => activeGapIds.has(plan.gapId) && (() => {
    const activities = planActivities.get(plan.id) ?? [];
    return activities.length > 0 && activities.some(activity => latestRemediationEvents.get(activity.id)?.status !== "Completed");
  })()).map(plan => plan.id));
  const gapsById = new Map(gaps.map(gap => [gap.id, gap]));
  const remediationItems = remediationPlans
    .filter(plan => openRemediationPlanIds.has(plan.id))
    .flatMap(plan => {
      const gap = gapsById.get(plan.gapId);
      return gap ? [queueItem({ ...plan, learnerId: gap.learnerId, pathwayId: gap.pathwayId }, plan.title, "Aktif")] : [];
    });
  const attemptById = new Map(attempts.map(attempt => [attempt.id, attempt]));
  const latestReassessmentByPlan = new Map<string, typeof reassessmentLinks[number]>();
  for (const link of reassessmentLinks.filter(link => inActiveContext(link) && activeGapIds.has(link.originalGapId))) {
    const attempt = attemptById.get(link.reassessmentAttemptId);
    if (!attempt) continue;
    const previousLink = latestReassessmentByPlan.get(link.remediationPlanId);
    const previous = previousLink ? attemptById.get(previousLink.reassessmentAttemptId) : undefined;
    if (!previous || attempt.number > previous.number || (attempt.number === previous.number && attempt.createdAt > previous.createdAt)) latestReassessmentByPlan.set(link.remediationPlanId, link);
  }
  const reassessmentItems = [...latestReassessmentByPlan.values()]
    .filter(link => attemptById.get(link.reassessmentAttemptId)?.decision !== "Competent")
    .map(link => {
      const attempt = attemptById.get(link.reassessmentAttemptId)!;
      return queueItem(attempt, `Reassessment attempt #${attempt.number}`, attempt.decision ?? attempt.status);
    });
  const trainerMissing = activeEnrollments.filter(enrollment => !enrollment.trainerId).length;
  const assessorMissing = activeEnrollments.filter(enrollment => !enrollment.assessorId).length;
  const queues = [
    { id: "evidence", label: "Evidence menunggu review", count: evidenceItems.length, description: "Evidence dengan review terbaru masih Under review.", targetTab: "enrollments", items: evidenceItems },
    { id: "assessment", label: "Assessment menunggu keputusan", count: assessmentItems.length, description: "Attempt terbaru belum memiliki keputusan assessor.", targetTab: "enrollments", items: assessmentItems },
    { id: "remediation", label: "Remediation aktif", count: remediationItems.length, description: "Rencana dengan aktivitas yang belum seluruhnya selesai.", targetTab: "enrollments", items: remediationItems },
    { id: "reassessment", label: "Reassessment belum kompeten", count: reassessmentItems.length, description: "Reassessment terhubung yang masih perlu keputusan kompeten.", targetTab: "enrollments", items: reassessmentItems },
  ] as const;
  const largestQueue = queues.reduce((largest, queue) => queue.count > largest.count ? queue : largest, queues[0]);
  const bottleneck = largestQueue.count > 0
    ? { stage: largestQueue.id, label: largestQueue.label, count: largestQueue.count, description: `Tahap ${largestQueue.label.toLowerCase()} adalah antrean lifecycle terbesar saat ini.`, targetTab: "enrollments" as const }
    : { stage: "clear" as const, label: "Tidak ada antrean lifecycle", count: 0, description: "Tidak ada pekerjaan lifecycle yang tertahan saat ringkasan dibuat.", targetTab: "enrollments" as const };
  const actions = [
    ...(trainerMissing ? [{ id: "assign-trainers", label: "Lengkapi assignment trainer", description: `${trainerMissing} enrollment aktif belum memiliki trainer.`, count: trainerMissing, targetTab: "enrollments" as const, urgency: "critical" as const }] : []),
    ...(assessorMissing ? [{ id: "assign-assessors", label: "Lengkapi assignment assessor", description: `${assessorMissing} enrollment aktif belum memiliki assessor.`, count: assessorMissing, targetTab: "enrollments" as const, urgency: "critical" as const }] : []),
    ...queues.filter(queue => queue.count > 0).map(queue => ({ id: `resolve-${queue.id}`, label: `Tindak lanjuti ${queue.label.toLowerCase()}`, description: queue.description, count: queue.count, targetTab: "enrollments" as const, urgency: queue.count === largestQueue.count ? "attention" as const : "normal" as const })),
    ...(!programs.some(program => program.status === "active") ? [{ id: "create-program", label: "Aktifkan program pertama", description: "Belum ada program aktif untuk enrollment baru.", count: 0, targetTab: "programs" as const, urgency: "attention" as const }] : []),
    ...(!cohorts.some(cohort => cohort.status === "active") ? [{ id: "create-cohort", label: "Siapkan cohort aktif", description: "Belum ada cohort aktif untuk pengelompokan learner.", count: 0, targetTab: "cohorts" as const, urgency: "normal" as const }] : []),
  ].slice(0, 6);
  res.json(GetAdminOperationalSummaryResponse.parse({
    metrics: [
      { id: "learners", label: "Learner aktif", value: learners, description: "Pengguna aktif dengan peran learner." },
      { id: "programs", label: "Program aktif", value: programs.filter(program => program.status === "active").length, description: "Program yang siap menerima enrollment." },
      { id: "cohorts", label: "Cohort aktif", value: cohorts.filter(cohort => cohort.status === "active").length, description: "Cohort yang saat ini aktif." },
      { id: "enrollments", label: "Enrollment aktif", value: activeEnrollments.length, description: "Learner yang masih berada dalam lifecycle aktif." },
    ],
    incompleteAssignments: { trainer: trainerMissing, assessor: assessorMissing, total: activeEnrollments.filter(enrollment => !enrollment.trainerId || !enrollment.assessorId).length },
    queues, bottleneck, actions, generatedAt: new Date(),
  }));
});
router.get("/admin/users", async (req, res): Promise<void> => { if (!await authorizeAdmin(req, res)) return; const people = await db.select().from(peopleTable); res.json(ListAdminUsersResponse.parse((await Promise.all(people.map(p => user(p.id)))).filter(Boolean))); });
router.post("/admin/users", async (req, res): Promise<void> => { const actor = await authorizeAdmin(req, res); if (!actor) return; const input = parsed(CreateAdminUserBody, req.body, res); if (!input) return; try { const value = await createManagedUser(input, actor); res.status(201).json(CreateAdminUserResponse.parse(value)); } catch (error) { res.status(conflict(error) ? 409 : 400).json({ error: conflict(error) ? "User or Clerk identity already exists" : "Could not create user" }); } });
router.patch("/admin/users/:personId", async (req, res): Promise<void> => { const actor = await authorizeAdmin(req, res); const params = parsed(UpdateAdminUserParams, req.params, res); const input = parsed(UpdateAdminUserBody, req.body, res); if (!actor || !params || !input) return; try { const outcome = await updateManagedUser(params.personId, input, actor, { activeAdminFixtureIds: req.integrationActiveAdminFixtureIds }); if (outcome.kind === "not_found") { res.status(404).json({ error: "User not found" }); return; } if (outcome.kind === "last_admin") { res.status(409).json({ error: "Cannot deactivate the last active administrator" }); return; } res.json(UpdateAdminUserResponse.parse(outcome.value)); } catch (error) { res.status(conflict(error) ? 409 : 400).json({ error: "Clerk identity or email already exists" }); } });
router.put("/admin/users/:personId/roles", async (req, res): Promise<void> => { const actor = await authorizeAdmin(req, res); const params = parsed(ReplaceAdminUserRolesParams, req.params, res); const input = parsed(ReplaceAdminUserRolesBody, req.body, res); if (!actor || !params || !input) return; const outcome = await replaceManagedUserRoles(params.personId, input.roles, actor, { activeAdminFixtureIds: req.integrationActiveAdminFixtureIds }); if (outcome.kind === "not_found") { res.status(404).json({ error: "User not found" }); return; } if (outcome.kind === "last_admin") { res.status(409).json({ error: "Cannot remove the last active administrator role" }); return; } res.json(ReplaceAdminUserRolesResponse.parse(outcome.value)); });

function lifecycle(prefix: string, table: any, listSchema: any, createSchema: any, createResponse: any, updateParams: any, updateBody: any, updateResponse: any, idColumn: any, entity: string) {
  router.get(`/admin/${prefix}`, async (req, res): Promise<void> => { if (!await authorizeAdmin(req, res)) return; res.json(listSchema.parse(normalizeLifecycleRows(await db.select().from(table)))); });
  router.post(`/admin/${prefix}`, async (req, res): Promise<void> => { const actor = await authorizeAdmin(req, res); const input = parsed(createSchema, req.body, res); if (!actor || !input) return; try { const value = await db.transaction(async tx => { const rows = await tx.insert(table).values({ ...input, createdBy: actor.clerkUserId }).returning() as any[]; await audit(tx as typeof db, actor, "create", entity, rows[0].id, null, rows[0]); return rows[0]; }); res.status(201).json(createResponse.parse(value)); } catch (error) { res.status(conflict(error) ? 409 : 400).json({ error: "Conflicting or invalid lifecycle record" }); } });
  router.patch(`/admin/${prefix}/:${entity}Id`, async (req, res): Promise<void> => { const actor = await authorizeAdmin(req, res); const params = parsed(updateParams, req.params, res); const input = parsed(updateBody, req.body, res); if (!actor || !params || !input) return; const id = (params as any)[`${entity}Id`]; const [before] = await db.select().from(table).where(eq(idColumn, id)); if (!before) { res.status(404).json({ error: `${entity} not found` }); return; } try { const value = await db.transaction(async tx => { const rows = await tx.update(table).set(input).where(eq(idColumn, id)).returning() as any[]; await audit(tx as typeof db, actor, "update", entity, id, before, rows[0]); return rows[0]; }); res.json(updateResponse.parse(value)); } catch (error) { res.status(conflict(error) ? 409 : 400).json({ error: "Conflicting or invalid lifecycle record" }); } });
}
lifecycle("programs", programsTable, ListAdminProgramsResponse, CreateAdminProgramBody, CreateAdminProgramResponse, UpdateAdminProgramParams, UpdateAdminProgramBody, UpdateAdminProgramResponse, programsTable.id, "program");
lifecycle("pathways", pathwaysTable, ListAdminPathwaysResponse, CreateAdminPathwayBody, CreateAdminPathwayResponse, UpdateAdminPathwayParams, UpdateAdminPathwayBody, UpdateAdminPathwayResponse, pathwaysTable.id, "pathway");
lifecycle("cohorts", cohortsTable, ListAdminCohortsResponse, CreateAdminCohortBody, CreateAdminCohortResponse, UpdateAdminCohortParams, UpdateAdminCohortBody, UpdateAdminCohortResponse, cohortsTable.id, "cohort");
router.get("/admin/enrollments", async (req, res): Promise<void> => { if (!await authorizeAdmin(req, res)) return; res.json(ListAdminEnrollmentsResponse.parse(await db.select().from(enrollmentsTable))); });
router.post("/admin/enrollments", async (req, res): Promise<void> => { const actor = await authorizeAdmin(req, res); const input = parsed(CreateAdminEnrollmentBody, req.body, res); if (!actor || !input) return; const error = await enrollmentValid(input); if (error) { res.status(409).json({ error }); return; } try { const value = await db.transaction(async tx => { const [record] = await tx.insert(enrollmentsTable).values({ ...input, createdBy: actor.clerkUserId }).returning(); await audit(tx as typeof db, actor, "create", "enrollment", record.id, null, record); return record; }); res.status(201).json(CreateAdminEnrollmentResponse.parse(value)); } catch { res.status(409).json({ error: "Enrollment conflicts with existing lifecycle data" }); } });
router.patch("/admin/enrollments/:enrollmentId", async (req, res): Promise<void> => { const actor = await authorizeAdmin(req, res); const params = parsed(UpdateAdminEnrollmentParams, req.params, res); const input = parsed(UpdateAdminEnrollmentBody, req.body, res); if (!actor || !params || !input) return; const [before] = await db.select().from(enrollmentsTable).where(eq(enrollmentsTable.id, params.enrollmentId)); if (!before) { res.status(404).json({ error: "Enrollment not found" }); return; } const candidate = { ...before, ...input }; const error = await enrollmentValid(candidate); if (error) { res.status(409).json({ error }); return; } try { const value = await db.transaction(async tx => { const [record] = await tx.update(enrollmentsTable).set(input).where(eq(enrollmentsTable.id, params.enrollmentId)).returning(); await audit(tx as typeof db, actor, "update", "enrollment", record.id, before, record); return record; }); res.json(UpdateAdminEnrollmentResponse.parse(value)); } catch { res.status(409).json({ error: "Enrollment conflicts with existing lifecycle data" }); } });
router.get("/admin/audit", async (req, res): Promise<void> => { if (!await authorizeAdmin(req, res)) return; res.json(ListAdminAuditEventsResponse.parse(await db.select().from(adminAuditEventsTable).orderBy(desc(adminAuditEventsTable.createdAt)))); });
export default router;