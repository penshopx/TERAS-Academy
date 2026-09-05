import type { AddressInfo } from "node:net";
import {
  activityCompletionEventsTable,
  assessmentAttemptsTable,
  db,
  enrollmentsTable,
  evidenceReviewsTable,
  evidenceTable,
  gapEventsTable,
  gapsTable,
  learningTransitionEventsTable,
  peopleTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import { createIntegrationTestApp } from "./integration-test-app";

type Identity = "learner-a" | "learner-b" | "trainer" | "assessor" | "anonymous";
const learnerB = `learner-isolation-${crypto.randomUUID()}`;
const enrollmentB = `enrollment-isolation-${crypto.randomUUID()}`;
const evidenceB = `evidence-isolation-${crypto.randomUUID()}`;
const reviewB = `review-isolation-${crypto.randomUUID()}`;
const gapB = `gap-isolation-${crypto.randomUUID()}`;
const gapEventB = `gap-event-isolation-${crypto.randomUUID()}`;
const attemptB = `attempt-isolation-${crypto.randomUUID()}`;
const transitionKey = `transition-isolation-${crypto.randomUUID()}`;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function cleanup() {
  const transitions = await db.select({ id: learningTransitionEventsTable.id })
    .from(learningTransitionEventsTable)
    .where(eq(learningTransitionEventsTable.idempotencyKey, transitionKey));
  for (const transition of transitions) {
    await db.delete(activityCompletionEventsTable)
      .where(eq(activityCompletionEventsTable.metadata, { transitionEventId: transition.id }));
  }
  await db.delete(learningTransitionEventsTable).where(eq(learningTransitionEventsTable.idempotencyKey, transitionKey));
  await db.delete(assessmentAttemptsTable).where(eq(assessmentAttemptsTable.id, attemptB));
  await db.delete(gapEventsTable).where(eq(gapEventsTable.id, gapEventB));
  await db.delete(gapsTable).where(eq(gapsTable.id, gapB));
  await db.delete(evidenceReviewsTable).where(eq(evidenceReviewsTable.id, reviewB));
  await db.delete(evidenceTable).where(eq(evidenceTable.id, evidenceB));
  await db.delete(enrollmentsTable).where(eq(enrollmentsTable.id, enrollmentB));
  await db.delete(peopleTable).where(eq(peopleTable.id, learnerB));
}

async function seed() {
  await cleanup();
  await db.insert(peopleTable).values({
    id: learnerB,
    name: "Isolation Learner B",
    initials: "IB",
    email: `${learnerB}@example.test`,
    role: "learner",
    organization: "TERAS test",
    createdBy: learnerB,
  });
  await db.insert(enrollmentsTable).values({
    id: enrollmentB,
    learnerId: learnerB,
    programId: "solar-pv-tech",
    pathwayId: "path-b",
    trainerId: null,
    assessorId: null,
    createdBy: learnerB,
  });
  await db.insert(evidenceTable).values({
    id: evidenceB,
    learnerId: learnerB,
    pathwayId: "path-b",
    moduleId: "b04",
    taskId: "task-b04",
    title: "Learner B private design",
    type: "Report",
    description: "This record must never appear for learner A.",
    createdBy: learnerB,
  });
  await db.insert(evidenceReviewsTable).values({
    id: reviewB,
    evidenceId: evidenceB,
    status: "Under review",
    quality: { valid: false, relevant: true, sufficient: false, traceable: true },
    createdBy: learnerB,
  });
  await db.insert(gapsTable).values({
    id: gapB,
    learnerId: learnerB,
    pathwayId: "path-b",
    moduleId: "b04",
    capability: "Private B gap",
    criterion: "B-only criterion",
    severity: "Low",
    priority: "Normal",
    diagnosis: "This gap belongs only to learner B.",
    gate: "B2",
    recommendedAction: "Review design.",
    createdBy: learnerB,
  });
  await db.insert(gapEventsTable).values({
    id: gapEventB,
    gapId: gapB,
    status: "Open",
    createdBy: learnerB,
  });
  await db.insert(assessmentAttemptsTable).values({
    id: attemptB,
    assessmentId: "assessment-b04",
    learnerId: learnerB,
    pathwayId: "path-b",
    number: 1,
    assessorId: null,
    status: "Completed",
    decision: "Competent",
    createdBy: learnerB,
  });
}

async function run() {
  await seed();
  const app = createIntegrationTestApp((req) => {
    const identity = req.get("x-teras-integration-identity") as Identity | undefined;
    if (identity === "learner-a") return { userId: "clerk-a", role: "learner", learnerId: "learner-demo" };
    if (identity === "learner-b") return { userId: "clerk-b", role: "learner", learnerId: learnerB };
    if (identity === "trainer") return { userId: "clerk-trainer", role: "trainer" };
    if (identity === "assessor") return { userId: "clerk-assessor", role: "assessor" };
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

  try {
    const [dashboardA, dashboardB, evidenceA, evidenceForB, gapsA, gapsForB, coursesA, coursesB, assessmentsA, assessmentsB, passportA, passportB] = await Promise.all([
      request<any>("/learner/dashboard", "learner-a"),
      request<any>("/learner/dashboard", "learner-b"),
      request<any[]>("/evidence", "learner-a"),
      request<any[]>("/evidence", "learner-b"),
      request<any[]>("/gaps", "learner-a"),
      request<any[]>("/gaps", "learner-b"),
      request<any[]>("/learning/courses", "learner-a"),
      request<any[]>("/learning/courses", "learner-b"),
      request<any[]>("/assessments", "learner-a"),
      request<any[]>("/assessments", "learner-b"),
      request<any>("/passport", "learner-a"),
      request<any>("/passport", "learner-b"),
    ]);
    assert(dashboardA.learner.id === "learner-demo" && dashboardB.learner.id === learnerB, "Dashboards did not resolve the authenticated learner");
    assert(evidenceA.every((item) => item.id !== evidenceB) && evidenceForB.length === 1 && evidenceForB[0].id === evidenceB, "Evidence leaked across learners");
    assert(gapsA.every((item) => item.id !== gapB) && gapsForB.length === 1 && gapsForB[0].id === gapB, "Gaps leaked across learners");
    assert(coursesA.every((course) => course.pathwayId === "path-a") && coursesB.every((course) => course.pathwayId === "path-b"), "Learning hierarchy leaked across pathways");
    assert(assessmentsA.every((assessment) => assessment.id.startsWith("assessment-m")) && assessmentsB.every((assessment) => assessment.id.startsWith("assessment-b")), "Assessment summaries leaked across pathways");
    assert(assessmentsB.find((assessment) => assessment.id === "assessment-b04")?.attemptCount === 1, "Learner B assessment history was not resolved from its own account");
    assert(passportA.learner.id === "learner-demo" && passportB.learner.id === learnerB, "Passport used another learner context");
    assert(passportB.achievements.every((item: any) => item.capability !== "Electrical safety"), "Learner A achievement leaked into learner B Passport");

    const transition = {
      currentState: "NOT_STARTED",
      targetState: "IN_PROGRESS",
      learnerId: learnerB,
      pathwayId: "path-b",
      programId: "solar-pv-tech",
      activityId: "activity-b04-protection",
      entityReference: `${learnerB}:activity-b04-protection`,
      reason: "Isolation verification",
      idempotencyKey: transitionKey,
    };
    await request("/learning/transitions", "learner-a", { method: "POST", body: JSON.stringify(transition) }, 403);
    await request("/learning/transitions", "trainer", {
      method: "POST",
      body: JSON.stringify({ ...transition, currentState: "OUTCOME_VERIFIED", targetState: "PRACTICE_REQUIRED", idempotencyKey: `${transitionKey}-staff` }),
    }, 403);
    await request("/learning/transitions", "learner-b", { method: "POST", body: JSON.stringify(transition) }, 201);
    const [stored] = await db.select().from(learningTransitionEventsTable).where(eq(learningTransitionEventsTable.idempotencyKey, transitionKey));
    assert(stored?.learnerId === learnerB && stored.enrollmentId === enrollmentB, "Transition was not stored against learner B enrollment");
    const [coursesAfterA, coursesAfterB] = await Promise.all([
      request<any[]>("/learning/courses", "learner-a"),
      request<any[]>("/learning/courses", "learner-b"),
    ]);
    assert(
      coursesAfterB.some(course => course.resumeAction?.activityId === "activity-b04-protection"),
      "Learner B did not resume the activity they most recently started",
    );
    assert(
      coursesAfterA.every(course => course.resumeAction?.activityId !== "activity-b04-protection"),
      "Learner B resume state leaked into learner A courses",
    );

    for (const path of ["/learner/dashboard", "/evidence", "/gaps", "/readiness", "/passport", "/learning/courses", "/assessments"]) {
      await request(path, "anonymous", undefined, 401);
    }
    await request("/assessor/dashboard", "anonymous", undefined, 401);
    await request("/assessor/queue", "anonymous", undefined, 401);
    await request("/trainer/dashboard", "anonymous", undefined, 401);
    await request("/trainer/review-queue", "anonymous", undefined, 401);
    process.stdout.write("Learner isolation integration check passed\n");
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await cleanup();
  }
}

run().catch((error: unknown) => {
  process.stderr.write(`${error}\n`);
  process.exitCode = 1;
});