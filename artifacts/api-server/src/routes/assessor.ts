import { Router, type IRouter } from "express";
import {
  GetAssessmentParams,
  GetAssessmentQueryParams,
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
  evidenceTable,
  gapEventsTable,
  gapsTable,
  courseModulesTable,
  learningActivitiesTable,
  learningTransitionEventsTable,
  lessonsTable,
  modulesTable,
  peopleTable,
  readinessEventsTable,
  readinessGatesTable,
  remediationActivitiesTable,
  remediationEventsTable,
  remediationPlansTable,
  reassessmentLinksTable,
} from "@workspace/db";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import {
  assessmentSummary,
  activeLearnerPathwayContext,
  evidenceRecords,
  gapRecords,
  learnerContext,
  workspaceAssignmentContexts,
} from "../lib/teras";
import { authorizeLearner, authorizeLearningActor, authorizeWorkspaceRole, type LearnerContext } from "../lib/authorization";
import { enforceSafetyDecision } from "../lib/safety";

const router: IRouter = Router();
const id = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;

async function assessmentDetail(assessment: {
  id: string;
  moduleId: string;
  name: string;
  gateCode: string | null;
}, context: LearnerContext) {
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
          eq(assessmentAttemptsTable.learnerId, context.learner.id),
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

async function activeAssessments(requestContext?: LearnerContext) {
  const context = requestContext ?? await learnerContext();
  const [modules, assessments] = await Promise.all([
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
  const learnerId = await authorizeLearner(req, res);
  if (!learnerId) return;
  const context = await learnerContext(learnerId);
  const { summaries } = await activeAssessments(context);
  res.json(ListAssessmentsResponse.parse(summaries));
});

router.get("/assessments/:assessmentId", async (req, res): Promise<void> => {
  const parsed = GetAssessmentParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const query = GetAssessmentQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }
  const [assessment] = await db
    .select()
    .from(assessmentsTable)
    .where(eq(assessmentsTable.id, parsed.data.assessmentId));
  const actor = await authorizeLearningActor(req, res);
  if (!actor) return;
  if (actor.role === "trainer") {
    res.status(403).json({ error: "Trainers are not authorized to view assessment detail" });
    return;
  }
  const [module] = assessment
    ? await db.select().from(modulesTable).where(eq(modulesTable.id, assessment.moduleId))
    : [];
  if (!assessment || !module) {
    res.status(404).json({ error: "Assessment not found for the enrolled pathway" });
    return;
  }
  if (actor.role === "learner" && query.data.learnerId && query.data.learnerId !== actor.id) {
    res.status(403).json({ error: "Learners may only view their own assessments" });
    return;
  }
  const requestedLearnerId = actor.role === "learner" ? actor.id : query.data.learnerId;
  if (!requestedLearnerId) {
    res.status(400).json({ error: "learnerId is required for assessor assessment detail" });
    return;
  }
  const contexts = actor.role === "learner"
    ? [await activeLearnerPathwayContext(requestedLearnerId, module.pathwayId)]
    : await workspaceAssignmentContexts(actor.id, actor.role);
  const context = contexts.find((item) => item &&
    item.learner.id === requestedLearnerId &&
    item.program.id === module.programId &&
    item.pathway.id === module.pathwayId,
  );
  if (!context) {
    res.status(403).json({ error: "Assessment is outside your active assigned learner pathway" });
    return;
  }
  res.json(GetAssessmentResponse.parse(await assessmentDetail(assessment, context)));
});

async function assignedAssessments(assessorId: string) {
  const contexts = await workspaceAssignmentContexts(assessorId, "assessor");
  const [result, criteria] = await Promise.all([
    Promise.all(contexts.map((context) => activeAssessments(context))),
    db.select().from(assessmentCriteriaTable),
  ]);
  const actionableAssessmentIds = new Set(criteria.map((criterion) => criterion.assessmentId));
  const actionable = result.map((item) => ({
    ...item,
    actionableSummaries: item.summaries.filter((summary) => actionableAssessmentIds.has(summary.id)),
  }));
  return { contexts, result: actionable };
}

router.get("/assessor/queue", async (req, res): Promise<void> => {
  const assessorId = await authorizeWorkspaceRole(req, res, "assessor");
  if (!assessorId) return;
  res.json(
    GetAssessorQueueResponse.parse(
      (await assignedAssessments(assessorId)).result.flatMap(({ context, pathwayModules, actionableSummaries }) => actionableSummaries
        .filter((summary) => summary.status !== "Completed" || summary.criticalFailure)
        .map((summary) => ({
          id: summary.id,
          kind: "Assessment",
          learnerId: context.learner.id, learnerName: context.learner.name,
          moduleName:
            pathwayModules.find((module) => module.id === summary.moduleId)?.name ?? "Module",
          pathwayId: context.pathway.id,
          pathwayName: context.pathway.name,
          title: summary.name,
          status: summary.status,
          priority: summary.criticalFailure ? "Critical" : "Normal",
          updatedAt: new Date(),
        }))),
    ),
  );
});

router.get("/assessor/dashboard", async (req, res): Promise<void> => {
  const assessorId = await authorizeWorkspaceRole(req, res, "assessor");
  if (!assessorId) return;
  const { contexts, result } = await assignedAssessments(assessorId);
  const scoped = await Promise.all(contexts.map(async (context) => ({
    evidence: await evidenceRecords(context.learner.id, context.pathway.id),
    gaps: await gapRecords(context.learner.id, context.pathway.id),
  })));
  const [assessor] = await db
    .select()
    .from(peopleTable)
    .where(eq(peopleTable.id, assessorId));
  const recentActivity = result.flatMap(({ context, pathwayModules, actionableSummaries }) => actionableSummaries
    .filter((summary) => summary.status !== "Completed")
    .map((summary) => ({
      id: summary.id,
      kind: "Assessment",
      learnerId: context.learner.id, learnerName: context.learner.name,
      moduleName:
        pathwayModules.find((module) => module.id === summary.moduleId)?.name ?? "Module",
      pathwayId: context.pathway.id,
      pathwayName: context.pathway.name,
      title: summary.name,
      status: summary.status,
      priority: summary.criticalFailure ? "Critical" : "Normal",
      updatedAt: new Date(),
    })));
  res.json(
    GetAssessorDashboardResponse.parse({
      assessor,
      pendingAssessmentCount: result.flatMap((item) => item.actionableSummaries).filter((summary) => summary.status !== "Completed").length,
      pendingEvidenceCount: scoped.flatMap((item) => item.evidence).filter((item) => item.status === "Under review").length,
      reassessmentCount: result.flatMap((item) => item.actionableSummaries).filter((summary) => summary.criticalFailure).length,
      blockedGateCount: scoped.flatMap((item) => item.gaps).filter((gap) => gap.status !== "Resolved" && gap.severity === "Critical").length,
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
    const [assessmentModule] = await db
      .select()
      .from(modulesTable)
      .where(eq(modulesTable.id, assessment.moduleId));
    const contexts = await workspaceAssignmentContexts(assessorId, "assessor");
    const context = assessmentModule ? contexts.find((item) =>
      item.learner.id === body.data.learnerId &&
      item.program.id === assessmentModule.programId && item.pathway.id === assessmentModule.pathwayId,
    ) : undefined;
    if (!assessmentModule || !context) {
      req.log.warn(
        { assessmentId: assessment.id, assessorId },
        "Assessment is outside the learner enrollment",
      );
      res.status(403).json({ error: "Assessment is outside your assigned active learner pathway" });
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
    const evidenceIds = body.data.criteria.flatMap((criterion) => criterion.evidenceId ? [criterion.evidenceId] : []);
    if (new Set(evidenceIds).size !== evidenceIds.length) {
      res.status(400).json({ error: "An evidence item may support only one assessment criterion per decision" });
      return;
    }
    if (evidenceIds.length) {
      const referencedEvidence = await Promise.all(evidenceIds.map(async (evidenceId) =>
        (await db.select().from(evidenceTable).where(eq(evidenceTable.id, evidenceId)))[0],
      ));
      if (referencedEvidence.some((evidence) => !evidence ||
        evidence.learnerId !== context.learner.id ||
        evidence.pathwayId !== context.pathway.id ||
        evidence.moduleId !== assessment.moduleId)) {
        res.status(400).json({ error: "Assessment evidence references must belong to this learner, pathway, and module" });
        return;
      }
    }
    const { decision, criticalFailure } = enforceSafetyDecision(
      criteria.map((criterion) => ({
        critical: criterion.critical,
        score: inputs.get(criterion.id)!.score,
      })),
      body.data.decision,
    );
    const attemptId = id("assessment-attempt");
    let reassessmentRejected = false;

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
      if (decision === "Competent" && attempts.some(attempt => attempt.decision === "Not competent")) {
        const moduleActivities = await tx.select({ id: learningActivitiesTable.id })
          .from(learningActivitiesTable)
          .innerJoin(lessonsTable, eq(learningActivitiesTable.lessonId, lessonsTable.id))
          .innerJoin(courseModulesTable, eq(lessonsTable.courseModuleId, courseModulesTable.id))
          .where(and(eq(courseModulesTable.moduleId, assessment.moduleId), eq(learningActivitiesTable.pathwayId, context.pathway.id)));
        const activityIds = moduleActivities.map(activity => activity.id);
        const [latestTransition] = activityIds.length ? await tx.select().from(learningTransitionEventsTable)
          .where(and(eq(learningTransitionEventsTable.learnerId, context.learner.id), eq(learningTransitionEventsTable.pathwayId, context.pathway.id), inArray(learningTransitionEventsTable.activityId, activityIds)))
          .orderBy(desc(learningTransitionEventsTable.createdAt), desc(learningTransitionEventsTable.id)).limit(1) : [];
        const reassessmentAttemptId = (latestTransition?.metadata as { references?: { reassessmentAttemptId?: string } } | null)?.references?.reassessmentAttemptId;
        const [linkedAttempt] = reassessmentAttemptId ? await tx.select().from(assessmentAttemptsTable).where(and(eq(assessmentAttemptsTable.id, reassessmentAttemptId), eq(assessmentAttemptsTable.assessmentId, assessment.id), eq(assessmentAttemptsTable.learnerId, context.learner.id), eq(assessmentAttemptsTable.pathwayId, context.pathway.id))).limit(1) : [];
        if (latestTransition?.toState !== "REASSESSMENT" || !linkedAttempt) { reassessmentRejected = true; return; }
      }
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
      if (decision === "Competent") {
        const [causal] = await tx.select().from(reassessmentLinksTable)
          .where(and(eq(reassessmentLinksTable.learnerId, context.learner.id), eq(reassessmentLinksTable.pathwayId, context.pathway.id)))
          .orderBy(desc(reassessmentLinksTable.createdAt)).limit(1);
        if (causal) await tx.insert(reassessmentLinksTable).values({ ...causal, id: id("reassessment-link"), reassessmentAttemptId: attemptId, previousAssessmentAttemptId: causal.reassessmentAttemptId, createdAt: new Date(), createdBy: assessorId });
      }
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
            const completedActivityIds = new Set((await tx.select().from(remediationEventsTable))
              .filter(event => activities.some(activity => activity.id === event.activityId) && event.status === "Completed")
              .map(event => event.activityId));
            const reopen = activities.filter(activity => !completedActivityIds.has(activity.id));
            if (reopen.length) await tx.insert(remediationEventsTable).values(
              reopen.map((activity) => ({
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
    if (reassessmentRejected) { res.status(409).json({ error: "REASSESSMENT_TRANSITION_REQUIRED" }); return; }

    req.log.info(
      { assessmentId: assessment.id, decision, criticalFailure },
      "Recorded assessor decision",
    );
    res
      .status(201)
      .json(SubmitAssessmentDecisionResponse.parse(await assessmentDetail(assessment, context)));
  },
);

export default router;