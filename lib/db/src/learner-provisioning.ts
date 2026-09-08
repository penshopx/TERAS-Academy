import { and, eq, sql } from "drizzle-orm";
import {
  db,
  enrollmentsTable,
  pathwaysTable,
  peopleTable,
  personRolesTable,
  programsTable,
} from "./index";

export type VerifiedLearnerIdentity = {
  subject: string;
  email: string;
};

export type LearnerProvisioningResult =
  | { status: "created"; personId: string }
  | { status: "existing"; personId: string }
  | { status: "email_conflict" };

function displayName(email: string) {
  const local = email.split("@")[0] ?? "";
  const words = local.split(/[._+-]+/).filter(Boolean);
  const name = words.map(word => `${word[0]?.toUpperCase() ?? ""}${word.slice(1)}`).join(" ").trim();
  return name || "Learner TERAS";
}

function initials(name: string) {
  const value = name.split(/\s+/).filter(Boolean).slice(0, 2).map(word => word[0]).join("").toUpperCase();
  return value || "LT";
}

async function ensurePrimaryEnrollment(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  personId: string,
  createdBy: string,
) {
  const [activeEnrollment] = await tx.select({ id: enrollmentsTable.id })
    .from(enrollmentsTable)
    .where(and(eq(enrollmentsTable.learnerId, personId), eq(enrollmentsTable.status, "active")))
    .limit(1);
  if (activeEnrollment) return;

  const targets = await tx.select({
    programId: programsTable.id,
    pathwayId: pathwaysTable.id,
  })
    .from(pathwaysTable)
    .innerJoin(programsTable, eq(programsTable.id, pathwaysTable.programId))
    .where(and(
      sql`lower(${programsTable.status}) = 'active'`,
      sql`lower(${pathwaysTable.status}) = 'active'`,
      sql`lower(${pathwaysTable.type}) = 'primary'`,
    ))
    .limit(2);
  if (targets.length !== 1) return;

  await tx.insert(enrollmentsTable).values({
    id: crypto.randomUUID(),
    learnerId: personId,
    programId: targets[0].programId,
    pathwayId: targets[0].pathwayId,
    status: "active",
    createdBy,
  });
}

/**
 * Creates a brand-new operational identity or completes onboarding for an
 * existing bound learner. Existing people are never adopted by email because
 * the verified provider subject is the authority.
 */
export async function ensureVerifiedSupabaseLearner(
  identity: VerifiedLearnerIdentity,
): Promise<LearnerProvisioningResult> {
  const email = identity.email.trim().toLowerCase();
  if (!identity.subject.trim() || !email) return { status: "email_conflict" };

  return db.transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`teras_learner_subject:${identity.subject}`}))`);
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`teras_learner_email:${email}`}))`);

    const [existing] = await tx.select({ id: peopleTable.id })
      .from(peopleTable)
      .where(and(eq(peopleTable.authProvider, "supabase"), eq(peopleTable.authSubject, identity.subject)))
      .limit(1);
    if (existing) {
      const [learnerRole] = await tx.select({ role: personRolesTable.role })
        .from(personRolesTable)
        .where(and(eq(personRolesTable.personId, existing.id), eq(personRolesTable.role, "learner")))
        .limit(1);
      if (!learnerRole) return { status: "email_conflict" };
      await ensurePrimaryEnrollment(tx, existing.id, `supabase:${identity.subject}`);
      return { status: "existing", personId: existing.id };
    }

    const [emailOwner] = await tx.select({ id: peopleTable.id })
      .from(peopleTable)
      .where(sql`lower(${peopleTable.email}) = ${email}`)
      .limit(1);
    if (emailOwner) return { status: "email_conflict" };

    const personId = crypto.randomUUID();
    const name = displayName(email);
    const createdBy = `supabase:${identity.subject}`;
    await tx.insert(peopleTable).values({
      id: personId,
      name,
      initials: initials(name),
      email,
      role: "Learner",
      status: "active",
      authProvider: "supabase",
      authSubject: identity.subject,
      createdBy,
    });
    await tx.insert(personRolesTable).values({
      personId,
      role: "learner",
      createdBy,
    });
    await ensurePrimaryEnrollment(tx, personId, createdBy);
    return { status: "created", personId };
  });
}