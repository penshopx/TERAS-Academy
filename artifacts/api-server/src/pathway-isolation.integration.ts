import {
  assessmentAttemptsTable,
  criterionObservationsTable,
  db,
  evidenceReviewsTable,
  evidenceTable,
  learningRecordLinksTable,
  learningTransitionEventsTable,
  practiceAttemptsTable,
  practiceReviewsTable,
} from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import crypto from "node:crypto";

const baseUrl = process.env.TERAS_API_URL ?? "http://localhost:80/api";
const fixtureScopedKey = (operation: string, key: string) =>
  `${operation}:${crypto.createHash("sha256").update(JSON.stringify({ learnerId: "learner-demo", key })).digest("hex")}`;

async function request<T>(
  path: string,
  options?: RequestInit,
  expectedStatus = 200,
): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...options?.headers,
    },
  });
  if (response.status !== expectedStatus) {
    throw new Error(
      `${options?.method ?? "GET"} ${path} returned ${response.status}, expected ${expectedStatus}: ${await response.text()}`,
    );
  }
  return response.json() as Promise<T>;
}

const post = <T>(path: string, body: unknown, expectedStatus = 200) =>
  request<T>(
    path,
    { method: "POST", body: JSON.stringify(body) },
    expectedStatus,
  );

type AssessmentDetail = {
  criteria: Array<{ id: string }>;
};

type Readiness = {
  pathway: { id: string };
  gates: Array<{ code: string; status: string }>;
};

type Dashboard = {
  pathway: { id: string };
  currentLearning: { pathwayId: string };
};

type ReviewQueue = {
  recentActivity: Array<{ pathwayId: string }>;
};

async function removePreviousIntegrationRecords() {
  await db.delete(learningTransitionEventsTable).where(
    inArray(learningTransitionEventsTable.idempotencyKey, [
      fixtureScopedKey("practice-attempt", "pathway-isolation-b04-practice-attempt"),
      fixtureScopedKey("evidence-submit", "pathway-isolation-b04-evidence"),
    ]),
  );

  const rationales = [
    "Path B integration verification",
    "Partial B2 verification",
    ...["b03", "b04", "b05", "b06", "b07", "b08"].map(
      (moduleId) => `Path B ${moduleId} gate verification`,
    ),
  ];
  const attempts = await db
    .select({ id: assessmentAttemptsTable.id })
    .from(assessmentAttemptsTable)
    .where(inArray(assessmentAttemptsTable.decisionRationale, rationales));
  if (attempts.length) {
    const attemptIds = attempts.map((attempt) => attempt.id);
    await db
      .delete(criterionObservationsTable)
      .where(inArray(criterionObservationsTable.attemptId, attemptIds));
    await db
      .delete(assessmentAttemptsTable)
      .where(inArray(assessmentAttemptsTable.id, attemptIds));
  }

  const integrationEvidence = await db
    .select({ id: evidenceTable.id })
    .from(evidenceTable)
    .where(
      inArray(evidenceTable.description, [
        "Traceable Path B integration evidence",
        ...["b02", "b03", "b04", "b05", "b06", "b07", "b08"].map(
          (moduleId) => `Traceable Path B ${moduleId} integration evidence`,
        ),
      ]),
    );
  if (integrationEvidence.length) {
    const evidenceIds = integrationEvidence.map((evidence) => evidence.id);
    await db.delete(learningTransitionEventsTable).where(
      inArray(learningTransitionEventsTable.entityReference, evidenceIds),
    );
    await db.delete(learningRecordLinksTable).where(inArray(learningRecordLinksTable.evidenceId, evidenceIds));
    await db.delete(evidenceReviewsTable).where(inArray(evidenceReviewsTable.evidenceId, evidenceIds));
    await db.delete(evidenceTable).where(inArray(evidenceTable.id, evidenceIds));
  }

  const practiceAttempts = await db
    .select({ id: practiceAttemptsTable.id })
    .from(practiceAttemptsTable)
    .where(eq(practiceAttemptsTable.reflection, "Verified pathway-scoped practice"));
  if (practiceAttempts.length) {
    const practiceAttemptIds = practiceAttempts.map((attempt) => attempt.id);
    await db.delete(learningTransitionEventsTable).where(
      inArray(learningTransitionEventsTable.entityReference, practiceAttemptIds),
    );
    await db.delete(learningRecordLinksTable).where(inArray(learningRecordLinksTable.practiceAttemptId, practiceAttemptIds));
    await db
      .delete(practiceReviewsTable)
      .where(inArray(practiceReviewsTable.attemptId, practiceAttemptIds));
    await db
      .delete(practiceAttemptsTable)
      .where(inArray(practiceAttemptsTable.id, practiceAttemptIds));
  }
  await db.delete(learningTransitionEventsTable).where(
    eq(learningTransitionEventsTable.idempotencyKey, "pathway-isolation-b04-practice-required"),
  );
}

async function seedReadinessEvidence(moduleId: string) {
  const evidenceId = `pathway-isolation-evidence-${moduleId}`;
  await db.insert(evidenceTable).values({
    id: evidenceId,
    learnerId: "learner-demo",
    pathwayId: "path-b",
    moduleId,
    taskId: `task-${moduleId}`,
    title: `Path B ${moduleId} integration evidence`,
    type: "Report",
    description: `Traceable Path B ${moduleId} integration evidence`,
    fileName: null,
  });
  await db.insert(evidenceReviewsTable).values({
    id: `pathway-isolation-evidence-review-${moduleId}`,
    evidenceId,
    reviewerId: "trainer-aria",
    status: "Valid",
    comment: `Path B ${moduleId} evidence verified`,
    quality: { valid: true, relevant: true, sufficient: true, traceable: true },
  });
}

async function completePathBModule(moduleId: string, seedEvidence = true) {
  const detail = await request<AssessmentDetail>(`/assessments/assessment-${moduleId}`);
  await post(
    `/assessor/assessments/assessment-${moduleId}/decision`,
    {
      decision: "Competent",
      observation: `Path B ${moduleId} gate verification`,
      criteria: detail.criteria.map((criterion) => ({
        criterionId: criterion.id,
        score: 3,
        observation: "Meets the Path B standard",
        evidenceId: null,
      })),
    },
    201,
  );
  if (seedEvidence) await seedReadinessEvidence(moduleId);
}

async function completeB04WithCausalApiFlow() {
  const activityId = "activity-b04-protection";
  await db.insert(learningTransitionEventsTable).values({
    id: "pathway-isolation-b04-practice-required",
    activityId,
    learnerId: "learner-demo",
    enrollmentId: "enrol-demo",
    programId: "solar-pv-tech",
    pathwayId: "path-b",
    fromState: "OUTCOME_VERIFIED",
    toState: "PRACTICE_REQUIRED",
    actorId: "trainer-aria",
    actorRole: "trainer",
    entityReference: "pathway-isolation-b04-practice-required",
    reason: "Controlled readiness isolation fixture",
    idempotencyKey: "pathway-isolation-b04-practice-required",
    createdBy: "trainer-aria",
  });
  const practice = await post<{ id: string }>("/practice/tasks/task-b04/attempts", {
    sourceActivityId: activityId,
    reflection: "Verified pathway-scoped practice",
    outputSummary: "Path B protection design rationale",
    idempotencyKey: "pathway-isolation-b04-practice-attempt",
  }, 201);
  const evidence = await post<{ id: string }>("/evidence", {
    sourceActivityId: activityId,
    practiceAttemptId: practice.id,
    moduleId: "b04",
    taskId: "task-b04",
    title: "Path B b04 integration evidence",
    type: "Report",
    description: "Traceable Path B b04 integration evidence",
    fileName: null,
    idempotencyKey: "pathway-isolation-b04-evidence",
  }, 201);
  await post(`/trainer/evidence/${evidence.id}/review`, {
    status: "Valid",
    comment: "Path B b04 evidence verified",
    quality: { valid: true, relevant: true, sufficient: true, traceable: true },
  });
}

async function run() {
  await removePreviousIntegrationRecords();
  await post("/learner/pathway", { pathwayId: "path-b" }, 201);

  const detail = await request<AssessmentDetail>("/assessments/assessment-b01");
  await post(
    "/assessor/assessments/assessment-b01/decision",
    {
      decision: "Competent",
      observation: "Path B integration verification",
      criteria: detail.criteria.map((criterion) => ({
        criterionId: criterion.id,
        score: 3,
        observation: "Meets the Path B standard",
        evidenceId: null,
      })),
    },
    201,
  );

  const readiness = await request<Readiness>("/readiness");
  if (
    readiness.pathway.id !== "path-b" ||
    readiness.gates.find((gate) => gate.code === "B1")?.status !== "Passed"
  ) {
    throw new Error("Path B assessment did not update the Path B readiness gate");
  }

  const practice = { id: "pathway-isolation-practice-b01" };
  await db.insert(practiceAttemptsTable).values({
    id: practice.id,
    taskId: "task-b01",
    learnerId: "learner-demo",
    pathwayId: "path-b",
    reflection: "Verified pathway-scoped practice",
    outputSummary: "Path B client brief",
    status: "Submitted",
    createdBy: "learner-demo",
  });
  await db.insert(evidenceTable).values({
    id: "pathway-isolation-evidence-b01",
    learnerId: "learner-demo",
    pathwayId: "path-b",
    moduleId: "b01",
    taskId: "task-b01",
    title: "Path B client brief evidence",
    type: "Design brief",
    description: "Traceable Path B integration evidence",
    fileName: null,
    createdBy: "learner-demo",
  });
  const evidence = { id: "pathway-isolation-evidence-b01" };
  await db.insert(practiceReviewsTable).values([
    {
      id: "pathway-isolation-practice-review-b01-revision",
      attemptId: practice.id,
      reviewerId: "trainer-aria",
      status: "Needs revision",
      feedback: "Path B practice requires one traceability correction",
      createdBy: "trainer-aria",
    },
    {
      id: "pathway-isolation-practice-review-b01-reviewed",
      attemptId: practice.id,
      reviewerId: "trainer-aria",
      status: "Reviewed",
      feedback: "Path B practice verified after correction",
      createdBy: "trainer-aria",
    },
  ]);
  const practiceHistory = await db
    .select()
    .from(practiceReviewsTable)
    .where(eq(practiceReviewsTable.attemptId, practice.id));
  if (
    practiceHistory.length !== 2 ||
    !practiceHistory.some((review) => review.status === "Needs revision") ||
    !practiceHistory.some((review) => review.status === "Reviewed")
  ) {
    throw new Error("Practice review history was overwritten rather than appended");
  }
  await db.insert(evidenceReviewsTable).values({
    id: "pathway-isolation-evidence-review-b01",
    evidenceId: evidence.id,
    reviewerId: "trainer-aria",
    status: "Valid",
    comment: "Path B evidence verified",
    quality: { valid: true, relevant: true, sufficient: true, traceable: true },
    createdBy: "trainer-aria",
  });

  const b02Detail = await request<AssessmentDetail>("/assessments/assessment-b02");
  await post(
    "/assessor/assessments/assessment-b02/decision",
    {
      decision: "Competent",
      observation: "Partial B2 verification",
      criteria: b02Detail.criteria.map((criterion) => ({
        criterionId: criterion.id,
        score: 3,
        observation: "Meets the Path B standard",
        evidenceId: null,
      })),
    },
    201,
  );
  const partialB2 = await request<Readiness>("/readiness");
  if (partialB2.gates.find((gate) => gate.code === "B2")?.status === "Passed") {
    throw new Error("B2 passed after only one of its required assessments");
  }
  await seedReadinessEvidence("b02");
  for (const moduleId of ["b03", "b05", "b06"]) {
    await completePathBModule(moduleId);
  }
  await completePathBModule("b04", false);
  await completeB04WithCausalApiFlow();
  const completeB2 = await request<Readiness>("/readiness");
  if (
    completeB2.gates.find((gate) => gate.code === "B2")?.status !== "Passed" ||
    completeB2.gates.find((gate) => gate.code === "B4")?.status === "Passed"
  ) {
    throw new Error("B2 did not pass after all requirements, or B4 passed prematurely");
  }
  await completePathBModule("b07");
  await completePathBModule("b08");
  const completeB4 = await request<Readiness>("/readiness");
  if (completeB4.gates.find((gate) => gate.code === "B4")?.status !== "Passed") {
    throw new Error("B4 did not pass after all Path B assessments and evidence");
  }

  await post("/learner/pathway", { pathwayId: "path-a" }, 201);
  await request("/modules/b01", undefined, 404);
  await request("/assessments/assessment-b01", undefined, 404);
  await post(
    `/trainer/practice/${practice.id}/review`,
    { status: "Reviewed", feedback: "Must be rejected outside Path B" },
    403,
  );
  await post(
    `/trainer/evidence/${evidence.id}/review`,
    {
      status: "Valid",
      comment: "Must be rejected outside Path B",
      quality: { valid: true, relevant: true, sufficient: true, traceable: true },
    },
    403,
  );

  const pathADashboard = await request<Dashboard>("/learner/dashboard");
  if (
    pathADashboard.pathway.id !== "path-a" ||
    pathADashboard.currentLearning.pathwayId !== "path-a"
  ) {
    throw new Error("Path A dashboard included Path B learner state");
  }

  await post("/learner/pathway", { pathwayId: "path-b" }, 201);
  const pathBDashboard = await request<Dashboard>("/learner/dashboard");
  const assessorDashboard = await request<ReviewQueue>("/assessor/dashboard");
  if (
    pathBDashboard.pathway.id !== "path-b" ||
    pathBDashboard.currentLearning.pathwayId !== "path-b" ||
    assessorDashboard.recentActivity.some((item) => item.pathwayId !== "path-b")
  ) {
    throw new Error("Path B dashboard or assessor queue included Path A state");
  }

  process.stdout.write("Pathway isolation integration check passed\n");
}

run().catch((error: unknown) => {
  process.stderr.write(`${error}\n`);
  process.exitCode = 1;
});