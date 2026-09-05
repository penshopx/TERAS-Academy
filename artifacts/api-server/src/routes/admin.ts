// Route transaction adapters span Drizzle's database and transaction executor
// types; runtime operations are constrained by the generated Zod contracts.
// @ts-nocheck
import { Router, type IRouter } from "express";
import { and, desc, eq, sql } from "drizzle-orm";
import {
  CreateAdminCohortBody, CreateAdminCohortResponse, CreateAdminEnrollmentBody, CreateAdminEnrollmentResponse,
  CreateAdminPathwayBody, CreateAdminPathwayResponse, CreateAdminProgramBody, CreateAdminProgramResponse,
  CreateAdminUserBody, CreateAdminUserResponse, ListAdminAuditEventsResponse, ListAdminCohortsResponse,
  ListAdminEnrollmentsResponse, ListAdminPathwaysResponse, ListAdminProgramsResponse, ListAdminUsersResponse,
  ReplaceAdminUserRolesBody, ReplaceAdminUserRolesParams, ReplaceAdminUserRolesResponse,
  UpdateAdminCohortBody, UpdateAdminCohortParams, UpdateAdminCohortResponse, UpdateAdminEnrollmentBody,
  UpdateAdminEnrollmentParams, UpdateAdminEnrollmentResponse, UpdateAdminPathwayBody, UpdateAdminPathwayParams,
  UpdateAdminPathwayResponse, UpdateAdminProgramBody, UpdateAdminProgramParams, UpdateAdminProgramResponse,
  UpdateAdminUserBody, UpdateAdminUserParams, UpdateAdminUserResponse, GetAdminControlRoomResponse,
} from "@workspace/api-zod";
import {
  adminAuditEventsTable, assessmentAttemptsTable, cohortsTable, db, enrollmentsTable, evidenceReviewsTable,
  evidenceTable, pathwaysTable, peopleTable, personRolesTable, programsTable, reassessmentLinksTable,
  remediationActivitiesTable, remediationEventsTable, remediationPlansTable,
} from "@workspace/db";
import { authorizeAdmin, type AdminActor } from "../lib/authorization";
import { latestBy, trainerBottlenecks } from "../lib/trainer-bottlenecks";

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
async function activeAdminCount() { return (await db.select({ id: peopleTable.id }).from(peopleTable).innerJoin(personRolesTable, eq(personRolesTable.personId, peopleTable.id)).where(and(eq(peopleTable.status, "active"), eq(personRolesTable.role, "admin")))).length; }
async function user(id: string) {
  const [person] = await db.select().from(peopleTable).where(eq(peopleTable.id, id)); if (!person) return null;
  const roles = await db.select({ role: personRolesTable.role }).from(personRolesTable).where(eq(personRolesTable.personId, id));
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
router.get("/admin/users", async (req, res): Promise<void> => { if (!await authorizeAdmin(req, res)) return; const people = await db.select().from(peopleTable); res.json(ListAdminUsersResponse.parse((await Promise.all(people.map(p => user(p.id)))).filter(Boolean))); });
router.post("/admin/users", async (req, res): Promise<void> => { const actor = await authorizeAdmin(req, res); if (!actor) return; const input = parsed(CreateAdminUserBody, req.body, res); if (!input) return; try { const value = await db.transaction(async tx => { await tx.insert(peopleTable).values({ ...input, role: input.roles[0], createdBy: actor.clerkUserId }); await tx.insert(personRolesTable).values(input.roles.map(role => ({ personId: input.id, role, createdBy: actor.clerkUserId }))); const result = { ...input }; await audit(tx, actor, "create", "user", input.id, null, result); return result; }); res.status(201).json(CreateAdminUserResponse.parse(value)); } catch (error) { res.status(conflict(error) ? 409 : 400).json({ error: conflict(error) ? "User or Clerk identity already exists" : "Could not create user" }); } });
router.patch("/admin/users/:personId", async (req, res): Promise<void> => { const actor = await authorizeAdmin(req, res); const params = parsed(UpdateAdminUserParams, req.params, res); const input = parsed(UpdateAdminUserBody, req.body, res); if (!actor || !params || !input) return; const before = await user(params.personId); if (!before) { res.status(404).json({ error: "User not found" }); return; } if (input.status === "inactive" && before.roles.includes("admin") && await activeAdminCount() === 1) { res.status(409).json({ error: "Cannot deactivate the last active administrator" }); return; } try { const value = await db.transaction(async tx => { const [updated] = await tx.update(peopleTable).set(input).where(eq(peopleTable.id, params.personId)).returning(); const result = { ...updated, roles: before.roles }; await audit(tx as typeof db, actor, "update", "user", params.personId, before, result); return result; }); res.json(UpdateAdminUserResponse.parse(value)); } catch (error) { res.status(conflict(error) ? 409 : 400).json({ error: "Clerk identity or email already exists" }); } });
router.put("/admin/users/:personId/roles", async (req, res): Promise<void> => { const actor = await authorizeAdmin(req, res); const params = parsed(ReplaceAdminUserRolesParams, req.params, res); const input = parsed(ReplaceAdminUserRolesBody, req.body, res); if (!actor || !params || !input) return; const before = await user(params.personId); if (!before) { res.status(404).json({ error: "User not found" }); return; } if (before.roles.includes("admin") && !input.roles.includes("admin") && before.status === "active" && await activeAdminCount() === 1) { res.status(409).json({ error: "Cannot remove the last active administrator role" }); return; } const value = await db.transaction(async tx => { await tx.delete(personRolesTable).where(eq(personRolesTable.personId, params.personId)); await tx.insert(personRolesTable).values(input.roles.map(role => ({ personId: params.personId, role, createdBy: actor.clerkUserId }))); const result = { ...before, roles: input.roles }; await audit(tx as typeof db, actor, "replace_roles", "user", params.personId, before, result); return result; }); res.json(ReplaceAdminUserRolesResponse.parse(value)); });

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
router.get("/admin/control-room", async (req, res): Promise<void> => {
  if (!await authorizeAdmin(req, res)) return;
  const [
    learnerRoles, programs, cohorts, activeEnrollments, evidence, evidenceReviews,
    assessments, plans, activities, remediationEvents, reassessmentLinks,
  ] = await Promise.all([
    db.select({ personId: peopleTable.id }).from(peopleTable).innerJoin(personRolesTable, eq(personRolesTable.personId, peopleTable.id))
      .where(and(eq(peopleTable.status, "active"), eq(personRolesTable.role, "learner"))),
    db.select({ status: programsTable.status }).from(programsTable),
    db.select({ status: cohortsTable.status }).from(cohortsTable),
    db.select({
      enrollment: { id: enrollmentsTable.id, trainerId: enrollmentsTable.trainerId, assessorId: enrollmentsTable.assessorId },
      learner: { id: peopleTable.id },
      pathway: { id: pathwaysTable.id },
    }).from(enrollmentsTable)
      .innerJoin(peopleTable, eq(peopleTable.id, enrollmentsTable.learnerId))
      .innerJoin(pathwaysTable, eq(pathwaysTable.id, enrollmentsTable.pathwayId))
      .where(and(eq(enrollmentsTable.status, "active"), eq(peopleTable.status, "active"), sql`lower(${pathwaysTable.status}) = 'active'`)),
    db.select().from(evidenceTable),
    db.select().from(evidenceReviewsTable),
    db.select().from(assessmentAttemptsTable),
    db.select().from(remediationPlansTable),
    db.select().from(remediationActivitiesTable),
    db.select().from(remediationEventsTable),
    db.select().from(reassessmentLinksTable),
  ]);
  const evidenceState = latestBy(evidenceReviews, row => row.evidenceId);
  const activityState = latestBy(remediationEvents, row => row.activityId);
  const assessmentById = new Map(assessments.map(attempt => [attempt.id, attempt]));
  const planIdsWithOpenActivity = new Set(activities
    .filter(activity => activityState.get(activity.id)?.status !== "Completed")
    .map(activity => activity.planId));
  const active = activeEnrollments.map(context => ({
    enrollment: { id: context.enrollment.id },
    learner: context.learner,
    pathway: context.pathway,
  }));
  const bottlenecks = await trainerBottlenecks(active);
  const value = {
    asOf: new Date(),
    counts: {
      activeLearners: new Set(learnerRoles.map(row => row.personId)).size,
      activePrograms: programs.filter(row => row.status.toLowerCase() === "active").length,
      activeCohorts: cohorts.filter(row => row.status.toLowerCase() === "active").length,
      activeEnrollments: activeEnrollments.length,
    },
    assignmentGaps: {
      missingTrainer: activeEnrollments.filter(row => !row.enrollment.trainerId).length,
      missingAssessor: activeEnrollments.filter(row => !row.enrollment.assessorId).length,
      both: activeEnrollments.filter(row => !row.enrollment.trainerId && !row.enrollment.assessorId).length,
    },
    queues: {
      evidence: evidence.filter(row => evidenceState.get(row.id)?.status !== "Valid").length,
      assessment: assessments.filter(row => row.status !== "Completed").length,
      remediation: plans.filter(plan => planIdsWithOpenActivity.has(plan.id)).length,
      reassessment: reassessmentLinks.filter(link => {
        const attempt = assessmentById.get(link.reassessmentAttemptId);
        return !attempt || attempt.status !== "Completed" || attempt.decision !== "Competent";
      }).length,
    },
    bottlenecks,
  };
  res.json(GetAdminControlRoomResponse.parse(value));
});
export default router;