import type { AddressInfo } from "node:net";
import {
  assessmentAttemptsTable,
  assessmentCriteriaTable,
  assessmentsTable,
  criterionObservationsTable,
  db,
  enrollmentsTable,
  evidenceReviewsTable,
  evidenceTable,
  peopleTable,
  personRolesTable,
  practiceAttemptsTable,
  practiceReviewsTable,
  practiceTasksTable,
  readinessEventsTable,
} from "@workspace/db";
import { and, eq, inArray } from "drizzle-orm";
import { createIntegrationTestApp } from "./integration-test-app";
import type { TestAuthorizationIdentity } from "./lib/authorization";

const suffix = crypto.randomUUID();
const trainerA = `readiness-trainer-a-${suffix}`;
const trainerB = `readiness-trainer-b-${suffix}`;
const assessorA = `readiness-assessor-a-${suffix}`;
const assessorB = `readiness-assessor-b-${suffix}`;
const learnerA = `readiness-learner-a-${suffix}`;
const learnerB = `readiness-learner-b-${suffix}`;
const enrollmentA = `readiness-enrollment-a-${suffix}`;
const enrollmentB = `readiness-enrollment-b-${suffix}`;
const evidenceA = `readiness-evidence-a-${suffix}`;
const evidenceB = `readiness-evidence-b-${suffix}`;
const practiceA = `readiness-practice-a-${suffix}`;
const practiceB = `readiness-practice-b-${suffix}`;

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

async function serverFor(identity: TestAuthorizationIdentity) {
  // The identity is injected by the in-process app, rather than being derived
  // from a request header or any HTTP-supplied value.
  const app = createIntegrationTestApp(() => identity);
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  return {
    baseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`,
    close: () => new Promise<void>((resolve, reject) =>
      server.close((error) => error ? reject(error) : resolve())),
  };
}

async function request<T>(baseUrl: string, path: string, options?: RequestInit, expected = 200): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: { "content-type": "application/json", ...options?.headers },
  });
  if (response.status !== expected) {
    throw new Error(`${options?.method ?? "GET"} ${path}: expected ${expected}, got ${response.status}: ${await response.text()}`);
  }
  return response.json() as Promise<T>;
}

async function cleanup() {
  const attempts = await db.select({ id: assessmentAttemptsTable.id }).from(assessmentAttemptsTable)
    .where(inArray(assessmentAttemptsTable.learnerId, [learnerA, learnerB]));
  if (attempts.length) {
    await db.delete(criterionObservationsTable).where(inArray(criterionObservationsTable.attemptId, attempts.map(({ id }) => id)));
    await db.delete(assessmentAttemptsTable).where(inArray(assessmentAttemptsTable.id, attempts.map(({ id }) => id)));
  }
  await db.delete(practiceReviewsTable).where(inArray(practiceReviewsTable.attemptId, [practiceA, practiceB]));
  await db.delete(practiceAttemptsTable).where(inArray(practiceAttemptsTable.id, [practiceA, practiceB]));
  await db.delete(evidenceReviewsTable).where(inArray(evidenceReviewsTable.evidenceId, [evidenceA, evidenceB]));
  await db.delete(evidenceTable).where(inArray(evidenceTable.id, [evidenceA, evidenceB]));
  await db.delete(readinessEventsTable).where(inArray(readinessEventsTable.enrollmentId, [enrollmentA, enrollmentB]));
  await db.delete(enrollmentsTable).where(inArray(enrollmentsTable.id, [enrollmentA, enrollmentB]));
  await db.delete(personRolesTable).where(inArray(personRolesTable.personId, [trainerA, trainerB, assessorA, assessorB]));
  await db.delete(peopleTable).where(inArray(peopleTable.id, [trainerA, trainerB, assessorA, assessorB, learnerA, learnerB]));
}

async function run() {
  await cleanup();
  const [taskA] = await db.select().from(practiceTasksTable).where(eq(practiceTasksTable.moduleId, "m03")).limit(1);
  const [taskB] = await db.select().from(practiceTasksTable).where(eq(practiceTasksTable.moduleId, "b01")).limit(1);
  const [assessmentA] = await db.select().from(assessmentsTable).where(eq(assessmentsTable.moduleId, "m03")).limit(1);
  const [assessmentB] = await db.select().from(assessmentsTable).where(eq(assessmentsTable.moduleId, "b01")).limit(1);
  assert(taskA && taskB && assessmentA && assessmentB, "Seeded pathway A and B readiness catalogue is required");

  const criteriaA = await db.select().from(assessmentCriteriaTable).where(eq(assessmentCriteriaTable.assessmentId, assessmentA.id));
  assert(criteriaA.length > 0, "Seeded pathway A assessment criteria are required");

  try {
    await db.insert(peopleTable).values([
      { id: trainerA, name: "Readiness Trainer A", initials: "TA", email: `${trainerA}@example.test`, role: "trainer", clerkUserId: `clerk-${trainerA}`, organization: null, createdBy: "readiness-test" },
      { id: trainerB, name: "Readiness Trainer B", initials: "TB", email: `${trainerB}@example.test`, role: "trainer", clerkUserId: `clerk-${trainerB}`, organization: null, createdBy: "readiness-test" },
      { id: assessorA, name: "Readiness Assessor A", initials: "AA", email: `${assessorA}@example.test`, role: "assessor", clerkUserId: `clerk-${assessorA}`, organization: null, createdBy: "readiness-test" },
      { id: assessorB, name: "Readiness Assessor B", initials: "AB", email: `${assessorB}@example.test`, role: "assessor", clerkUserId: `clerk-${assessorB}`, organization: null, createdBy: "readiness-test" },
      { id: learnerA, name: "Readiness Learner A", initials: "LA", email: `${learnerA}@example.test`, role: "learner", organization: null, createdBy: "readiness-test" },
      { id: learnerB, name: "Readiness Learner B", initials: "LB", email: `${learnerB}@example.test`, role: "learner", organization: null, createdBy: "readiness-test" },
    ]);
    await db.insert(personRolesTable).values([
      { personId: trainerA, role: "trainer", createdBy: "readiness-test" },
      { personId: trainerB, role: "trainer", createdBy: "readiness-test" },
      { personId: assessorA, role: "assessor", createdBy: "readiness-test" },
      { personId: assessorB, role: "assessor", createdBy: "readiness-test" },
    ]);
    await db.insert(enrollmentsTable).values([
      { id: enrollmentA, learnerId: learnerA, programId: "solar-pv-tech", pathwayId: "path-a", trainerId: trainerA, assessorId: assessorA, createdBy: "readiness-test" },
      { id: enrollmentB, learnerId: learnerB, programId: "solar-pv-tech", pathwayId: "path-b", trainerId: trainerB, assessorId: assessorB, createdBy: "readiness-test" },
    ]);
    await db.insert(practiceAttemptsTable).values([
      { id: practiceA, taskId: taskA.id, learnerId: learnerA, pathwayId: "path-a", reflection: "A only", outputSummary: "A only", status: "Submitted", createdBy: learnerA },
      { id: practiceB, taskId: taskB.id, learnerId: learnerB, pathwayId: "path-b", reflection: "B only", outputSummary: "B only", status: "Submitted", createdBy: learnerB },
    ]);
    await db.insert(evidenceTable).values([
      { id: evidenceA, learnerId: learnerA, pathwayId: "path-a", moduleId: "m03", taskId: taskA.id, title: "A readiness evidence", type: "Report", description: "Readiness dashboard isolation A", fileName: null, createdBy: learnerA },
      { id: evidenceB, learnerId: learnerB, pathwayId: "path-b", moduleId: "b01", taskId: taskB.id, title: "B readiness evidence", type: "Report", description: "Readiness dashboard isolation B", fileName: null, createdBy: learnerB },
    ]);
    await db.insert(evidenceReviewsTable).values([
      { id: `readiness-review-a-${suffix}`, evidenceId: evidenceA, status: "Under review", quality: { valid: false, relevant: false, sufficient: false, traceable: false }, createdBy: learnerA },
      { id: `readiness-review-b-${suffix}`, evidenceId: evidenceB, status: "Under review", quality: { valid: false, relevant: false, sufficient: false, traceable: false }, createdBy: learnerB },
    ]);

    const [trainerAServer, trainerBServer, assessorAServer, assessorBServer] = await Promise.all([
      serverFor({ userId: `clerk-${trainerA}`, role: "trainer" }),
      serverFor({ userId: `clerk-${trainerB}`, role: "trainer" }),
      serverFor({ userId: `clerk-${assessorA}`, role: "assessor" }),
      serverFor({ userId: `clerk-${assessorB}`, role: "assessor" }),
    ]);
    try {
      const [trainerAQueue, trainerBQueue, assessorAQueue, assessorBQueue] = await Promise.all([
        request<any[]>(trainerAServer.baseUrl, "/trainer/review-queue"),
        request<any[]>(trainerBServer.baseUrl, "/trainer/review-queue"),
        request<any[]>(assessorAServer.baseUrl, "/assessor/queue"),
        request<any[]>(assessorBServer.baseUrl, "/assessor/queue"),
      ]);
      assert(trainerAQueue.some((item) => item.id === evidenceA) && trainerAQueue.every((item) => item.learnerId === learnerA && item.pathwayId === "path-a"), "Trainer A queue leaked Trainer B learner or pathway");
      assert(trainerBQueue.some((item) => item.id === evidenceB) && trainerBQueue.every((item) => item.learnerId === learnerB && item.pathwayId === "path-b"), "Trainer B queue leaked Trainer A learner or pathway");
      assert(assessorAQueue.some((item) => item.id === assessmentA.id && item.learnerId === learnerA) && assessorAQueue.every((item) => item.learnerId === learnerA && item.pathwayId === "path-a"), "Assessor A queue leaked another learner or pathway");
      assert(assessorBQueue.some((item) => item.id === assessmentB.id && item.learnerId === learnerB) && assessorBQueue.every((item) => item.learnerId === learnerB && item.pathwayId === "path-b"), "Assessor B queue leaked another learner or pathway");
      const actionableAssessmentIds = new Set((await db.select({ assessmentId: assessmentCriteriaTable.assessmentId }).from(assessmentCriteriaTable)).map(({ assessmentId }) => assessmentId));
      assert(assessorAQueue.every((item) => actionableAssessmentIds.has(item.id)) && assessorBQueue.every((item) => actionableAssessmentIds.has(item.id)), "Assessor queue exposed an assessment without decision criteria");

      await request(trainerAServer.baseUrl, `/trainer/evidence/${evidenceB}/review`, { method: "POST", body: JSON.stringify({ status: "Needs revision", comment: "must not write", quality: { valid: false, relevant: false, sufficient: false, traceable: false } }) }, 403);
      await request(trainerAServer.baseUrl, "/assessments", undefined, 403);
      await request(assessorAServer.baseUrl, "/assessments", undefined, 403);
      await request(trainerAServer.baseUrl, `/assessments/${assessmentA.id}?learnerId=${learnerA}`, undefined, 403);
      await request(assessorAServer.baseUrl, `/assessments/${assessmentB.id}?learnerId=${learnerB}`, undefined, 403);
      await request(trainerAServer.baseUrl, "/assessor/queue", undefined, 403);
      await request(assessorAServer.baseUrl, "/trainer/review-queue", undefined, 403);

      const revisionQuality = { valid: false, relevant: true, sufficient: false, traceable: true };
      const validQuality = { valid: true, relevant: true, sufficient: true, traceable: true };
      await request(trainerAServer.baseUrl, `/trainer/evidence/${evidenceA}/review`, { method: "POST", body: JSON.stringify({ status: "Needs revision", comment: "first trainer review", quality: revisionQuality }) });
      await request(trainerAServer.baseUrl, `/trainer/evidence/${evidenceA}/review`, { method: "POST", body: JSON.stringify({ status: "Valid", comment: "second trainer review", quality: validQuality }) });
      await db.insert(practiceReviewsTable).values([
        { id: `readiness-practice-review-1-${suffix}`, attemptId: practiceA, reviewerId: trainerA, status: "Reviewed", feedback: "first practice feedback", createdBy: trainerA },
        { id: `readiness-practice-review-2-${suffix}`, attemptId: practiceA, reviewerId: trainerA, status: "Needs revision", feedback: "second practice feedback", createdBy: trainerA },
      ]);
      const reviewHistory = await db.select().from(evidenceReviewsTable).where(eq(evidenceReviewsTable.evidenceId, evidenceA));
      assert(reviewHistory.length === 3 && reviewHistory.some((review) => review.comment === "first trainer review") && reviewHistory.some((review) => review.comment === "second trainer review"), "Trainer review history was overwritten instead of appended");
      const trainerDashboard = await request<any>(trainerAServer.baseUrl, "/trainer/dashboard");
      assert(trainerDashboard.reviewHistory.filter((event: any) => event.kind === "Evidence" && event.learnerId === learnerA).length >= 2 && trainerDashboard.reviewHistory.filter((event: any) => event.kind === "Practice" && event.learnerId === learnerA).length >= 2 && trainerDashboard.reviewHistory.every((event: any) => event.learnerId !== learnerB), "Trainer dashboard did not retain scoped append-only review history");

      const detail = await request<any>(assessorAServer.baseUrl, `/assessments/${assessmentA.id}?learnerId=${learnerA}`);
      assert(detail.assessment.id === assessmentA.id && detail.attempts.length === 0, "Assessor detail did not resolve only its assigned learner assessment");
      const decision = (outcome: "Not competent" | "Competent", observation: string) => request(
        assessorAServer.baseUrl,
        `/assessor/assessments/${assessmentA.id}/decision`,
        { method: "POST", body: JSON.stringify({ learnerId: learnerA, decision: outcome, observation, criteria: criteriaA.map((criterion) => ({ criterionId: criterion.id, score: outcome === "Competent" ? 3 : 1, observation, evidenceId: null })) }) },
        201,
      );
      await decision("Not competent", "first assessor recommendation");
      await decision("Competent", "second assessor recommendation");
      const decisionHistory = await db.select().from(assessmentAttemptsTable).where(and(eq(assessmentAttemptsTable.assessmentId, assessmentA.id), eq(assessmentAttemptsTable.learnerId, learnerA)));
      assert(decisionHistory.length === 2 && decisionHistory.some((attempt) => attempt.decisionRationale === "first assessor recommendation") && decisionHistory.some((attempt) => attempt.decisionRationale === "second assessor recommendation"), "Assessor decision history was overwritten instead of appended");
    } finally {
      await Promise.all([trainerAServer.close(), trainerBServer.close(), assessorAServer.close(), assessorBServer.close()]);
    }
  } finally {
    await cleanup();
  }
}

run().then(() => process.stdout.write("Readiness dashboard isolation integration check passed\n")).catch((error: unknown) => {
  process.stderr.write(`${error}\n`);
  process.exitCode = 1;
});