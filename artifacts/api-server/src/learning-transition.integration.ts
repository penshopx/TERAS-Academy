import {
  assessmentAttemptsTable,
  db,
  enrollmentPathwayEventsTable,
  evidenceReviewsTable,
  evidenceTable,
  gapsTable,
  learningRecordLinksTable,
  learningTransitionEventsTable,
  outcomeVerificationEventsTable,
  activityCompletionEventsTable,
  readinessTransferEventsTable,
  reassessmentLinksTable,
  practiceAttemptsTable,
  remediationPlansTable,
} from "@workspace/db";
import { and, desc, eq, inArray } from "drizzle-orm";
import {
  isValidLearningTransition,
  transitionLearningState,
  type LearningState,
  type LearningTransitionCommand,
  type LearningTransitionResult,
} from "./lib/learning-transition";
import { learnerContext, readiness } from "./lib/teras";

const activityId = "activity-m03-safe-isolation";
const fixtureIds = {
  practice: "phase1-test-practice-a",
  evidence: "phase1-test-evidence-a",
  pathBEvidence: "phase1-test-evidence-b",
  review: "phase1-test-review-a",
  gap: "phase1-test-gap-a",
  remediation: "phase1-test-remediation-a",
  reassessment: "phase1-test-reassessment-a",
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function command(
  currentState: LearningState,
  targetState: LearningState,
  suffix: string,
  references?: LearningTransitionCommand["references"],
): LearningTransitionCommand {
  return {
    currentState,
    targetState,
    learnerId: "learner-demo",
    pathwayId: "path-a",
    programId: "solar-pv-tech",
    activityId,
    entityReference: `phase1-test:${suffix}`,
    reason: `Phase 1 integration ${suffix}`,
    idempotencyKey: `phase1-test-${suffix}`,
    references,
  };
}

async function removeTransitionRecords() {
  const events = await db.select({ id: learningTransitionEventsTable.id })
    .from(learningTransitionEventsTable)
    .where(and(
      eq(learningTransitionEventsTable.activityId, activityId),
      eq(learningTransitionEventsTable.learnerId, "learner-demo"),
      eq(learningTransitionEventsTable.pathwayId, "path-a"),
    ));
  const eventIds = events.map(({ id }) => id);
  if (eventIds.length) {
    const links = await db.select({ id: learningRecordLinksTable.id })
      .from(learningRecordLinksTable)
      .where(eq(learningRecordLinksTable.activityId, activityId));
    await db.delete(readinessTransferEventsTable).where(eq(readinessTransferEventsTable.learnerId, "learner-demo"));
    await db.delete(reassessmentLinksTable).where(eq(reassessmentLinksTable.reassessmentAttemptId, fixtureIds.reassessment));
    if (links.length) await db.delete(learningRecordLinksTable).where(inArray(learningRecordLinksTable.id, links.map(({ id }) => id)));
    await db.delete(outcomeVerificationEventsTable).where(eq(outcomeVerificationEventsTable.activityId, activityId));
    await db.delete(activityCompletionEventsTable).where(eq(activityCompletionEventsTable.activityId, activityId));
    await db.delete(learningTransitionEventsTable).where(inArray(learningTransitionEventsTable.id, eventIds));
  }
}

async function cleanup() {
  await removeTransitionRecords();
  await db.delete(evidenceReviewsTable).where(eq(evidenceReviewsTable.id, fixtureIds.review));
  await db.delete(remediationPlansTable).where(eq(remediationPlansTable.id, fixtureIds.remediation));
  await db.delete(gapsTable).where(eq(gapsTable.id, fixtureIds.gap));
  await db.delete(assessmentAttemptsTable).where(eq(assessmentAttemptsTable.id, fixtureIds.reassessment));
  await db.delete(evidenceTable).where(inArray(evidenceTable.id, [fixtureIds.evidence, fixtureIds.pathBEvidence]));
  await db.delete(practiceAttemptsTable).where(eq(practiceAttemptsTable.id, fixtureIds.practice));
}

async function seedFixtures() {
  await cleanup();
  const [lastSelection] = await db.select({ sequence: enrollmentPathwayEventsTable.sequence })
    .from(enrollmentPathwayEventsTable)
    .where(eq(enrollmentPathwayEventsTable.enrollmentId, "enrol-demo"))
    .orderBy(desc(enrollmentPathwayEventsTable.sequence))
    .limit(1);
  await db.insert(enrollmentPathwayEventsTable).values({
    id: `phase1-path-a-${Date.now()}`,
    enrollmentId: "enrol-demo",
    pathwayId: "path-a",
    programId: "solar-pv-tech",
    sequence: (lastSelection?.sequence ?? 0) + 1,
  });
  await db.insert(practiceAttemptsTable).values({
    id: fixtureIds.practice,
    taskId: "task-m03",
    learnerId: "learner-demo",
    pathwayId: "path-a",
    reflection: "Applied the learning note in supervised practice.",
    outputSummary: "Safe isolation practice record.",
    status: "Submitted",
  });
  await db.insert(evidenceTable).values([
    {
      id: fixtureIds.evidence,
      learnerId: "learner-demo",
      pathwayId: "path-a",
      moduleId: "m03",
      taskId: "task-m03",
      title: "Phase 1 safety evidence",
      type: "Checklist",
      description: "Path A causal evidence fixture.",
    },
    {
      id: fixtureIds.pathBEvidence,
      learnerId: "learner-demo",
      pathwayId: "path-b",
      moduleId: "b04",
      taskId: "task-b04",
      title: "Phase 1 design evidence",
      type: "Report",
      description: "Path B isolation fixture.",
    },
  ]);
  await db.insert(evidenceReviewsTable).values({
    id: fixtureIds.review,
    evidenceId: fixtureIds.evidence,
    reviewerId: "trainer-aria",
    status: "Needs revision",
    comment: "Revision required before reassessment.",
    quality: { valid: true, relevant: true, sufficient: false, traceable: true },
  });
  await db.insert(gapsTable).values({
    id: fixtureIds.gap,
    learnerId: "learner-demo",
    pathwayId: "path-a",
    moduleId: "m03",
    capability: "Safe isolation",
    criterion: "SAFE-01",
    severity: "Moderate",
    priority: "High",
    diagnosis: "Sequence needs reinforcement.",
    gate: "G1",
    recommendedAction: "Repeat supervised practice.",
  });
  await db.insert(remediationPlansTable).values({
    id: fixtureIds.remediation,
    gapId: fixtureIds.gap,
    title: "Safe isolation reinforcement",
    description: "Repeat practice and submit revised evidence.",
    dueLabel: "Integration test",
  });
  await db.insert(assessmentAttemptsTable).values({
    id: fixtureIds.reassessment,
    assessmentId: "assessment-m03",
    learnerId: "learner-demo",
    pathwayId: "path-a",
    number: 99,
    assessorId: "assessor-sam",
    status: "Completed",
    decision: "Not competent",
    decisionRationale: "Phase 1 reassessment fixture",
  });
}

function expectSuccess(result: LearningTransitionResult, message: string) {
  if (!result.ok) throw new Error(`${message}: expected success, got ${result.value.reason}`);
}

async function run() {
  const validEdges: Array<[LearningState, LearningState]> = [
    ["NOT_STARTED", "IN_PROGRESS"],
    ["IN_PROGRESS", "LEARNING_COMPLETED"],
    ["LEARNING_COMPLETED", "OUTCOME_VERIFIED"],
    ["OUTCOME_VERIFIED", "PRACTICE_REQUIRED"],
    ["PRACTICE_REQUIRED", "PRACTICE_IN_PROGRESS"],
    ["PRACTICE_IN_PROGRESS", "EVIDENCE_SUBMITTED"],
    ["EVIDENCE_SUBMITTED", "UNDER_REVIEW"],
    ["UNDER_REVIEW", "REVISION_REQUIRED"],
    ["REVISION_REQUIRED", "REMEDIATION"],
    ["REMEDIATION", "PRACTICE_IN_PROGRESS"],
    ["UNDER_REVIEW", "REASSESSMENT"],
    ["REASSESSMENT", "READY"],
    ["REASSESSMENT", "NOT_READY"],
  ];
  const invalidEdges: Array<[LearningState, LearningState]> = [
    ["NOT_STARTED", "READY"],
    ["IN_PROGRESS", "OUTCOME_VERIFIED"],
    ["LEARNING_COMPLETED", "PRACTICE_REQUIRED"],
    ["OUTCOME_VERIFIED", "EVIDENCE_SUBMITTED"],
    ["PRACTICE_REQUIRED", "UNDER_REVIEW"],
    ["EVIDENCE_SUBMITTED", "READY"],
    ["REVISION_REQUIRED", "REASSESSMENT"],
    ["READY", "IN_PROGRESS"],
  ];
  assert(validEdges.every(([from, to]) => isValidLearningTransition(from, to)), "A canonical transition edge is missing");
  assert(invalidEdges.every(([from, to]) => !isValidLearningTransition(from, to)), "An invalid jump was accepted");

  await seedFixtures();
  try {
    const actorLearner = { id: "learner-demo", role: "learner" } as const;
    const actorTrainer = { id: "trainer-aria", role: "trainer" } as const;
    const actorAssessor = { id: "assessor-sam", role: "assessor" } as const;

    const unauthorized = await transitionLearningState(command("NOT_STARTED", "IN_PROGRESS", "unauthorized"), actorTrainer);
    assert(!unauthorized.ok && unauthorized.value.reason === "UNAUTHORIZED_ACTOR", "Actor boundary did not reject trainer learner-action");

    const wrongLearner = await transitionLearningState(
      { ...command("NOT_STARTED", "IN_PROGRESS", "wrong-learner"), learnerId: "trainer-aria" },
      actorLearner,
    );
    assert(!wrongLearner.ok && wrongLearner.value.reason === "LEARNER_MISMATCH", "Wrong learner was not rejected");
    const wrongProgram = await transitionLearningState(
      { ...command("NOT_STARTED", "IN_PROGRESS", "wrong-program"), programId: "wrong-program" },
      actorLearner,
    );
    assert(!wrongProgram.ok && wrongProgram.value.reason === "PROGRAM_MISMATCH", "Wrong program was not rejected");
    const wrongPath = await transitionLearningState(
      { ...command("NOT_STARTED", "IN_PROGRESS", "wrong-path"), activityId: "activity-b04-protection" },
      actorLearner,
    );
    assert(!wrongPath.ok && wrongPath.value.reason === "PATHWAY_MISMATCH", "Path B activity was accepted in Path A");

    const concurrent = await Promise.all([
      transitionLearningState(command("NOT_STARTED", "IN_PROGRESS", "concurrent-a"), actorLearner),
      transitionLearningState(command("NOT_STARTED", "IN_PROGRESS", "concurrent-b"), actorLearner),
    ]);
    assert(concurrent.filter(result => result.ok).length === 1, "Concurrent transitions did not serialize to one success");
    assert(concurrent.filter(result => !result.ok && result.value.reason === "STALE_CURRENT_STATE").length === 1, "Concurrent loser was not stale");
    await removeTransitionRecords();

    const beforeReadiness = await readiness(await learnerContext());
    const started = await transitionLearningState(command("NOT_STARTED", "IN_PROGRESS", "start"), actorLearner);
    expectSuccess(started, "start");
    const duplicate = await transitionLearningState(command("NOT_STARTED", "IN_PROGRESS", "start"), actorLearner);
    assert(duplicate.ok && duplicate.statusCode === 200 && duplicate.value.idempotent, "Duplicate request was not idempotent");
    const stale = await transitionLearningState(command("NOT_STARTED", "IN_PROGRESS", "stale"), actorLearner);
    assert(!stale.ok && stale.value.reason === "STALE_CURRENT_STATE", "Stale currentState was accepted");

    expectSuccess(await transitionLearningState(command("IN_PROGRESS", "LEARNING_COMPLETED", "complete"), actorLearner), "learning completion");
    const afterCompletion = await readiness(await learnerContext());
    assert(JSON.stringify(beforeReadiness) === JSON.stringify(afterCompletion), "Learning completion changed readiness");

    expectSuccess(await transitionLearningState(command("LEARNING_COMPLETED", "OUTCOME_VERIFIED", "outcome", {
      outcomeId: "outcome-m03-sequence",
    }), actorTrainer), "outcome verification");
    const afterOutcome = await readiness(await learnerContext());
    assert(JSON.stringify(beforeReadiness) === JSON.stringify(afterOutcome), "Outcome verification changed readiness");

    expectSuccess(await transitionLearningState(command("OUTCOME_VERIFIED", "PRACTICE_REQUIRED", "practice-required"), actorTrainer), "practice required");
    expectSuccess(await transitionLearningState(command("PRACTICE_REQUIRED", "PRACTICE_IN_PROGRESS", "practice-start", {
      practiceAttemptId: fixtureIds.practice,
    }), actorLearner), "practice start");
    const crossPathEvidence = await transitionLearningState(command("PRACTICE_IN_PROGRESS", "EVIDENCE_SUBMITTED", "cross-path-evidence", {
      evidenceId: fixtureIds.pathBEvidence,
    }), actorLearner);
    assert(!crossPathEvidence.ok && crossPathEvidence.value.reason === "CAUSAL_REFERENCE_INVALID", "Path B evidence was accepted for Path A");
    expectSuccess(await transitionLearningState(command("PRACTICE_IN_PROGRESS", "EVIDENCE_SUBMITTED", "evidence", {
      evidenceId: fixtureIds.evidence,
    }), actorLearner), "evidence submission");
    expectSuccess(await transitionLearningState(command("EVIDENCE_SUBMITTED", "UNDER_REVIEW", "review", {
      evidenceId: fixtureIds.evidence,
    }), actorTrainer), "under review");
    expectSuccess(await transitionLearningState(command("UNDER_REVIEW", "REVISION_REQUIRED", "revision", {
      evidenceId: fixtureIds.evidence,
      evidenceReviewId: fixtureIds.review,
    }), actorTrainer), "revision required");
    expectSuccess(await transitionLearningState(command("REVISION_REQUIRED", "REMEDIATION", "remediation", {
      gapId: fixtureIds.gap,
      remediationPlanId: fixtureIds.remediation,
    }), actorTrainer), "remediation");
    expectSuccess(await transitionLearningState(command("REMEDIATION", "PRACTICE_IN_PROGRESS", "repractice", {
      practiceAttemptId: fixtureIds.practice,
    }), actorLearner), "re-practice");
    expectSuccess(await transitionLearningState(command("PRACTICE_IN_PROGRESS", "EVIDENCE_SUBMITTED", "re-evidence", {
      evidenceId: fixtureIds.evidence,
    }), actorLearner), "re-evidence");
    expectSuccess(await transitionLearningState(command("EVIDENCE_SUBMITTED", "UNDER_REVIEW", "re-review", {
      evidenceId: fixtureIds.evidence,
    }), actorTrainer), "re-review");
    expectSuccess(await transitionLearningState(command("UNDER_REVIEW", "REASSESSMENT", "reassessment", {
      practiceAttemptId: fixtureIds.practice,
      evidenceId: fixtureIds.evidence,
      evidenceReviewId: fixtureIds.review,
      gapId: fixtureIds.gap,
      remediationPlanId: fixtureIds.remediation,
      reassessmentAttemptId: fixtureIds.reassessment,
      previousAssessmentAttemptId: "attempt-m03-1",
    }), actorAssessor), "reassessment");

    const blockedReady = await transitionLearningState(command("REASSESSMENT", "READY", "ready-blocked", {
      reassessmentAttemptId: fixtureIds.reassessment,
    }), actorAssessor);
    assert(!blockedReady.ok && blockedReady.value.reason === "SAFETY_BLOCKED", "Safety-blocked READY was accepted");
    expectSuccess(await transitionLearningState(command("REASSESSMENT", "NOT_READY", "not-ready", {
      reassessmentAttemptId: fixtureIds.reassessment,
    }), actorAssessor), "not ready");

    const history = await db.select().from(learningTransitionEventsTable).where(eq(learningTransitionEventsTable.activityId, activityId));
    const links = await db.select().from(learningRecordLinksTable).where(eq(learningRecordLinksTable.activityId, activityId));
    assert(history.length === 14, `Expected 14 append-only journey events including re-practice, got ${history.length}`);
    assert(links.some(link => link.gapId === fixtureIds.gap && link.remediationPlanId === fixtureIds.remediation), "Causal remediation link was not recorded");
    assert(links.some(link => link.reassessmentAttemptId === fixtureIds.reassessment), "Causal reassessment link was not recorded");
    process.stdout.write("Learning transition integration checks passed\n");
  } finally {
    await cleanup();
  }
}

run().catch((error: unknown) => {
  process.stderr.write(`${error}\n`);
  process.exitCode = 1;
});