import { and, eq, inArray } from "drizzle-orm";
import {
  db,
  enrollmentsTable,
  peopleTable,
  personRolesTable,
} from "@workspace/db";
import { ensureVerifiedSupabaseLearner } from "@workspace/db/learner-provisioning";

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

const marker = crypto.randomUUID();
const subject = `learner-${marker}`;
const conflictingSubject = `learner-conflict-${marker}`;
const email = `learner-${marker}@example.test`;

try {
  const [first, second] = await Promise.all([
    ensureVerifiedSupabaseLearner({ subject, email }),
    ensureVerifiedSupabaseLearner({ subject, email }),
  ]);
  assert(["created", "existing"].includes(first.status), "First provisioning did not resolve");
  assert(["created", "existing"].includes(second.status), "Concurrent provisioning did not resolve");

  const people = await db.select().from(peopleTable)
    .where(and(eq(peopleTable.authProvider, "supabase"), eq(peopleTable.authSubject, subject)));
  assert(people.length === 1, "Provisioning must create exactly one person");
  assert(people[0].status === "active" && people[0].role === "Learner", "Provisioned person is not an active learner");

  const roles = await db.select().from(personRolesTable).where(eq(personRolesTable.personId, people[0].id));
  assert(roles.length === 1 && roles[0].role === "learner", "Provisioning must create exactly one learner role");
  const enrollments = await db.select().from(enrollmentsTable)
    .where(eq(enrollmentsTable.learnerId, people[0].id));
  assert(enrollments.length === 1, "Provisioning must create exactly one primary enrollment");
  assert(
    enrollments[0].programId === "solar-pv-tech" && enrollments[0].pathwayId === "path-a",
    "Provisioning must use the only active Primary pathway",
  );

  const repeated = await ensureVerifiedSupabaseLearner({ subject, email });
  assert(repeated.status === "existing", "Repeated provisioning must resolve the existing learner");
  const repeatedEnrollments = await db.select().from(enrollmentsTable)
    .where(eq(enrollmentsTable.learnerId, people[0].id));
  assert(repeatedEnrollments.length === 1, "Repeated provisioning must not duplicate enrollment");

  await db.delete(enrollmentsTable).where(eq(enrollmentsTable.learnerId, people[0].id));
  const repaired = await ensureVerifiedSupabaseLearner({ subject, email });
  assert(repaired.status === "existing", "An existing learner without enrollment must be repaired");
  const repairedEnrollments = await db.select().from(enrollmentsTable)
    .where(eq(enrollmentsTable.learnerId, people[0].id));
  assert(repairedEnrollments.length === 1, "Existing learner repair must recreate one primary enrollment");

  const conflict = await ensureVerifiedSupabaseLearner({
    subject: conflictingSubject,
    email: email.toUpperCase(),
  });
  assert(conflict.status === "email_conflict", "A different subject must not take over an existing email");
  const conflictingPeople = await db.select().from(peopleTable)
    .where(eq(peopleTable.authSubject, conflictingSubject));
  assert(conflictingPeople.length === 0, "Email conflict must not create or alter an identity");
} finally {
  const people = await db.select({ id: peopleTable.id }).from(peopleTable)
    .where(inArray(peopleTable.authSubject, [subject, conflictingSubject]));
  const ids = people.map(person => person.id);
  if (ids.length) {
    await db.delete(enrollmentsTable).where(inArray(enrollmentsTable.learnerId, ids));
    await db.delete(personRolesTable).where(inArray(personRolesTable.personId, ids));
    await db.delete(peopleTable).where(inArray(peopleTable.id, ids));
  }
}