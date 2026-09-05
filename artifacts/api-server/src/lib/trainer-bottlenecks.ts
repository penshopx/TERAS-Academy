import {
  assessmentAttemptsTable, db, evidenceReviewsTable, evidenceTable, gapEventsTable, gapsTable,
  learningTransitionEventsTable, practiceAttemptsTable, practiceReviewsTable, readinessEventsTable, reassessmentLinksTable,
  remediationActivitiesTable, remediationEventsTable, remediationPlansTable,
} from "@workspace/db";

export const bottleneckStages = ["Learning", "Practice", "Feedback", "Evidence", "Remediation", "Reassessment", "Readiness"] as const;
export type BottleneckStage = typeof bottleneckStages[number];

type EventRow = { id: string; createdAt: Date };
type AssignmentContext = { enrollment: { id: string }; learner: { id: string }; pathway: { id: string } };

/** The most recent append-only event is the greatest (createdAt, id) tuple.
 * IDs make simultaneous writes deterministic instead of depending on database row order. */
export function latestBy<T extends EventRow, K extends string>(rows: T[], key: (row: T) => K) {
  const result = new Map<K, T>();
  for (const row of rows) {
    const current = result.get(key(row));
    if (!current || row.createdAt > current.createdAt || (row.createdAt.getTime() === current.createdAt.getTime() && row.id.localeCompare(current.id) > 0)) result.set(key(row), row);
  }
  return result;
}

export type BottleneckData = {
  attempts: (typeof practiceAttemptsTable.$inferSelect)[];
  practiceReviews: (typeof practiceReviewsTable.$inferSelect)[];
  evidence: (typeof evidenceTable.$inferSelect)[];
  evidenceReviews: (typeof evidenceReviewsTable.$inferSelect)[];
  gaps: (typeof gapsTable.$inferSelect)[];
  gapEvents: (typeof gapEventsTable.$inferSelect)[];
  plans: (typeof remediationPlansTable.$inferSelect)[];
  activities: (typeof remediationActivitiesTable.$inferSelect)[];
  remediationEvents: (typeof remediationEventsTable.$inferSelect)[];
  reassessmentLinks: (typeof reassessmentLinksTable.$inferSelect)[];
  assessments: (typeof assessmentAttemptsTable.$inferSelect)[];
  learningTransitions: (typeof learningTransitionEventsTable.$inferSelect)[];
  readinessEvents: (typeof readinessEventsTable.$inferSelect)[];
};

/** Classifies exactly one bottleneck per assigned learner/pathway.
 *
 * Precedence intentionally follows the actionable lifecycle hand-off, not row
 * insertion order: active remediation, then required reassessment, pending
 * trainer feedback, evidence verification, readiness-gate work, practice
 * revision/work, and finally learning. Every event-derived state uses
 * latestBy(createdAt, id); therefore equal timestamps remain stable.
 */
export function classifyBottleneck(context: AssignmentContext, data: BottleneckData): BottleneckStage {
  const inContext = <T extends { learnerId: string; pathwayId: string }>(rows: T[]) =>
    rows.filter((row) => row.learnerId === context.learner.id && row.pathwayId === context.pathway.id);
  const gapState = latestBy(data.gapEvents, (event) => event.gapId);
  const outstandingGaps = inContext(data.gaps).filter((gap) => gapState.get(gap.id)?.status !== "Resolved");
  const outstandingGapIds = new Set(outstandingGaps.map((gap) => gap.id));
  const plans = data.plans.filter((plan) => outstandingGapIds.has(plan.gapId));
  const planIds = new Set(plans.map((plan) => plan.id));
  const activities = data.activities.filter((activity) => planIds.has(activity.planId));
  const activityState = latestBy(data.remediationEvents, (event) => event.activityId);
  if (plans.length && activities.some((activity) => activityState.get(activity.id)?.status !== "Completed")) return "Remediation";

  const assessmentById = new Map(inContext(data.assessments).map((attempt) => [attempt.id, attempt]));
  const reassessmentForOpenGap = data.reassessmentLinks.filter((link) =>
    link.learnerId === context.learner.id && link.pathwayId === context.pathway.id && outstandingGapIds.has(link.originalGapId),
  );
  if (plans.length && (reassessmentForOpenGap.length === 0 || reassessmentForOpenGap.some((link) => {
    const attempt = assessmentById.get(link.reassessmentAttemptId);
    return !attempt || attempt.status !== "Completed" || attempt.decision !== "Competent";
  }))) return "Reassessment";
  const learningStates = latestBy(data.learningTransitions.filter((event) =>
    event.learnerId === context.learner.id && event.pathwayId === context.pathway.id,
  ), (event) => event.activityId);
  const reviews = latestBy(data.practiceReviews, (review) => review.attemptId);
  const attempts = inContext(data.attempts);
  if (attempts.some((attempt) => (reviews.get(attempt.id)?.status ?? attempt.status) === "Submitted")) return "Feedback";

  const evidenceReviews = latestBy(data.evidenceReviews, (review) => review.evidenceId);
  if (inContext(data.evidence).some((item) => evidenceReviews.get(item.id)?.status !== "Valid")) return "Evidence";

  const readiness = latestBy(data.readinessEvents.filter((event) => event.enrollmentId === context.enrollment.id && event.pathwayId === context.pathway.id), (event) => event.gateId);
  if ([...readiness.values()].some((event) => event.status !== "Passed")) return "Readiness";

  if ([...learningStates.values()].some((event) => ["PRACTICE_REQUIRED", "PRACTICE_IN_PROGRESS", "REVISION_REQUIRED"].includes(event.toState))) return "Practice";
  if (attempts.some((attempt) => (reviews.get(attempt.id)?.status ?? attempt.status) === "Needs revision")) return "Practice";
  return "Learning";
}

export async function trainerBottlenecks(contexts: AssignmentContext[]) {
  // An enrollment can only contribute one learner/pathway context to an aggregate.
  const uniqueContexts = [...new Map(contexts.map((context) => [`${context.learner.id}\u0000${context.pathway.id}`, context])).values()];
  const [attempts, practiceReviews, evidence, evidenceReviews, gaps, gapEvents, plans, activities, remediationEvents, reassessmentLinks, assessments, learningTransitions, readinessEvents] = await Promise.all([
    db.select().from(practiceAttemptsTable), db.select().from(practiceReviewsTable), db.select().from(evidenceTable), db.select().from(evidenceReviewsTable),
    db.select().from(gapsTable), db.select().from(gapEventsTable), db.select().from(remediationPlansTable), db.select().from(remediationActivitiesTable),
    db.select().from(remediationEventsTable), db.select().from(reassessmentLinksTable), db.select().from(assessmentAttemptsTable), db.select().from(learningTransitionEventsTable), db.select().from(readinessEventsTable),
  ]);
  const data: BottleneckData = { attempts, practiceReviews, evidence, evidenceReviews, gaps, gapEvents, plans, activities, remediationEvents, reassessmentLinks, assessments, learningTransitions, readinessEvents };
  const counts = Object.fromEntries(bottleneckStages.map((stage) => [stage, 0])) as Record<BottleneckStage, number>;
  for (const context of uniqueContexts) counts[classifyBottleneck(context, data)]++;
  // A tied aggregate keeps the declared lifecycle order, so the headline is stable.
  const mostStalled = uniqueContexts.length
    ? bottleneckStages.reduce((winner, stage) => counts[stage] > counts[winner] ? stage : winner, bottleneckStages[0])
    : null;
  return { mostStalled, counts, assignedContextCount: uniqueContexts.length, asOf: new Date() };
}