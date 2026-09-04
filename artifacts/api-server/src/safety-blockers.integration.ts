import type { AddressInfo } from "node:net";
import {
  assessmentAttemptsTable,
  criterionObservationsTable,
  db,
  enrollmentPathwayEventsTable,
  evidenceReviewsTable,
  gapEventsTable,
  learningRecordLinksTable,
  learningTransitionEventsTable,
  practiceAttemptsTable,
  reassessmentLinksTable,
  remediationEventsTable,
  readinessEventsTable,
} from "@workspace/db";
import { and, desc, eq, inArray, or } from "drizzle-orm";
import { createIntegrationTestApp } from "./integration-test-app";

type Identity = "learner" | "trainer" | "assessor" | "other" | "anonymous";
type AssessmentDetail = {
  assessment: { criticalFailure: boolean; status: string; score: number };
  criteria: Array<{ id: string; critical: boolean }>;
  attempts: Array<{ id: string; number: number; decision: string | null }>;
};
type Readiness = {
  status: string;
  gates: Array<{ code: string; status: string }>;
  blockers: string[];
  missingEvidenceCount: number;
};
type Evidence = Array<{ id: string; status: string }>;
type Remediation = Array<{ id: string; status: string }>;
type Passport = {
  readiness: { status: string };
  readinessDisclaimer: string;
  achievements: Array<{ capability: string; status: string }>;
  timeline: Array<{ id: string; pathwayId: string | null; pathwayName: string | null; label: string }>;
};
type Journey = Array<{ id: string; status: string }>;

const marker = "Safety blocker integration verification";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function restoreBaseline() {
  await db
    .delete(learningTransitionEventsTable)
    .where(eq(learningTransitionEventsTable.id, "test-m03-reassessment-transition"));
  await db
    .delete(reassessmentLinksTable)
    .where(eq(reassessmentLinksTable.id, "test-rem-m07-causal-reassessment"));
  await db
    .delete(learningRecordLinksTable)
    .where(eq(learningRecordLinksTable.practiceAttemptId, "test-rem-m07-repractice"));
  const attempts = await db
    .select({ id: assessmentAttemptsTable.id })
    .from(assessmentAttemptsTable)
    .where(
      and(
        inArray(assessmentAttemptsTable.assessmentId, ["assessment-m03", "assessment-m07"]),
        eq(assessmentAttemptsTable.learnerId, "learner-demo"),
        eq(assessmentAttemptsTable.pathwayId, "path-a"),
      ),
    );
  if (attempts.length) {
    const attemptIds = attempts.map(({ id }) => id);
    await db
      .delete(reassessmentLinksTable)
      .where(or(
        inArray(reassessmentLinksTable.reassessmentAttemptId, attemptIds),
        inArray(reassessmentLinksTable.previousAssessmentAttemptId, attemptIds),
      ));
    await db
      .delete(criterionObservationsTable)
      .where(inArray(criterionObservationsTable.attemptId, attemptIds));
    await db
      .delete(assessmentAttemptsTable)
      .where(inArray(assessmentAttemptsTable.id, attemptIds));
  }
  await db
    .delete(practiceAttemptsTable)
    .where(eq(practiceAttemptsTable.id, "test-rem-m07-repractice"));
  await db.insert(assessmentAttemptsTable).values({
    id: "attempt-m03-1",
    assessmentId: "assessment-m03",
    learnerId: "learner-demo",
    pathwayId: "path-a",
    number: 1,
    assessorId: "assessor-sam",
    status: "Completed",
    decision: "Competent",
    createdAt: new Date("2025-02-14T10:00:00.000Z"),
  });
  await db.insert(criterionObservationsTable).values([
    { id: "obs-m03-1", attemptId: "attempt-m03-1", criterionId: "crit-m03-isolation", score: 3, observation: "Sequence completed without prompting.", evidenceId: "evidence-m03" },
    { id: "obs-m03-2", attemptId: "attempt-m03-1", criterionId: "crit-m03-test", score: 3, observation: "Tester proven before and after use.", evidenceId: "evidence-m03" },
  ]);

  await db.delete(evidenceReviewsTable).where(eq(evidenceReviewsTable.evidenceId, "evidence-m07"));
  await db.insert(evidenceReviewsTable).values({
    id: "review-m07", evidenceId: "evidence-m07", reviewerId: "assessor-sam",
    status: "Under review", comment: null,
    quality: { valid: false, relevant: true, sufficient: false, traceable: true },
    createdAt: new Date("2025-02-14T10:00:00.000Z"),
  });
  await db.delete(gapEventsTable).where(eq(gapEventsTable.gapId, "gap-m07"));
  await db.insert(gapEventsTable).values({ id: "gap-event-m07", gapId: "gap-m07", status: "Open" });
  await db.delete(remediationEventsTable).where(eq(remediationEventsTable.activityId, "rem-act-m07"));
  await db.insert(remediationEventsTable).values({ id: "rem-event-m07", activityId: "rem-act-m07", status: "Not started" });
  await db.delete(readinessEventsTable).where(inArray(readinessEventsTable.gateId, ["gate-g1", "gate-g2"]));
  await db.insert(readinessEventsTable).values([
    { id: "ready-demo-g1", enrollmentId: "enrol-demo", pathwayId: "path-a", gateId: "gate-g1", status: "Passed", score: 55, blockers: [], createdAt: new Date("2025-02-14T10:00:00.000Z") },
    { id: "ready-demo-g2", enrollmentId: "enrol-demo", pathwayId: "path-a", gateId: "gate-g2", status: "In progress", score: 55, blockers: ["Commissioning evidence review pending"], createdAt: new Date("2025-02-14T10:00:00.000Z") },
  ]);
  // The seeded enrollment's path-a assignment is the baseline; selections are events.
  await db.delete(enrollmentPathwayEventsTable).where(eq(enrollmentPathwayEventsTable.enrollmentId, "enrol-demo"));
}

async function run() {
  await restoreBaseline();
  const app = createIntegrationTestApp((req) => {
    const identity = req.get("x-teras-integration-identity") as Identity | undefined;
    if (identity === "learner") return { userId: "test-learner", role: "learner" };
    if (identity === "trainer") return { userId: "test-trainer", role: "trainer" };
    if (identity === "assessor") return { userId: "test-assessor", role: "assessor" };
    if (identity === "other") return { userId: "test-other", role: null };
    return { userId: null, role: null };
  });
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  const request = async <T>(path: string, identity: Identity, options?: RequestInit, expected = 200): Promise<T> => {
    const response = await fetch(`${baseUrl}${path}`, {
      ...options,
      headers: { "content-type": "application/json", "x-teras-integration-identity": identity, ...options?.headers },
    });
    if (response.status !== expected) throw new Error(`${options?.method ?? "GET"} ${path}: expected ${expected}, got ${response.status}: ${await response.text()}`);
    return response.json() as Promise<T>;
  };
  const post = <T>(path: string, identity: Identity, body: unknown, expected = 200) =>
    request<T>(path, identity, { method: "POST", body: JSON.stringify(body) }, expected);

  try {
    // Test identities exist only in this in-process app; wrong authenticated roles
    // must not receive the development demo learner allowance.
    await post("/learner/pathway", "assessor", { pathwayId: "path-a" }, 403);
    await post("/learner/pathway", "anonymous", { pathwayId: "path-a" }, 401);
    await post("/learner/pathway", "learner", { pathwayId: "path-b" }, 201);
    await post("/learner/pathway", "learner", { pathwayId: "path-a" }, 201);

    const m03 = await request<AssessmentDetail>("/assessments/assessment-m03?learnerId=learner-demo", "assessor");
    await post("/assessor/assessments/assessment-m03/decision", "learner", {
      learnerId: "learner-demo",
      decision: "Competent", observation: marker,
      criteria: m03.criteria.map((criterion) => ({ criterionId: criterion.id, score: 3, observation: "Must not be accepted.", evidenceId: null })),
    }, 403);
    const attemptsAfterUnauthorizedDecision = await db
      .select()
      .from(assessmentAttemptsTable)
      .where(eq(assessmentAttemptsTable.assessmentId, "assessment-m03"));
    assert(attemptsAfterUnauthorizedDecision.length === 1, "Unauthorized learner decision mutated assessment history");
    await post("/trainer/evidence/evidence-m07/review", "assessor", {
      status: "Valid", comment: "Must not be accepted.",
      quality: { valid: true, relevant: true, sufficient: true, traceable: true },
    }, 403);
    const reviewsAfterUnauthorizedReview = await db
      .select()
      .from(evidenceReviewsTable)
      .where(eq(evidenceReviewsTable.evidenceId, "evidence-m07"));
    assert(reviewsAfterUnauthorizedReview.length === 1, "Unauthorized assessor review mutated evidence history");
    await post("/assessor/assessments/assessment-m03/decision", "assessor", {
      learnerId: "learner-demo",
      decision: "Competent", observation: marker,
      criteria: m03.criteria.map((criterion, index) => ({
        criterionId: criterion.id,
        score: index === 0 ? 1 : 3,
        observation: index === 0 ? "One critical criterion failed despite the highest possible remaining scores." : "Other criterion met.",
        evidenceId: null,
      })),
    }, 201);
    const failedM03 = await request<AssessmentDetail>("/assessments/assessment-m03?learnerId=learner-demo", "assessor");
    assert(
      failedM03.assessment.score === 67 &&
        failedM03.assessment.criticalFailure &&
        failedM03.attempts[0]?.decision === "Not competent",
      "M03 critical criterion did not override requested Competent decision at the highest possible failing average",
    );
    const blocked = await request<Readiness>("/readiness", "learner");
    assert(blocked.status === "Blocked" && blocked.blockers.some((blocker) => blocker.includes("Critical safety failure in M03")), "M03 critical failure did not block readiness");

    const m07 = await request<AssessmentDetail>("/assessments/assessment-m07?learnerId=learner-demo", "assessor");
    await post("/assessor/assessments/assessment-m07/decision", "assessor", {
      learnerId: "learner-demo",
      decision: "Competent", observation: `${marker}: M07 technical readiness`,
      criteria: m07.criteria.map((criterion, index) => ({ criterionId: criterion.id, score: 3, observation: "Commissioning criterion met.", evidenceId: index === 0 ? "evidence-m07" : null })),
    }, 201);
    const missingM07Evidence = await request<Readiness>("/readiness", "learner");
    assert(
      missingM07Evidence.gates.find((gate) => gate.code === "G2")?.status !== "Passed" &&
        missingM07Evidence.missingEvidenceCount > 0,
      "M07 technical assessment bypassed its valid-evidence requirement",
    );
    const quality = { valid: true, relevant: true, sufficient: true, traceable: true };
    await post("/trainer/evidence/evidence-m07/review", "trainer", { status: "Needs revision", comment: `${marker}: revision`, quality: { ...quality, sufficient: false } });
    const revised = await request<Evidence>("/evidence", "learner");
    assert(revised.find(({ id }) => id === "evidence-m07")?.status === "Needs revision", "Evidence revision was not persisted to GET");
    // Readiness projections order append-only reviews by timestamp.
    await new Promise((resolve) => setTimeout(resolve, 5));
    await post("/trainer/evidence/evidence-m07/review", "trainer", { status: "Valid", comment: `${marker}: valid`, quality });
    const valid = await request<Evidence>("/evidence", "learner");
    assert(valid.find(({ id }) => id === "evidence-m07")?.status === "Valid", "Valid M07 evidence was not persisted to GET");
    const reviewHistory = await db.select().from(evidenceReviewsTable).where(eq(evidenceReviewsTable.evidenceId, "evidence-m07"));
    assert(reviewHistory.length === 3 && reviewHistory.some((review) => review.status === "Needs revision") && reviewHistory.some((review) => review.status === "Valid"), "Evidence review history was overwritten rather than appended");

    const remediationHistoryBeforeCompletion = await db
      .select()
      .from(remediationEventsTable)
      .where(eq(remediationEventsTable.activityId, "rem-act-m07"));
    const rejectedCompletion = await post<{ error: string }>(
      "/remediation/rem-m07/complete",
      "learner",
      {},
      409,
    );
    assert(
      rejectedCompletion.error === "REMEDIATION_PREREQUISITES_NOT_MET",
      "Incomplete remediation did not return the canonical prerequisite error",
    );
    const remediationHistoryAfterRejection = await db
      .select()
      .from(remediationEventsTable)
      .where(eq(remediationEventsTable.activityId, "rem-act-m07"));
    assert(
      remediationHistoryAfterRejection.length === remediationHistoryBeforeCompletion.length,
      "Rejected remediation completion inserted an event",
    );
    await db.insert(remediationEventsTable).values({
      id: "test-rem-m07-prerequisites-complete",
      activityId: "rem-act-m07",
      status: "Completed",
      createdBy: "trainer-sari",
    });
    const [m07Reassessment] = await db
      .select()
      .from(assessmentAttemptsTable)
      .where(and(
        eq(assessmentAttemptsTable.assessmentId, "assessment-m07"),
        eq(assessmentAttemptsTable.learnerId, "learner-demo"),
        eq(assessmentAttemptsTable.pathwayId, "path-a"),
        eq(assessmentAttemptsTable.decision, "Competent"),
      ))
      .orderBy(desc(assessmentAttemptsTable.createdAt))
      .limit(1);
    assert(m07Reassessment, "M07 competent reassessment fixture was not created");
    await db.insert(practiceAttemptsTable).values({
      id: "test-rem-m07-repractice",
      taskId: "task-m07",
      learnerId: "learner-demo",
      pathwayId: "path-a",
      reflection: "Re-practice completed for the M07 safety regression fixture",
      outputSummary: "Commissioning checks repeated after remediation",
      status: "Submitted",
      createdBy: "learner-demo",
    });
    await db.insert(reassessmentLinksTable).values({
      id: "test-rem-m07-causal-reassessment",
      learnerId: "learner-demo",
      pathwayId: "path-a",
      originalGapId: "gap-m07",
      remediationPlanId: "rem-m07",
      practiceAttemptId: "test-rem-m07-repractice",
      evidenceId: "evidence-m07",
      reassessmentAttemptId: m07Reassessment.id,
      createdBy: "assessor-sam",
    });
    await post("/remediation/rem-m07/complete", "learner", {}, 200);
    const remediation = await request<Remediation>("/remediation", "learner");
    assert(remediation.find(({ id }) => id === "rem-m07")?.status === "Completed", "Completed remediation was not returned by GET");
    const remediationHistory = await db
      .select()
      .from(remediationEventsTable)
      .where(eq(remediationEventsTable.activityId, "rem-act-m07"));
    assert(
      remediationHistory.length === remediationHistoryBeforeCompletion.length + 1 &&
        remediationHistory.some((event) => event.status === "Not started") &&
        remediationHistory.some((event) => event.status === "Completed" && event.createdBy === "trainer-sari"),
      "Remediation prerequisite history was not preserved",
    );
    const stillBlocked = await request<Readiness>("/readiness", "learner");
    assert(stillBlocked.status === "Blocked" && stillBlocked.blockers.some((blocker) => blocker.includes("Critical safety failure in M03")), "Completing remediation cleared unresolved M03 critical failure");

    const failedM03Attempt = failedM03.attempts[0];
    assert(failedM03Attempt, "M03 failed assessment attempt was not created");
    await db.insert(learningTransitionEventsTable).values({
      id: "test-m03-reassessment-transition",
      activityId: "activity-m03-safe-isolation",
      learnerId: "learner-demo",
      enrollmentId: "enrol-demo",
      programId: "solar-pv-tech",
      pathwayId: "path-a",
      fromState: "UNDER_REVIEW",
      toState: "REASSESSMENT",
      actorId: "assessor-sam",
      actorRole: "assessor",
      entityReference: failedM03Attempt.id,
      reason: "Controlled safety blocker reassessment fixture",
      idempotencyKey: "test-m03-reassessment-transition",
      metadata: { references: { reassessmentAttemptId: failedM03Attempt.id } },
      createdBy: "assessor-sam",
    });
    await post("/assessor/assessments/assessment-m03/decision", "assessor", {
      learnerId: "learner-demo",
      decision: "Competent", observation: `${marker}: passing reassessment`,
      criteria: m03.criteria.map((criterion, index) => ({ criterionId: criterion.id, score: 3, observation: "Safe reassessment.", evidenceId: index === 0 ? "evidence-m03" : null })),
    }, 201);
    const reassessed = await request<AssessmentDetail>("/assessments/assessment-m03?learnerId=learner-demo", "assessor");
    assert(!reassessed.assessment.criticalFailure && reassessed.attempts.length === 3, "Passing M03 reassessment did not preserve attempt history or clear latest critical failure");
    const m03History = await db.select().from(assessmentAttemptsTable).where(eq(assessmentAttemptsTable.assessmentId, "assessment-m03"));
    assert(m03History.length === 3 && m03History.some((attempt) => attempt.decision === "Not competent") && m03History.some((attempt) => attempt.decision === "Competent" && attempt.decisionRationale === `${marker}: passing reassessment`), "Assessment attempt history was not immutable in the database");
    const cleared = await request<Readiness>("/readiness", "learner");
    assert(
      cleared.status !== "Blocked" &&
        cleared.gates.find((gate) => gate.code === "G1")?.status === "Passed" &&
        cleared.gates.find((gate) => gate.code === "G2")?.status === "Passed",
      "Passing M03 reassessment did not clear the critical blocker or preserve M07 technical readiness",
    );
    const [dashboard, learningPlan, evidenceHistory, gaps, remediationHistoryView, journey, passport] = await Promise.all([
      request<unknown>("/learner/dashboard", "learner"),
      request<unknown[]>("/learner/learning-plan", "learner"),
      request<Evidence>("/evidence", "learner"),
      request<unknown[]>("/gaps", "learner"),
      request<Remediation>("/remediation", "learner"),
      request<Journey>("/learner/journey", "learner"),
      request<Passport>("/passport", "learner"),
    ]);
    assert(Boolean(dashboard) && Array.isArray(learningPlan), "Learner dashboard or learning plan failed after reassessment");
    assert(
      evidenceHistory.length > 0 && gaps.length > 0 && remediationHistoryView.length > 0,
      "Learner evidence, gap, or remediation history disappeared",
    );
    assert(journey.some((step) => step.id === "journey-current"), "Learner journey did not expose its current readiness gate");
    const pathATimeline = passport.timeline.find((step) => step.pathwayId === "path-a");
    const pathBTimeline = passport.timeline.find((step) => step.pathwayId === "path-b");
    assert(
      passport.readiness.status === cleared.status &&
        passport.readinessDisclaimer.includes("not an official competency decision or certification claim") &&
        passport.achievements.some((item) => item.capability === "Safe isolation and verification" && item.status === "Readiness record") &&
        passport.timeline.some((step) => step.id === "pathway-enrol") &&
        pathATimeline?.pathwayName?.startsWith("Path A") &&
        pathBTimeline?.pathwayName?.startsWith("Path B"),
      "Capability Passport did not preserve the longitudinal readiness record, institutional disclaimer, or pathway history",
    );
    process.stdout.write("Safety blocker integration check passed\n");
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await restoreBaseline();
  }
}

run().catch((error: unknown) => {
  process.stderr.write(`${error}\n`);
  process.exitCode = 1;
});