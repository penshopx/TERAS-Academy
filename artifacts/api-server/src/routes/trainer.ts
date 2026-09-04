import { Router, type IRouter } from "express";
import { GetTrainerDashboardResponse, GetTrainerReviewQueueResponse, ReviewEvidenceByTrainerBody, ReviewEvidenceByTrainerParams, ReviewEvidenceByTrainerResponse, ReviewPracticeAttemptBody, ReviewPracticeAttemptParams, ReviewPracticeAttemptResponse } from "@workspace/api-zod";
import { db, evidenceReviewsTable, evidenceTable, gapEventsTable, gapsTable, peopleTable, practiceAttemptsTable, practiceReviewsTable, practiceTasksTable, modulesTable, remediationActivitiesTable, remediationEventsTable, remediationPlansTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { evidenceRecords, gapRecords, learnerContext, remediationRecords } from "../lib/teras";
import { authorizeWorkspaceRole } from "../lib/authorization";

const router: IRouter = Router();
const id = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;

async function appendModuleRevisionState(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  moduleId: string,
  learnerId: string,
  pathwayId: string,
  reviewerId: string,
) {
  const gaps = await tx.select().from(gapsTable).where(and(
    eq(gapsTable.moduleId, moduleId),
    eq(gapsTable.learnerId, learnerId),
    eq(gapsTable.pathwayId, pathwayId),
  ));
  if (!gaps.length) return;
  await tx.insert(gapEventsTable).values(gaps.map((gap) => ({
    id: id("gap-event"),
    gapId: gap.id,
    status: "Open",
    createdBy: reviewerId,
  })));
  const plans = await tx.select().from(remediationPlansTable);
  const gapIds = new Set(gaps.map((gap) => gap.id));
  const planIds = new Set(plans.filter((plan) => gapIds.has(plan.gapId)).map((plan) => plan.id));
  const activities = (await tx.select().from(remediationActivitiesTable))
    .filter((activity) => planIds.has(activity.planId));
  if (activities.length) {
    await tx.insert(remediationEventsTable).values(activities.map((activity) => ({
      id: id("remediation-event"),
      activityId: activity.id,
      status: "In progress",
      createdBy: reviewerId,
    })));
  }
}

async function queue() {
  const [ctx, evidence, attempts, reviews, tasks, modules] = await Promise.all([
    learnerContext(), evidenceRecords(), db.select().from(practiceAttemptsTable),
    db.select().from(practiceReviewsTable), db.select().from(practiceTasksTable), db.select().from(modulesTable),
  ]);
  const pathwayModules = modules.filter((module) => module.pathwayId === ctx.pathway.id);
  const moduleIds = new Set(pathwayModules.map((module) => module.id));
  const latestReviews = new Map<string, typeof reviews[number]>();
  for (const review of reviews) {
    if (!latestReviews.has(review.attemptId) || latestReviews.get(review.attemptId)!.createdAt < review.createdAt) latestReviews.set(review.attemptId, review);
  }
  return [
    ...evidence.filter((item) => item.status !== "Valid").map((item) => ({
      id: item.id, kind: "Evidence", learnerName: ctx.learner.name, moduleName: item.moduleName,
      pathwayId: ctx.pathway.id, pathwayName: ctx.pathway.name, title: item.title, status: item.status,
      priority: item.moduleId === "m03" ? "Critical" : "High", updatedAt: item.submittedAt,
    })),
    ...attempts.filter((attempt) => attempt.learnerId === ctx.learner.id && attempt.pathwayId === ctx.pathway.id &&
      moduleIds.has(tasks.find((task) => task.id === attempt.taskId)?.moduleId ?? "") &&
      (latestReviews.get(attempt.id)?.status ?? attempt.status) === "Submitted").map((attempt) => ({
      id: attempt.id, kind: "Practice", learnerName: ctx.learner.name,
      moduleName: pathwayModules.find((module) => module.id === tasks.find((task) => task.id === attempt.taskId)?.moduleId)?.name ?? "Module",
      pathwayId: ctx.pathway.id, pathwayName: ctx.pathway.name, title: "Practice attempt", status: attempt.status,
      priority: "Normal", updatedAt: attempt.createdAt,
    })),
  ];
}

router.get("/trainer/review-queue", async (req, res): Promise<void> => {
  req.log.info("Loading trainer review queue");
  const trainerId = await authorizeWorkspaceRole(req, res, "trainer");
  if (!trainerId) return;
  res.json(GetTrainerReviewQueueResponse.parse(await queue()));
});
router.get("/trainer/dashboard", async (req, res): Promise<void> => {
  const trainerId = await authorizeWorkspaceRole(req, res, "trainer");
  if (!trainerId) return;
  const [ctx, items, evidence, gaps, plans] = await Promise.all([learnerContext(), queue(), evidenceRecords(), gapRecords(), remediationRecords()]);
  if (ctx.enrollment.trainerId !== trainerId) { res.status(403).json({ error: "You are not assigned to this learner enrollment" }); return; }
  const trainer = await db.select().from(peopleTable).where(eq(peopleTable.id, ctx.enrollment.trainerId!)).then((rows) => rows[0]);
  res.json(GetTrainerDashboardResponse.parse({ trainer, assignedLearnerCount: 1, pendingFeedbackCount: items.filter((item) => item.kind === "Practice").length, pendingEvidenceCount: evidence.filter((item) => item.status === "Under review").length, activeRemediationCount: plans.filter((plan) => plan.status !== "Completed").length, blockedLearnerCount: gaps.some((gap) => gap.severity === "Critical" && gap.status !== "Resolved") ? 1 : 0, recentActivity: items }));
});
router.post("/trainer/practice/:attemptId/review", async (req, res): Promise<void> => {
  const params = ReviewPracticeAttemptParams.safeParse(req.params); const body = ReviewPracticeAttemptBody.safeParse(req.body);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }
  const reviewerId = await authorizeWorkspaceRole(req, res, "trainer"); if (!reviewerId) return;
  const [attempt] = await db.select().from(practiceAttemptsTable).where(eq(practiceAttemptsTable.id, params.data.attemptId));
  const ctx = await learnerContext();
  if (!attempt) { res.status(404).json({ error: "Practice attempt not found" }); return; }
  if (ctx.enrollment.trainerId !== reviewerId || attempt.learnerId !== ctx.learner.id || attempt.pathwayId !== ctx.pathway.id) { res.status(403).json({ error: "Practice attempt is outside your assigned active pathway" }); return; }
  const [task] = await db.select().from(practiceTasksTable).where(eq(practiceTasksTable.id, attempt.taskId));
  if (!task) { res.status(404).json({ error: "Practice task not found" }); return; }
  await db.transaction(async (tx) => {
    await tx.insert(practiceReviewsTable).values({ id: id("practice-review"), attemptId: attempt.id, reviewerId, status: body.data.status, feedback: body.data.feedback, createdBy: reviewerId });
    if (body.data.status === "Needs revision") {
      await appendModuleRevisionState(tx, task.moduleId, attempt.learnerId, attempt.pathwayId, reviewerId);
    }
  });
  const review = (await db.select().from(practiceReviewsTable).where(eq(practiceReviewsTable.attemptId, attempt.id))).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
  if (!review) throw new Error("Practice review was not recorded");
  res.json(ReviewPracticeAttemptResponse.parse({ id: attempt.id, taskId: attempt.taskId, submittedAt: attempt.createdAt, status: review.status, reflection: attempt.reflection, outputSummary: attempt.outputSummary, feedback: review.feedback }));
});
router.post("/trainer/evidence/:evidenceId/review", async (req, res): Promise<void> => {
  const params = ReviewEvidenceByTrainerParams.safeParse(req.params); const body = ReviewEvidenceByTrainerBody.safeParse(req.body);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }
  const reviewerId = await authorizeWorkspaceRole(req, res, "trainer"); if (!reviewerId) return;
  if (body.data.status === "Valid" && Object.values(body.data.quality).some((passed) => !passed)) {
    res.status(400).json({ error: "Evidence cannot be marked Valid while a quality check is incomplete" });
    return;
  }
  const [evidence] = await db.select().from(evidenceTable).where(eq(evidenceTable.id, params.data.evidenceId));
  const ctx = await learnerContext();
  if (!evidence) { res.status(404).json({ error: "Evidence not found" }); return; }
  if (ctx.enrollment.trainerId !== reviewerId || evidence.learnerId !== ctx.learner.id || evidence.pathwayId !== ctx.pathway.id) { res.status(403).json({ error: "Evidence is outside your assigned active pathway" }); return; }
  await db.transaction(async (tx) => {
    await tx.insert(evidenceReviewsTable).values({ id: id("evidence-review"), evidenceId: evidence.id, reviewerId, status: body.data.status, comment: body.data.comment, quality: body.data.quality, createdBy: reviewerId });
    if (body.data.status === "Needs revision") {
      await appendModuleRevisionState(tx, evidence.moduleId, evidence.learnerId, evidence.pathwayId, reviewerId);
    }
  });
  res.json(ReviewEvidenceByTrainerResponse.parse((await evidenceRecords()).find((item) => item.id === evidence.id)));
});
export default router;