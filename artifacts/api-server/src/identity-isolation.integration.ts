import { createIntegrationTestApp } from "./integration-test-app";
import {
  db, enrollmentsTable, evidenceReviewsTable, evidenceTable,
  learningActivitiesTable, learningTransitionEventsTable, modulesTable,
  peopleTable, practiceTasksTable,
} from "@workspace/db";
import { and, eq, inArray } from "drizzle-orm";

const suffix = crypto.randomUUID();
const learnerA = `identity-a-${suffix}`;
const learnerB = `identity-b-${suffix}`;
const enrollmentA = `identity-enrollment-a-${suffix}`;
const enrollmentB = `identity-enrollment-b-${suffix}`;
const evidenceA = `identity-evidence-a-${suffix}`;
const evidenceB = `identity-evidence-b-${suffix}`;
const transitionA = `identity-transition-a-${suffix}`;

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

async function serverFor(learnerId: string) {
  const app = createIntegrationTestApp(() => ({ userId: `test-${learnerId}`, role: "learner", learnerId }));
  const server = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
    const listener = app.listen(0, () => resolve(listener));
  });
  const address = server.address();
  assert(address && typeof address !== "string", "Test server did not bind");
  return {
    url: `http://127.0.0.1:${address.port}/api`,
    close: () => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())),
  };
}

async function get(url: string, path: string) {
  const response = await fetch(`${url}${path}`);
  if (!response.ok) throw new Error(`${path} returned ${response.status}: ${await response.text()}`);
  return response.json() as Promise<any>;
}

async function run() {
  const [module] = await db.select().from(modulesTable).where(eq(modulesTable.pathwayId, "path-a")).limit(1);
  assert(module, "Seeded path-a module is required");
  const [task] = await db.select().from(practiceTasksTable).where(eq(practiceTasksTable.moduleId, module.id)).limit(1);
  assert(task, "Seeded practice task is required");
  const [activity] = await db.select().from(learningActivitiesTable).where(eq(learningActivitiesTable.pathwayId, "path-a")).limit(1);
  assert(activity, "Seeded learning activity is required");

  try {
    await db.insert(peopleTable).values([
      { id: learnerA, name: "Identity Learner A", initials: "IA", email: `identity-a-${suffix}@example.test`, role: "Learner", organization: null, createdBy: "identity-test" },
      { id: learnerB, name: "Identity Learner B", initials: "IB", email: `identity-b-${suffix}@example.test`, role: "Learner", organization: null, createdBy: "identity-test" },
    ]);
    await db.insert(enrollmentsTable).values([
      { id: enrollmentA, learnerId: learnerA, programId: "solar-pv-tech", pathwayId: "path-a", createdBy: "identity-test" },
      { id: enrollmentB, learnerId: learnerB, programId: "solar-pv-tech", pathwayId: "path-a", createdBy: "identity-test" },
    ]);
    await db.insert(evidenceTable).values([
      { id: evidenceA, learnerId: learnerA, pathwayId: "path-a", moduleId: module.id, taskId: task.id, title: "A-only evidence", type: "Report", description: `identity A ${suffix}`, fileName: null, createdBy: learnerA },
      { id: evidenceB, learnerId: learnerB, pathwayId: "path-a", moduleId: module.id, taskId: task.id, title: "B-only evidence", type: "Report", description: `identity B ${suffix}`, fileName: null, createdBy: learnerB },
    ]);
    await db.insert(evidenceReviewsTable).values([
      { id: `identity-review-a-${suffix}`, evidenceId: evidenceA, status: "Under review", quality: { valid: false, relevant: false, sufficient: false, traceable: false }, createdBy: learnerA },
      { id: `identity-review-b-${suffix}`, evidenceId: evidenceB, status: "Under review", quality: { valid: false, relevant: false, sufficient: false, traceable: false }, createdBy: learnerB },
    ]);
    await db.insert(learningTransitionEventsTable).values({
      id: transitionA, activityId: activity.id, learnerId: learnerA, enrollmentId: enrollmentA,
      programId: "solar-pv-tech", pathwayId: "path-a", fromState: "NOT_STARTED",
      toState: "IN_PROGRESS", actorId: learnerA, actorRole: "learner",
      entityReference: "identity-isolation", reason: "read isolation fixture",
      idempotencyKey: transitionA, metadata: {}, createdBy: learnerA,
    });

    const a = await serverFor(learnerA);
    const b = await serverFor(learnerB);
    try {
      const [aDashboard, bDashboard, aEvidence, bEvidence, aCourses, bCourses] = await Promise.all([
        get(a.url, "/learner/dashboard"), get(b.url, "/learner/dashboard"),
        get(a.url, "/evidence"), get(b.url, "/evidence"),
        get(a.url, "/learning/courses"), get(b.url, "/learning/courses"),
      ]);
      assert(aDashboard.learner.id === learnerA && bDashboard.learner.id === learnerB, "Dashboard leaked another learner profile");
      assert(aEvidence.some((item: any) => item.id === evidenceA) && !aEvidence.some((item: any) => item.id === evidenceB), "A evidence was not isolated");
      assert(bEvidence.some((item: any) => item.id === evidenceB) && !bEvidence.some((item: any) => item.id === evidenceA), "B evidence was not isolated");
      const states = (courses: any) => courses.flatMap((course: any) => course.modules)
        .flatMap((courseModule: any) => courseModule.lessons)
        .flatMap((lesson: any) => lesson.activities)
        .filter((item: any) => item.id === activity.id).map((item: any) => item.currentState);
      assert(states(aCourses).includes("IN_PROGRESS") && !states(bCourses).includes("IN_PROGRESS"), "Learning-course state leaked between learners");

      const before = await db.select({ id: learningTransitionEventsTable.id }).from(learningTransitionEventsTable)
        .where(and(eq(learningTransitionEventsTable.learnerId, learnerA), eq(learningTransitionEventsTable.activityId, activity.id)));
      const rejected = await fetch(`${b.url}/learning/transitions`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ currentState: "NOT_STARTED", targetState: "IN_PROGRESS", learnerId: learnerA, pathwayId: "path-a", programId: "solar-pv-tech", activityId: activity.id, entityReference: "identity-impersonation", reason: "must reject", idempotencyKey: `identity-reject-${suffix}` }) });
      assert(rejected.status === 403, `B impersonation returned ${rejected.status}`);
      const after = await db.select({ id: learningTransitionEventsTable.id }).from(learningTransitionEventsTable)
        .where(and(eq(learningTransitionEventsTable.learnerId, learnerA), eq(learningTransitionEventsTable.activityId, activity.id)));
      assert(after.length === before.length, "Rejected cross-account transition mutated the database");
    } finally {
      await Promise.all([a.close(), b.close()]);
    }
  } finally {
    await db.delete(learningTransitionEventsTable).where(eq(learningTransitionEventsTable.id, transitionA));
    await db.delete(evidenceReviewsTable).where(inArray(evidenceReviewsTable.evidenceId, [evidenceA, evidenceB]));
    await db.delete(evidenceTable).where(inArray(evidenceTable.id, [evidenceA, evidenceB]));
    await db.delete(enrollmentsTable).where(inArray(enrollmentsTable.id, [enrollmentA, enrollmentB]));
    await db.delete(peopleTable).where(inArray(peopleTable.id, [learnerA, learnerB]));
  }
}

run().then(() => process.stdout.write("Identity isolation integration check passed\n")).catch(error => {
  process.stderr.write(`${error}\n`);
  process.exitCode = 1;
});