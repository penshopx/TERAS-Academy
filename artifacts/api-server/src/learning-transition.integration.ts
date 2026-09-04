import {
  assessmentAttemptsTable,
  db,
  enrollmentPathwayEventsTable,
  evidenceReviewsTable,
  evidenceTable,
  gapsTable,
  learningActivitiesTable,
  learningOutcomesTable,
  learningRecordLinksTable,
  learningTransitionEventsTable,
  outcomeVerificationEventsTable,
  activityCompletionEventsTable,
  reassessmentLinksTable,
  practiceAttemptsTable,
  remediationPlansTable,
} from "@workspace/db";
import { and, desc, eq, inArray } from "drizzle-orm";
import {
  isValidLearningTransition,
  learningNextAction,
  transitionLearningState,
  type LearningState,
  type LearningTransitionCommand,
  type LearningTransitionResult,
} from "./lib/learning-transition";
import { learnerContext, readiness } from "./lib/teras";
import { createIntegrationTestApp } from "./integration-test-app";
import type { AddressInfo } from "node:net";

const fixturePrefix = `phase1-test-${crypto.randomUUID()}`;
const activityId = `${fixturePrefix}-activity`;
const fixtureIds = {
  outcome: `${fixturePrefix}-outcome`,
  pathwaySelection: `${fixturePrefix}-pathway-selection`,
  practice: `${fixturePrefix}-practice-a`,
  evidence: `${fixturePrefix}-evidence-a`,
  pathBEvidence: `${fixturePrefix}-evidence-b`,
  review: `${fixturePrefix}-review-a`,
  gap: `${fixturePrefix}-gap-a`,
  remediation: `${fixturePrefix}-remediation-a`,
  reassessment: `${fixturePrefix}-reassessment-a`,
  rolledBackPractice: `${fixturePrefix}-practice-rollback`,
  rolledBackEvidence: `${fixturePrefix}-evidence-rollback`,
  rolledBackReview: `${fixturePrefix}-review-rollback`,
};
const routeRecords: {
  practiceIds: string[];
  evidenceIds: string[];
  reviewIds: string[];
} = { practiceIds: [], evidenceIds: [], reviewIds: [] };

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
    entityReference: `${fixturePrefix}:${suffix}`,
    reason: `Phase 1 integration ${suffix}`,
    idempotencyKey: `${fixturePrefix}-${suffix}`,
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
      .where(and(
        eq(learningRecordLinksTable.activityId, activityId),
        eq(learningRecordLinksTable.learnerId, "learner-demo"),
        eq(learningRecordLinksTable.pathwayId, "path-a"),
      ));
    await db.delete(reassessmentLinksTable).where(eq(reassessmentLinksTable.reassessmentAttemptId, fixtureIds.reassessment));
    if (links.length) await db.delete(learningRecordLinksTable).where(inArray(learningRecordLinksTable.id, links.map(({ id }) => id)));
    await db.delete(outcomeVerificationEventsTable).where(and(
      eq(outcomeVerificationEventsTable.activityId, activityId),
      eq(outcomeVerificationEventsTable.learnerId, "learner-demo"),
      eq(outcomeVerificationEventsTable.pathwayId, "path-a"),
    ));
    await db.delete(activityCompletionEventsTable).where(and(
      eq(activityCompletionEventsTable.activityId, activityId),
      eq(activityCompletionEventsTable.learnerId, "learner-demo"),
      eq(activityCompletionEventsTable.pathwayId, "path-a"),
    ));
    await db.delete(learningTransitionEventsTable).where(inArray(learningTransitionEventsTable.id, eventIds));
  }
}

async function cleanup() {
  await removeTransitionRecords();
  if (routeRecords.reviewIds.length) {
    await db.delete(evidenceReviewsTable).where(inArray(evidenceReviewsTable.id, routeRecords.reviewIds));
  }
  await db.delete(evidenceReviewsTable).where(eq(evidenceReviewsTable.id, fixtureIds.review));
  await db.delete(evidenceReviewsTable).where(eq(evidenceReviewsTable.id, fixtureIds.rolledBackReview));
  await db.delete(remediationPlansTable).where(eq(remediationPlansTable.id, fixtureIds.remediation));
  await db.delete(gapsTable).where(eq(gapsTable.id, fixtureIds.gap));
  await db.delete(assessmentAttemptsTable).where(eq(assessmentAttemptsTable.id, fixtureIds.reassessment));
  await db.delete(evidenceTable).where(inArray(evidenceTable.id, [fixtureIds.evidence, fixtureIds.pathBEvidence]));
  await db.delete(evidenceTable).where(eq(evidenceTable.id, fixtureIds.rolledBackEvidence));
  if (routeRecords.evidenceIds.length) {
    await db.delete(evidenceTable).where(inArray(evidenceTable.id, routeRecords.evidenceIds));
  }
  await db.delete(practiceAttemptsTable).where(inArray(practiceAttemptsTable.id, [fixtureIds.practice, fixtureIds.rolledBackPractice]));
  if (routeRecords.practiceIds.length) {
    await db.delete(practiceAttemptsTable).where(inArray(practiceAttemptsTable.id, routeRecords.practiceIds));
  }
  await db.delete(enrollmentPathwayEventsTable).where(eq(enrollmentPathwayEventsTable.id, fixtureIds.pathwaySelection));
  await db.delete(learningOutcomesTable).where(eq(learningOutcomesTable.id, fixtureIds.outcome));
  await db.delete(learningActivitiesTable).where(eq(learningActivitiesTable.id, activityId));
}

async function startLearnerRouteServer() {
  const app = createIntegrationTestApp(() => ({
    userId: `${fixturePrefix}-clerk-learner`,
    role: "learner",
    learnerId: "learner-demo",
  }));
  const server = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
    const listener = app.listen(0, () => resolve(listener));
  });
  const address = server.address();
  assert(address && typeof address !== "string", "Learner route test server did not bind");
  return {
    baseUrl: `http://127.0.0.1:${(address as AddressInfo).port}/api`,
    close: () => new Promise<void>((resolve, reject) => {
      server.close(error => error ? reject(error) : resolve());
    }),
  };
}

async function postJson(baseUrl: string, path: string, body: unknown) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() as any };
}

async function seedFixtures() {
  await cleanup();
  const existingActivities = await db.select({ sequence: learningActivitiesTable.sequence })
    .from(learningActivitiesTable)
    .where(eq(learningActivitiesTable.lessonId, "lesson-m03-isolation"));
  await db.insert(learningActivitiesTable).values({
    id: activityId,
    lessonId: "lesson-m03-isolation",
    programId: "solar-pv-tech",
    pathwayId: "path-a",
    type: "READING",
    title: "Phase 1 isolated transition fixture",
    description: "Disposable activity owned only by the transition integration test.",
    sequence: existingActivities.reduce((highest, activity) => Math.max(highest, activity.sequence), 0) + 1,
    required: true,
    estimatedDurationMinutes: 1,
    status: "PUBLISHED",
    createdBy: fixturePrefix,
  });
  await db.insert(learningOutcomesTable).values({
    id: fixtureIds.outcome,
    activityId,
    capabilityModuleId: "m03",
    description: "Verify the isolated integration-test transition.",
    verificationMethod: "TRAINER_REVIEW",
    required: true,
    createdBy: fixturePrefix,
  });
  const [lastSelection] = await db.select({ sequence: enrollmentPathwayEventsTable.sequence })
    .from(enrollmentPathwayEventsTable)
    .where(eq(enrollmentPathwayEventsTable.enrollmentId, "enrol-demo"))
    .orderBy(desc(enrollmentPathwayEventsTable.sequence))
    .limit(1);
  await db.insert(enrollmentPathwayEventsTable).values({
    id: fixtureIds.pathwaySelection,
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
  assert(learningNextAction("LEARNING_COMPLETED", { activityId }).action === "WAIT_FOR_VERIFICATION", "Completion bypassed outcome verification");
  assert(learningNextAction("PRACTICE_REQUIRED", { activityId, taskId: "task-m03" }).href?.startsWith("/practice?"), "Practice next action is not linked");
  assert(learningNextAction("PRACTICE_IN_PROGRESS", { activityId, taskId: "task-m03", practiceAttemptId: fixtureIds.practice }).href?.includes("practiceAttemptId="), "Evidence next action lost practice causality");

  await seedFixtures();
  const routeServer = await startLearnerRouteServer();
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

    const rejectedPracticeReflection = `${fixturePrefix} rejected route practice`;
    const rejectedPractice = await postJson(routeServer.baseUrl, "/practice/tasks/task-m03/attempts", {
      reflection: rejectedPracticeReflection,
      outputSummary: "This row must be rolled back with its rejected transition.",
      sourceActivityId: activityId,
    });
    assert(rejectedPractice.status === 409, `Rejected practice route returned ${rejectedPractice.status}, expected 409`);
    assert(rejectedPractice.body.status === "REJECTED" && rejectedPractice.body.reason === "INVALID_TRANSITION", "Rejected practice route lost the transition rejection reason");
    const orphanPractice = await db.select().from(practiceAttemptsTable).where(eq(practiceAttemptsTable.reflection, rejectedPracticeReflection));
    assert(orphanPractice.length === 0, "Rejected practice route left an orphan attempt");

    const rejectedEvidenceTitle = `${fixturePrefix} rejected route evidence`;
    const rejectedEvidence = await postJson(routeServer.baseUrl, "/evidence", {
      moduleId: "m03",
      taskId: "task-m03",
      title: rejectedEvidenceTitle,
      type: "Checklist",
      description: "This evidence and its review must roll back.",
      fileName: null,
      sourceActivityId: activityId,
      practiceAttemptId: fixtureIds.practice,
    });
    assert(rejectedEvidence.status === 409, `Rejected evidence route returned ${rejectedEvidence.status}, expected 409`);
    assert(rejectedEvidence.body.status === "REJECTED" && rejectedEvidence.body.reason === "INVALID_TRANSITION", "Rejected evidence route lost the transition rejection reason");
    const orphanEvidence = await db.select().from(evidenceTable).where(eq(evidenceTable.title, rejectedEvidenceTitle));
    assert(orphanEvidence.length === 0, "Rejected evidence route left orphan evidence");
    const orphanReviews = orphanEvidence.length
      ? await db.select().from(evidenceReviewsTable).where(inArray(evidenceReviewsTable.evidenceId, orphanEvidence.map(({ id }) => id)))
      : [];
    assert(orphanReviews.length === 0, "Rejected evidence route left an orphan initial review");

    try {
      await db.transaction(async (tx) => {
        await tx.insert(practiceAttemptsTable).values({
          id: fixtureIds.rolledBackPractice,
          taskId: "task-m03",
          learnerId: "learner-demo",
          pathwayId: "path-a",
          reflection: "Must roll back",
          outputSummary: "Must roll back",
          status: "Submitted",
        });
        const rejected = await transitionLearningState(command("NOT_STARTED", "PRACTICE_IN_PROGRESS", "rollback-practice", {
          practiceAttemptId: fixtureIds.rolledBackPractice,
        }), actorLearner, tx);
        assert(!rejected.ok, "Invalid atomic practice transition unexpectedly succeeded");
        throw new Error("ROLLBACK_EXPECTED");
      });
    } catch (error) {
      assert(error instanceof Error && error.message === "ROLLBACK_EXPECTED", "Unexpected atomic practice rollback error");
    }
    assert(!(await db.select().from(practiceAttemptsTable).where(eq(practiceAttemptsTable.id, fixtureIds.rolledBackPractice)))[0], "Rejected practice transition left an orphan attempt");

    try {
      await db.transaction(async (tx) => {
        await tx.insert(evidenceTable).values({
          id: fixtureIds.rolledBackEvidence,
          learnerId: "learner-demo",
          pathwayId: "path-a",
          moduleId: "m03",
          taskId: "task-m03",
          title: "Must roll back",
          type: "Checklist",
          description: "Must roll back",
        });
        await tx.insert(evidenceReviewsTable).values({
          id: fixtureIds.rolledBackReview,
          evidenceId: fixtureIds.rolledBackEvidence,
          status: "Under review",
          quality: { valid: false, relevant: false, sufficient: false, traceable: false },
        });
        const rejected = await transitionLearningState(command("NOT_STARTED", "EVIDENCE_SUBMITTED", "rollback-evidence", {
          practiceAttemptId: fixtureIds.practice,
          evidenceId: fixtureIds.rolledBackEvidence,
        }), actorLearner, tx);
        assert(!rejected.ok, "Invalid atomic evidence transition unexpectedly succeeded");
        throw new Error("ROLLBACK_EXPECTED");
      });
    } catch (error) {
      assert(error instanceof Error && error.message === "ROLLBACK_EXPECTED", "Unexpected atomic evidence rollback error");
    }
    assert(!(await db.select().from(evidenceTable).where(eq(evidenceTable.id, fixtureIds.rolledBackEvidence)))[0], "Rejected evidence transition left orphan evidence");
    assert(!(await db.select().from(evidenceReviewsTable).where(eq(evidenceReviewsTable.id, fixtureIds.rolledBackReview)))[0], "Rejected evidence transition left an orphan initial review");

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
      outcomeId: fixtureIds.outcome,
    }), actorTrainer), "outcome verification");
    const afterOutcome = await readiness(await learnerContext());
    assert(JSON.stringify(beforeReadiness) === JSON.stringify(afterOutcome), "Outcome verification changed readiness");

    expectSuccess(await transitionLearningState(command("OUTCOME_VERIFIED", "PRACTICE_REQUIRED", "practice-required"), actorTrainer), "practice required");
    const createdPractice = await postJson(routeServer.baseUrl, "/practice/tasks/task-m03/attempts", {
      reflection: `${fixturePrefix} successful route practice`,
      outputSummary: "Successful route practice output.",
      sourceActivityId: activityId,
    });
    assert(createdPractice.status === 201, `Successful practice route returned ${createdPractice.status}, expected 201`);
    assert(createdPractice.body.nextAction?.action === "SUBMIT_EVIDENCE", "Successful practice route did not return its causal next action");
    routeRecords.practiceIds.push(createdPractice.body.id);
    const crossPathEvidence = await transitionLearningState(command("PRACTICE_IN_PROGRESS", "EVIDENCE_SUBMITTED", "cross-path-evidence", {
      evidenceId: fixtureIds.pathBEvidence,
    }), actorLearner);
    assert(!crossPathEvidence.ok && crossPathEvidence.value.reason === "CAUSAL_REFERENCE_INVALID", "Path B evidence was accepted for Path A");
    const createdEvidence = await postJson(routeServer.baseUrl, "/evidence", {
      moduleId: "m03",
      taskId: "task-m03",
      title: `${fixturePrefix} successful route evidence`,
      type: "Checklist",
      description: "Successful route evidence linked to the new practice attempt.",
      fileName: null,
      sourceActivityId: activityId,
      practiceAttemptId: createdPractice.body.id,
    });
    assert(createdEvidence.status === 201, `Successful evidence route returned ${createdEvidence.status}, expected 201`);
    assert(createdEvidence.body.practiceAttemptId === createdPractice.body.id, "Successful evidence response lost its practice-attempt link");
    routeRecords.evidenceIds.push(createdEvidence.body.id);
    const [createdReview] = await db.select().from(evidenceReviewsTable).where(eq(evidenceReviewsTable.evidenceId, createdEvidence.body.id));
    assert(createdReview?.status === "Under review", "Successful evidence route did not create the initial review");
    routeRecords.reviewIds.push(createdReview.id);
    expectSuccess(await transitionLearningState(command("EVIDENCE_SUBMITTED", "UNDER_REVIEW", "review", {
      evidenceId: createdEvidence.body.id,
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
    assert(links.some(link => link.practiceAttemptId === createdPractice.body.id), "Route-created practice attempt causal link was not recorded");
    assert(links.some(link => link.evidenceId === createdEvidence.body.id && link.practiceAttemptId === createdPractice.body.id), "Route-created evidence was not causally linked to its practice attempt");
    assert(links.some(link => link.gapId === fixtureIds.gap && link.remediationPlanId === fixtureIds.remediation), "Causal remediation link was not recorded");
    assert(links.some(link => link.reassessmentAttemptId === fixtureIds.reassessment), "Causal reassessment link was not recorded");
    process.stdout.write("Learning transition integration checks passed\n");
  } finally {
    await routeServer.close();
    await cleanup();
  }
}

run().catch((error: unknown) => {
  process.stderr.write(`${error}\n`);
  process.exitCode = 1;
});