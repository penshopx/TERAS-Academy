import { Router, type IRouter } from "express";
import { GetTrainerDashboardResponse, GetTrainerReviewQueueResponse, ReviewEvidenceByTrainerBody, ReviewEvidenceByTrainerParams, ReviewEvidenceByTrainerResponse, ReviewPracticeAttemptBody, ReviewPracticeAttemptParams, ReviewPracticeAttemptResponse } from "@workspace/api-zod";
import { db, evidenceReviewsTable, evidenceTable, gapEventsTable, gapsTable, peopleTable, practiceAttemptsTable, practiceReviewsTable, practiceTasksTable, modulesTable, remediationActivitiesTable, remediationEventsTable, remediationPlansTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { evidenceRecords, gapRecords, remediationRecords, workspaceAssignmentContexts } from "../lib/teras";
import { authorizeWorkspaceRole } from "../lib/authorization";

const router: IRouter = Router();
const id = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;

async function appendModuleRevisionState(tx: Parameters<Parameters<typeof db.transaction>[0]>[0], moduleId: string, learnerId: string, pathwayId: string, reviewerId: string) {
  const gaps = await tx.select().from(gapsTable).where(and(eq(gapsTable.moduleId, moduleId), eq(gapsTable.learnerId, learnerId), eq(gapsTable.pathwayId, pathwayId)));
  if (!gaps.length) return;
  await tx.insert(gapEventsTable).values(gaps.map((gap) => ({ id: id("gap-event"), gapId: gap.id, status: "Open", createdBy: reviewerId })));
  const plans = await tx.select().from(remediationPlansTable);
  const planIds = new Set(plans.filter((plan) => gaps.some((gap) => gap.id === plan.gapId)).map((plan) => plan.id));
  const activities = (await tx.select().from(remediationActivitiesTable)).filter((activity) => planIds.has(activity.planId));
  if (activities.length) await tx.insert(remediationEventsTable).values(activities.map((activity) => ({ id: id("remediation-event"), activityId: activity.id, status: "In progress", createdBy: reviewerId })));
}

async function queue(trainerId: string) {
  const [contexts, attempts, reviews, tasks, modules] = await Promise.all([workspaceAssignmentContexts(trainerId, "trainer"), db.select().from(practiceAttemptsTable), db.select().from(practiceReviewsTable), db.select().from(practiceTasksTable), db.select().from(modulesTable)]);
  const latestReviews = new Map<string, typeof reviews[number]>();
  for (const review of reviews) if (!latestReviews.has(review.attemptId) || latestReviews.get(review.attemptId)!.createdAt < review.createdAt) latestReviews.set(review.attemptId, review);
  const items = await Promise.all(contexts.map(async (context) => {
    const pathwayModules = modules.filter((module) => module.pathwayId === context.pathway.id && module.programId === context.program.id);
    const moduleIds = new Set(pathwayModules.map((module) => module.id));
    const evidence = await evidenceRecords(context.learner.id, context.pathway.id);
    return [
      ...evidence.filter((item) => item.status !== "Valid").map((item) => ({ id: item.id, kind: "Evidence", learnerId: context.learner.id, learnerName: context.learner.name, moduleName: item.moduleName, pathwayId: context.pathway.id, pathwayName: context.pathway.name, title: item.title, status: item.status, priority: item.moduleId === "m03" ? "Critical" : "High", updatedAt: item.submittedAt })),
      ...attempts.filter((attempt) => attempt.learnerId === context.learner.id && attempt.pathwayId === context.pathway.id && moduleIds.has(tasks.find((task) => task.id === attempt.taskId)?.moduleId ?? "") && (latestReviews.get(attempt.id)?.status ?? attempt.status) === "Submitted").map((attempt) => ({ id: attempt.id, kind: "Practice", learnerId: context.learner.id, learnerName: context.learner.name, moduleName: pathwayModules.find((module) => module.id === tasks.find((task) => task.id === attempt.taskId)?.moduleId)?.name ?? "Module", pathwayId: context.pathway.id, pathwayName: context.pathway.name, title: "Practice attempt", status: attempt.status, priority: "Normal", updatedAt: attempt.createdAt })),
    ];
  }));
  return { contexts, items: items.flat() };
}

router.get("/trainer/review-queue", async (req, res): Promise<void> => {
  const trainerId = await authorizeWorkspaceRole(req, res, "trainer"); if (!trainerId) return;
  res.json(GetTrainerReviewQueueResponse.parse((await queue(trainerId)).items));
});
router.get("/trainer/dashboard", async (req, res): Promise<void> => {
  const trainerId = await authorizeWorkspaceRole(req, res, "trainer"); if (!trainerId) return;
  const { contexts, items } = await queue(trainerId);
  const [scoped, allEvidence, allEvidenceReviews, allAttempts, allPracticeReviews, allTasks, people] = await Promise.all([
    Promise.all(contexts.map(async (context) => ({ evidence: await evidenceRecords(context.learner.id, context.pathway.id), gaps: await gapRecords(context.learner.id, context.pathway.id), plans: await remediationRecords(context.learner.id, context.pathway.id) }))),
    db.select().from(evidenceTable), db.select().from(evidenceReviewsTable), db.select().from(practiceAttemptsTable), db.select().from(practiceReviewsTable), db.select().from(practiceTasksTable), db.select().from(peopleTable),
  ]);
  const [trainer] = await db.select().from(peopleTable).where(eq(peopleTable.id, trainerId));
  const contextFor = (learnerId: string, pathwayId: string) => contexts.find((context) => context.learner.id === learnerId && context.pathway.id === pathwayId);
  const reviewerNames = new Map(people.map((person) => [person.id, person.name]));
  const evidenceById = new Map(allEvidence.map((item) => [item.id, item]));
  const attemptById = new Map(allAttempts.map((item) => [item.id, item]));
  const taskById = new Map(allTasks.map((item) => [item.id, item]));
  const reviewHistory = [
    ...allEvidenceReviews.flatMap((review) => {
      const evidence = evidenceById.get(review.evidenceId); const context = evidence && contextFor(evidence.learnerId, evidence.pathwayId);
      return evidence && context ? [{ id: review.id, kind: "Evidence" as const, learnerId: context.learner.id, learnerName: context.learner.name, pathwayId: context.pathway.id, pathwayName: context.pathway.name, subject: evidence.title, outcome: review.status, comment: review.comment ?? "", quality: review.quality, reviewer: review.reviewerId ? reviewerNames.get(review.reviewerId) ?? null : null, recordedAt: review.createdAt }] : [];
    }),
    ...allPracticeReviews.flatMap((review) => {
      const attempt = attemptById.get(review.attemptId); const context = attempt && contextFor(attempt.learnerId, attempt.pathwayId);
      return attempt && context ? [{ id: review.id, kind: "Practice" as const, learnerId: context.learner.id, learnerName: context.learner.name, pathwayId: context.pathway.id, pathwayName: context.pathway.name, subject: taskById.get(attempt.taskId)?.title ?? "Practice attempt", outcome: review.status, comment: review.feedback, quality: null, reviewer: review.reviewerId ? reviewerNames.get(review.reviewerId) ?? null : null, recordedAt: review.createdAt }] : [];
    }),
  ].sort((a, b) => b.recordedAt.getTime() - a.recordedAt.getTime() || b.id.localeCompare(a.id));
  res.json(GetTrainerDashboardResponse.parse({ trainer, assignedLearnerCount: new Set(contexts.map((context) => context.learner.id)).size, pendingFeedbackCount: items.filter((item) => item.kind === "Practice").length, pendingEvidenceCount: scoped.flatMap((item) => item.evidence).filter((item) => item.status === "Under review").length, activeRemediationCount: scoped.flatMap((item) => item.plans).filter((item) => item.status !== "Completed").length, blockedLearnerCount: new Set(contexts.filter((context, index) => scoped[index]!.gaps.some((gap) => gap.severity === "Critical" && gap.status !== "Resolved")).map((context) => context.learner.id)).size, recentActivity: items, reviewHistory }));
});
router.post("/trainer/practice/:attemptId/review", async (req, res): Promise<void> => {
  const params = ReviewPracticeAttemptParams.safeParse(req.params); const body = ReviewPracticeAttemptBody.safeParse(req.body);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }
  const reviewerId = await authorizeWorkspaceRole(req, res, "trainer"); if (!reviewerId) return;
  const [attempt] = await db.select().from(practiceAttemptsTable).where(eq(practiceAttemptsTable.id, params.data.attemptId));
  if (!attempt) { res.status(404).json({ error: "Practice attempt not found" }); return; }
  const [task] = await db.select().from(practiceTasksTable).where(eq(practiceTasksTable.id, attempt.taskId));
  const contexts = await workspaceAssignmentContexts(reviewerId, "trainer");
  const context = contexts.find((item) => item.learner.id === attempt.learnerId && item.pathway.id === attempt.pathwayId);
  const [module] = task ? await db.select().from(modulesTable).where(eq(modulesTable.id, task.moduleId)) : [];
  if (!context || !task || !module || module.pathwayId !== context.pathway.id || module.programId !== context.program.id) { res.status(403).json({ error: "Practice attempt is outside your assigned active pathway" }); return; }
  await db.transaction(async (tx) => { await tx.insert(practiceReviewsTable).values({ id: id("practice-review"), attemptId: attempt.id, reviewerId, status: body.data.status, feedback: body.data.feedback, createdBy: reviewerId }); if (body.data.status === "Needs revision") await appendModuleRevisionState(tx, task.moduleId, attempt.learnerId, attempt.pathwayId, reviewerId); });
  const review = (await db.select().from(practiceReviewsTable).where(eq(practiceReviewsTable.attemptId, attempt.id))).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
  if (!review) throw new Error("Practice review was not recorded");
  res.json(ReviewPracticeAttemptResponse.parse({ id: attempt.id, taskId: attempt.taskId, submittedAt: attempt.createdAt, status: review.status, reflection: attempt.reflection, outputSummary: attempt.outputSummary, feedback: review.feedback }));
});
router.post("/trainer/evidence/:evidenceId/review", async (req, res): Promise<void> => {
  const params = ReviewEvidenceByTrainerParams.safeParse(req.params); const body = ReviewEvidenceByTrainerBody.safeParse(req.body);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }
  const reviewerId = await authorizeWorkspaceRole(req, res, "trainer"); if (!reviewerId) return;
  if (body.data.status === "Valid" && Object.values(body.data.quality).some((passed) => !passed)) { res.status(400).json({ error: "Evidence cannot be marked Valid while a quality check is incomplete" }); return; }
  const [evidence] = await db.select().from(evidenceTable).where(eq(evidenceTable.id, params.data.evidenceId));
  if (!evidence) { res.status(404).json({ error: "Evidence not found" }); return; }
  const contexts = await workspaceAssignmentContexts(reviewerId, "trainer");
  if (!contexts.some((item) => item.learner.id === evidence.learnerId && item.pathway.id === evidence.pathwayId)) { res.status(403).json({ error: "Evidence is outside your assigned active pathway" }); return; }
  await db.transaction(async (tx) => { await tx.insert(evidenceReviewsTable).values({ id: id("evidence-review"), evidenceId: evidence.id, reviewerId, status: body.data.status, comment: body.data.comment, quality: body.data.quality, createdBy: reviewerId }); if (body.data.status === "Needs revision") await appendModuleRevisionState(tx, evidence.moduleId, evidence.learnerId, evidence.pathwayId, reviewerId); });
  res.json(ReviewEvidenceByTrainerResponse.parse((await evidenceRecords(evidence.learnerId, evidence.pathwayId)).find((item) => item.id === evidence.id)));
});
export default router;