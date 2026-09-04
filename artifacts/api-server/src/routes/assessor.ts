import { Router, type IRouter } from "express";
import {
  GetAssessmentParams,
  GetAssessmentResponse,
  GetAssessorDashboardResponse,
  GetAssessorQueueResponse,
  ListAssessmentsResponse,
  SubmitAssessmentDecisionBody,
  SubmitAssessmentDecisionParams,
  SubmitAssessmentDecisionResponse,
} from "@workspace/api-zod";
import {
  assessmentAttemptsTable,
  assessmentCriteriaTable,
  assessmentsTable,
  criterionObservationsTable,
  db,
  gapEventsTable,
  gapsTable,
  modulesTable,
  peopleTable,
  readinessEventsTable,
  readinessGatesTable,
  remediationActivitiesTable,
  remediationEventsTable,
  remediationPlansTable,
} from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";
import {
  assessmentSummary,
  DEMO_LEARNER,
  evidenceRecords,
  gapRecords,
  learnerContext,
} from "../lib/teras";
import { authorizeWorkspaceRole } from "../lib/authorization";
import { enforceSafetyDecision } from "../lib/safety";

const router: IRouter = Router();
const id = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;

async function assessmentDetail(assessment: {
  id: string;
  moduleId: string;
  name: string;
  gateCode: string | null;
}) {
  const context = await learnerContext();
  const [criteria, attempts, observations, people] = await Promise.all([
    db
      .select()
      .from(assessmentCriteriaTable)
      .where(eq(assessmentCriteriaTable.assessmentId, assessment.id)),
    db
      .select()
      .from(assessmentAttemptsTable)
      .where(
        and(
          eq(assessmentAttemptsTable.assessmentId, assessment.id),
          eq(assessmentAttemptsTable.learnerId, DEMO_LEARNER),
          eq(assessmentAttemptsTable.pathwayId, context.pathway.id),
        ),
      ),
    db.select().from(criterionObservationsTable),
    db.select().from(peopleTable),
  ]);
  const sortedAttempts = attempts.sort(
    (a, b) => b.number - a.number || b.createdAt.getTime() - a.createdAt.getTime(),
  );
  const latestAttempt = sortedAttempts[0];
  const observationMap = new Map(
    observations
      .filter((observation) => observation.attemptId === latestAttempt?.id)
      .map((observation) => [observation.criterionId, observation]),
  );
  const personMap = new Map(people.map((person) => [person.id, person.name]));
  return {
    assessment: await assessmentSummary(assessment, context.learner.id, context.pathway.id),
    criteria: criteria.map((criterion) => {
      const observation = observationMap.get(criterion.id);
      return {
        id: criterion.id,
        code: criterion.code,
        label: criterion.label,
        layer: criterion.layer,
        critical: criterion.critical,
        score: observation?.score ?? null,
        observation: observation?.observation ?? null,
        evidenceId: observation?.evidenceId ?? null,
      };
    }),
    attempts: sortedAttempts.map((attempt) => ({
      id: attempt.id,
      number: attempt.number,
      submittedAt: attempt.createdAt,
      assessor: attempt.assessorId ? personMap.get(attempt.assessorId) ?? null : null,
      status: attempt.status,
      decision: attempt.decision,
    })),
  };
}

async function activeAssessments() {
  const [context, modules, assessments] = await Promise.all([
    learnerContext(),
    db.select().from(modulesTable),
    db.select().from(assessmentsTable),
  ]);
  const pathwayModules = modules.filter(
    (module) => module.pathwayId === context.pathway.id,
  );
  const moduleIds = new Set(pathwayModules.map((module) => module.id));
  const summaries = await Promise.all(
    assessments
      .filter((assessment) => moduleIds.has(assessment.moduleId))
      .map((assessment) => assessmentSummary(assessment, context.learner.id, context.pathway.id)),
  );
  return { context, pathwayModules, summaries };
}

router.get("/assessments", async (req, res): Promise<void> => {
  req.log.info("Listing assessments");
  const { summaries } = await activeAssessments();
  res.json(ListAssessmentsResponse.parse(summaries));
});

router.get("/assessments/:assessmentId", async (req, res): Promise<void> => {
  const parsed = GetAssessmentParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [assessment] = await db
    .select()
    .from(assessmentsTable)
    .where(eq(assessmentsTable.id, parsed.data.assessmentId));
  const { pathway } = await learnerContext();
  const [module] = assessment
    ? await db.select().from(modulesTable).where(eq(modulesTable.id, assessment.moduleId))
    : [];
  if (!assessment || module?.pathwayId !== pathway.id) {
    res.status(404).json({ error: "Assessment not found for the enrolled pathway" });
    return;
  }
  res.json(GetAssessmentResponse.parse(await assessmentDetail(assessment)));
});

router.get("/assessor/queue", async (_req, res): Promise<void> => {
  const { context, pathwayModules, summaries } = await activeAssessments();
  res.json(
    GetAssessorQueueResponse.parse(
      summaries
        .filter((summary) => summary.status !== "Completed" || summary.criticalFailure)
        .map((summary) => ({
          id: summary.id,
          kind: "Assessment",
          learnerName: context.learner.name,
          moduleName:
            pathwayModules.find((module) => module.id === summary.moduleId)?.name ?? "Module",
          pathwayId: context.pathway.id,
          pathwayName: context.pathway.name,
          title: summary.name,
          status: summary.status,
          priority: summary.criticalFailure ? "Critical" : "Normal",
          updatedAt: new Date(),
        })),
    ),
  );
});

router.get("/assessor/dashboard", async (_req, res): Promise<void> => {
  const [{ context, pathwayModules, summaries }, evidence, gaps] = await Promise.all([
    activeAssessments(),
    evidenceRecords(),
    gapRecords(),
  ]);
  const [assessor] = await db
    .select()
    .from(peopleTable)
    .where(eq(peopleTable.id, context.enrollment.assessorId!));
  const recentActivity = summaries
    .filter((summary) => summary.status !== "Completed")
    .map((summary) => ({
      id: summary.id,
      kind: "Assessment",
      learnerName: context.learner.name,
      moduleName:
        pathwayModules.find((module) => module.id === summary.moduleId)?.name ?? "Module",
      pathwayId: context.pathway.id,
      pathwayName: context.pathway.name,
      title: summary.name,
      status: summary.status,
      priority: summary.criticalFailure ? "Critical" : "Normal",
      updatedAt: new Date(),
    }));
  res.json(
    GetAssessorDashboardResponse.parse({
      assessor,
      pendingAssessmentCount: summaries.filter(
        (summary) => summary.status !== "Completed",
      ).length,
      pendingEvidenceCount: evidence.filter((item) => item.status === "Under review").length,
      reassessmentCount: summaries.filter((summary) => summary.criticalFailure).length,
      blockedGateCount: gaps.filter(
        (gap) => gap.status !== "Resolved" && gap.severity === "Critical",
      ).length,
      recentActivity,
    }),
  );
});

router.post(
  "/assessor/assessments/:assessmentId/decision",
  async (req, res): Promise<void> => {
    const params = SubmitAssessmentDecisionParams.safeParse(req.params);
    if (!params.success) {
      req.log.warn("Invalid assessor decision parameters");
      res.status(400).json({ error: params.error.message });
      return;
    }
    const body = SubmitAssessmentDecisionBody.safeParse(req.body);
    if (!body.success) {
      req.log.warn("Invalid assessor decision body");
      res.status(400).json({ error: body.error.message });
      return;
    }
    const assessorId = await authorizeWorkspaceRole(req, res, "assessor");
    if (!assessorId) return;

    const [assessment] = await db
      .select()
      .from(assessmentsTable)
      .where(eq(assessmentsTable.id, params.data.assessmentId));
    if (!assessment) {
      res.status(404).json({ error: "Assessment not found" });
      return;
    }
    const context = await learnerContext();
    if (context.enrollment.assessorId !== assessorId) {
      res.status(403).json({ error: "You are not assigned to this active learner pathway" });
      return;
    }
    const [assessmentModule] = await db
      .select()
      .from(modulesTable)
      .where(eq(modulesTable.id, assessment.moduleId));
    if (
      !assessmentModule ||
      assessmentModule.programId !== context.enrollment.programId ||
      assessmentModule.pathwayId !== context.pathway.id
    ) {
      req.log.warn(
        { assessmentId: assessment.id, programId: context.enrollment.programId },
        "Assessment is outside the learner enrollment",
      );
      res.status(403).json({ error: "Assessment is outside the learner's active pathway" });
      return;
    }

    const criteria = await db
      .select()
      .from(assessmentCriteriaTable)
      .where(eq(assessmentCriteriaTable.assessmentId, assessment.id));
    const inputs = new Map(body.data.criteria.map((item) => [item.criterionId, item]));
    if (
      inputs.size !== body.data.criteria.length ||
      criteria.some((criterion) => !inputs.has(criterion.id)) ||
      inputs.size !== criteria.length
    ) {
      res.status(400).json({ error: "A score is required for every assessment criterion" });
      return;
    }
    const { decision, criticalFailure } = enforceSafetyDecision(
      criteria.map((criterion) => ({
        critical: criterion.critical,
        score: inputs.get(criterion.id)!.score,
      })),
      body.data.decision,
    );
    const attemptId = id("assessment-attempt");

    await db.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext(${assessment.id}), hashtext(${context.learner.id}))`,
      );
      const attempts = await tx
        .select()
        .from(assessmentAttemptsTable)
        .where(
          and(
            eq(assessmentAttemptsTable.assessmentId, assessment.id),
            eq(assessmentAttemptsTable.learnerId, context.learner.id),
            eq(assessmentAttemptsTable.pathwayId, context.pathway.id),
          ),
        );
      await tx.insert(assessmentAttemptsTable).values({
        id: attemptId,
        assessmentId: assessment.id,
        learnerId: context.learner.id,
        pathwayId: context.pathway.id,
        number: Math.max(0, ...attempts.map((attempt) => attempt.number)) + 1,
        assessorId,
        status: decision === "Competent" ? "Completed" : "Needs reassessment",
        decision,
        decisionRationale: body.data.observation,
        createdBy: assessorId,
      });
      await tx.insert(criterionObservationsTable).values(
        body.data.criteria.map((item) => ({
          id: id("criterion-observation"),
          attemptId,
          criterionId: item.criterionId,
          score: item.score,
          observation: item.observation,
          evidenceId: item.evidenceId,
          createdBy: assessorId,
        })),
      );
      const moduleGaps = await tx
        .select()
        .from(gapsTable)
        .where(
          and(
            eq(gapsTable.moduleId, assessment.moduleId),
            eq(gapsTable.learnerId, context.learner.id),
            eq(gapsTable.pathwayId, context.pathway.id),
          ),
        );
      let remediationPrerequisitesMet = true;
      if (moduleGaps.length) {
        const plans = await tx.select().from(remediationPlansTable);
        const gapIds = new Set(moduleGaps.map((gap) => gap.id));
        const planIds = new Set(
          plans.filter((plan) => gapIds.has(plan.gapId)).map((plan) => plan.id),
        );
        const activities = (await tx.select().from(remediationActivitiesTable)).filter(
          (activity) => planIds.has(activity.planId),
        );
        if (activities.length) {
          const activityIds = new Set(activities.map((activity) => activity.id));
          const events = (await tx.select().from(remediationEventsTable))
            .filter((event) => activityIds.has(event.activityId))
            .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
          const latestStatus = new Map<string, string>();
          for (const event of events) {
            if (!latestStatus.has(event.activityId)) latestStatus.set(event.activityId, event.status);
          }
          remediationPrerequisitesMet = activities.every(
            (activity) => latestStatus.get(activity.id) === "Completed",
          );
        }
        await tx.insert(gapEventsTable).values(
          moduleGaps.map((gap) => ({
            id: id("gap-event"),
            gapId: gap.id,
            status: decision === "Competent" && remediationPrerequisitesMet ? "Resolved" : "Open",
            createdBy: assessorId,
          })),
        );
        if (activities.length) {
          if (decision !== "Competent") {
            await tx.insert(remediationEventsTable).values(
              activities.map((activity) => ({
                id: id("remediation-event"),
                activityId: activity.id,
                status: "In progress",
                createdBy: assessorId,
              })),
            );
          }
        }
      }
      if (assessment.gateCode) {
        const [gate] = await tx
          .select()
          .from(readinessGatesTable)
          .where(
            and(
              eq(readinessGatesTable.programId, context.enrollment.programId),
              eq(readinessGatesTable.pathwayId, context.pathway.id),
              eq(readinessGatesTable.code, assessment.gateCode),
            ),
          );
        if (gate) {
          await tx.insert(readinessEventsTable).values({
            id: id("readiness-event"),
            enrollmentId: context.enrollment.id,
            pathwayId: context.pathway.id,
            gateId: gate.id,
            status: decision === "Competent" && remediationPrerequisitesMet ? "Passed" : "In progress",
            score: Math.round(
              (body.data.criteria.reduce((sum, item) => sum + item.score, 0) /
                body.data.criteria.length /
                3) *
                100,
            ),
            blockers:
              decision === "Competent" && remediationPrerequisitesMet
                ? []
                : [
                    criticalFailure
                      ? `Critical safety criterion failed in ${assessment.name}`
                      : decision === "Competent"
                        ? `Remediation prerequisites are not complete for ${assessment.name}`
                        : `Internal evaluation recommends further reinforcement for ${assessment.name}`,
                  ],
            createdBy: assessorId,
          });
        }
      }
    });

    req.log.info(
      { assessmentId: assessment.id, decision, criticalFailure },
      "Recorded assessor decision",
    );
    res
      .status(201)
      .json(SubmitAssessmentDecisionResponse.parse(await assessmentDetail(assessment)));
  },
);

export default router;