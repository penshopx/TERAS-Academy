// All writes that can change active administrator membership belong here.
// @ts-nocheck
import { and, eq, inArray, sql } from "drizzle-orm";
import {
  adminAuditEventsTable,
  adminAccessRequestsTable,
  db,
  peopleTable,
  personRolesTable,
} from "./index";

export type AdminMutationActor = {
  clerkUserId: string;
  personId: string | null;
  roles?: string[];
};

export type AdminMutationScope = {
  activeAdminFixtureIds?: readonly string[];
};

type UserInput = {
  id: string;
  name: string;
  initials: string;
  email: string;
  organization?: string | null;
  clerkUserId?: string | null;
  status: string;
  roles: string[];
};

type SeedPerson = {
  id: string;
  name: string;
  initials: string;
  email?: string;
  role: string;
  organization?: string | null;
};

const mutationLock = sql`select pg_advisory_xact_lock(hashtext('teras_active_admin_mutations'))`;
export const OPERATIONAL_ROLES = ["learner", "trainer", "assessor"] as const;
export const PRIVILEGED_ROLES = ["admin", "super_admin"] as const;
const effectiveAdminRoles = ["admin", "super_admin"];
// Omitted roles are reserved for trusted non-HTTP maintenance callers; HTTP
// authorization always supplies the locally-derived role set.
const actorIsSuperAdmin = (actor: AdminMutationActor) => actor.roles === undefined || actor.roles.includes("super_admin");
const rolesPermittedFor = (roles: string[], before: string[] | null = null) => {
  const addedPrivileged = roles.some(role => PRIVILEGED_ROLES.includes(role as typeof PRIVILEGED_ROLES[number])
    && !(before ?? []).includes(role));
  return !addedPrivileged;
};

async function audit(tx: any, actor: AdminMutationActor, action: string, entityId: string, before: unknown, after: unknown) {
  await tx.insert(adminAuditEventsTable).values({
    id: crypto.randomUUID(),
    actorPersonId: actor.personId,
    actorClerkUserId: actor.clerkUserId,
    action,
    entityType: "user",
    entityId,
    before,
    after,
    createdBy: actor.clerkUserId,
  });
}

async function user(tx: any, id: string) {
  const [person] = await tx.select().from(peopleTable).where(eq(peopleTable.id, id));
  if (!person) return null;
  const roles = await tx.select({ role: personRolesTable.role })
    .from(personRolesTable)
    .where(eq(personRolesTable.personId, id));
  return { ...person, roles: roles.map(item => item.role) };
}

async function activeRoleCount(tx: any, roles: string[], scope?: AdminMutationScope) {
  const fixtureIds = process.env.NODE_ENV === "test"
    ? scope?.activeAdminFixtureIds
    : undefined;
  return (await tx.select({ id: peopleTable.id })
    .from(peopleTable)
    .innerJoin(personRolesTable, eq(personRolesTable.personId, peopleTable.id))
    .where(and(
      eq(peopleTable.status, "active"),
       inArray(personRolesTable.role, roles),
      fixtureIds ? inArray(peopleTable.id, [...fixtureIds]) : undefined,
    ))).length;
}
async function activeAdminCount(tx: any, scope?: AdminMutationScope) {
  return activeRoleCount(tx, effectiveAdminRoles, scope);
}
async function activeSuperAdminCount(tx: any, scope?: AdminMutationScope) {
  return activeRoleCount(tx, ["super_admin"], scope);
}

/** Used by the login bootstrap pre-check only; authority is still role-derived. */
export async function hasActiveSuperAdmin() {
  return db.transaction(async tx => {
    await tx.execute(mutationLock);
    return (await activeSuperAdminCount(tx)) > 0;
  });
}

export async function createManagedUser(input: UserInput, actor: AdminMutationActor) {
  if (!rolesPermittedFor(input.roles)) return { kind: "forbidden" as const };
  return db.transaction(async tx => {
    await tx.execute(mutationLock);
    await tx.insert(peopleTable).values({
      ...input,
      role: input.roles[0],
      createdBy: actor.clerkUserId,
    });
    await tx.insert(personRolesTable).values(input.roles.map(role => ({
      personId: input.id,
      role,
      createdBy: actor.clerkUserId,
    })));
    const result = { ...input };
    await audit(tx, actor, "create", input.id, null, result);
    return { kind: "created" as const, value: result };
  });
}

export async function updateManagedUser(
  personId: string,
  input: Record<string, unknown>,
  actor: AdminMutationActor,
  scope?: AdminMutationScope,
) {
  return db.transaction(async tx => {
    await tx.execute(mutationLock);
    const before = await user(tx, personId);
    if (!before) return { kind: "not_found" as const };
    if (!actorIsSuperAdmin(actor) && before.roles.some(role => PRIVILEGED_ROLES.includes(role as typeof PRIVILEGED_ROLES[number]))) {
      return { kind: "forbidden" as const };
    }
    if (
      input.status === "inactive"
      && before.roles.some(role => effectiveAdminRoles.includes(role))
      && await activeAdminCount(tx, scope) === 1
    ) return { kind: "last_admin" as const };
    if (input.status === "inactive" && before.roles.includes("super_admin")
      && await activeSuperAdminCount(tx, scope) === 1) return { kind: "last_super_admin" as const };
    const [updated] = await tx.update(peopleTable)
      .set(input)
      .where(eq(peopleTable.id, personId))
      .returning();
    const result = { ...updated, roles: before.roles };
    await audit(tx, actor, "update", personId, before, result);
    return { kind: "updated" as const, value: result };
  });
}

export async function replaceManagedUserRoles(
  personId: string,
  roles: string[],
  actor: AdminMutationActor,
  scope?: AdminMutationScope,
) {
  return db.transaction(async tx => {
    await tx.execute(mutationLock);
    const before = await user(tx, personId);
    if (!before) return { kind: "not_found" as const };
    if (!rolesPermittedFor(roles, before.roles)) return { kind: "forbidden" as const };
    if (!actorIsSuperAdmin(actor) && before.roles.some(role => PRIVILEGED_ROLES.includes(role as typeof PRIVILEGED_ROLES[number]))) {
      return { kind: "forbidden" as const };
    }
    if (
      before.roles.some(role => effectiveAdminRoles.includes(role))
      && !roles.some(role => effectiveAdminRoles.includes(role))
      && before.status === "active"
      && await activeAdminCount(tx, scope) === 1
    ) return { kind: "last_admin" as const };
    if (before.roles.includes("super_admin") && !roles.includes("super_admin")
      && before.status === "active" && await activeSuperAdminCount(tx, scope) === 1) {
      return { kind: "last_super_admin" as const };
    }
    await tx.delete(personRolesTable).where(eq(personRolesTable.personId, personId));
    await tx.insert(personRolesTable).values(roles.map(role => ({
      personId,
      role,
      createdBy: actor.clerkUserId,
    })));
    const result = { ...before, roles };
    await audit(tx, actor, "replace_roles", personId, before, result);
    return { kind: "updated" as const, value: result };
  });
}

export async function createAdminAccessRequest(
  requesterPersonId: string,
  targetPersonId: string,
  requestedRole: "admin",
  reason: string,
  actor: AdminMutationActor,
) {
  return db.transaction(async tx => {
    await tx.execute(mutationLock);
    const [request] = await tx.insert(adminAccessRequestsTable).values({
      id: crypto.randomUUID(), requesterPersonId, targetPersonId, requestedRole, reason,
      createdBy: actor.clerkUserId,
    }).returning();
    await audit(tx, actor, "admin_request", request.id, null, request);
    return request;
  });
}

export async function reviewAdminAccessRequest(
  requestId: string, decision: "approved" | "rejected", note: string | null, actor: AdminMutationActor,
) {
  if (!actorIsSuperAdmin(actor)) return { kind: "forbidden" as const };
  return db.transaction(async tx => {
    await tx.execute(mutationLock);
    const [before] = await tx.select().from(adminAccessRequestsTable).where(eq(adminAccessRequestsTable.id, requestId));
    if (!before) return { kind: "not_found" as const };
    if (before.status !== "pending") return { kind: "already_reviewed" as const };
    const [value] = await tx.update(adminAccessRequestsTable).set({
      status: decision, reviewNote: note, reviewedByPersonId: actor.personId, reviewedAt: new Date(),
    }).where(eq(adminAccessRequestsTable.id, requestId)).returning();
    if (decision === "approved") await tx.insert(personRolesTable).values({
      personId: before.targetPersonId, role: before.requestedRole, createdBy: actor.clerkUserId,
    }).onConflictDoNothing();
    await audit(tx, actor, decision === "approved" ? "admin_request_approved" : "admin_request_rejected", requestId, before, value);
    return { kind: "updated" as const, value };
  });
}

/** One-time operator provisioning after the identity has been verified by Clerk. */
export async function provisionSuperAdmin(identity: {
  clerkUserId: string; email: string; name: string; initials: string;
}) {
  return db.transaction(async tx => {
    await tx.execute(mutationLock);
    let [person] = await tx.select().from(peopleTable).where(eq(peopleTable.clerkUserId, identity.clerkUserId)).limit(1);
    if (!person) {
      [person] = await tx.insert(peopleTable).values({
        id: crypto.randomUUID(), name: identity.name, initials: identity.initials,
        email: identity.email, role: "Super Administrator", clerkUserId: identity.clerkUserId,
        status: "active", createdBy: "super-admin-provisioning",
      }).returning();
    } else {
      [person] = await tx.update(peopleTable).set({
        name: identity.name, initials: identity.initials, email: identity.email, status: "active",
      }).where(eq(peopleTable.id, person.id)).returning();
    }
    await tx.insert(personRolesTable).values({
      personId: person.id, role: "super_admin", createdBy: "super-admin-provisioning",
    }).onConflictDoNothing();
    await audit(tx, { clerkUserId: identity.clerkUserId, personId: person.id }, "super_admin_provisioned", person.id, null, { clerkUserId: identity.clerkUserId });
    return person;
  });
}

/**
 * Creates TERAS's first super administrator only after the caller has verified
 * the Clerk identity out-of-band.  The configured email is deliberately not an
 * authorization input here: this durable link is keyed exclusively by Clerk ID.
 *
 * An immutable bootstrap audit event makes this a one-time path even if a
 * future maintenance operation removes the resulting role assignment.
 */
export async function claimInitialSuperAdmin(identity: {
  clerkUserId: string; email: string; name: string; initials: string;
}) {
  return db.transaction(async tx => {
    await tx.execute(mutationLock);
    const existingRole = await tx.select({ personId: personRolesTable.personId })
      .from(personRolesTable)
      .where(eq(personRolesTable.role, "super_admin"))
      .limit(1);
    const previousBootstrap = await tx.select({ id: adminAuditEventsTable.id })
      .from(adminAuditEventsTable)
      .where(eq(adminAuditEventsTable.action, "initial_super_admin_bootstrap"))
      .limit(1);
    if (existingRole.length || previousBootstrap.length) return { kind: "already_claimed" as const };

    let [person] = await tx.select().from(peopleTable)
      .where(eq(peopleTable.clerkUserId, identity.clerkUserId))
      .limit(1);
    const before = person ? await user(tx, person.id) : null;
    if (!person) {
      [person] = await tx.insert(peopleTable).values({
        id: crypto.randomUUID(),
        name: identity.name,
        initials: identity.initials,
        email: identity.email,
        role: "Super Administrator",
        clerkUserId: identity.clerkUserId,
        status: "active",
        createdBy: "initial-super-admin-bootstrap",
      }).returning();
    } else {
      [person] = await tx.update(peopleTable).set({
        name: identity.name,
        initials: identity.initials,
        email: identity.email,
        role: "Super Administrator",
        status: "active",
      }).where(eq(peopleTable.id, person.id)).returning();
    }
    await tx.insert(personRolesTable).values({
      personId: person.id,
      role: "super_admin",
      createdBy: "initial-super-admin-bootstrap",
    });
    const after = { ...person, roles: ["super_admin"] };
    await audit(
      tx,
      { clerkUserId: identity.clerkUserId, personId: person.id, roles: ["super_admin"] },
      "initial_super_admin_bootstrap",
      person.id,
      before,
      after,
    );
    return { kind: "claimed" as const, value: person };
  });
}

export async function ensureConfiguredAdmin(userId: string) {
  await db.transaction(async tx => {
    await tx.execute(mutationLock);
    let [person] = await tx.select({ id: peopleTable.id }).from(peopleTable)
      .where(eq(peopleTable.clerkUserId, userId))
      .limit(1);
    if (!person) {
      [person] = await tx.insert(peopleTable).values({
        id: `bootstrap-admin-${userId}`,
        name: "TERAS Administrator",
        initials: "TA",
        role: "Administrator",
        organization: "TERAS Academy",
        clerkUserId: userId,
        status: "active",
        createdBy: "configured-admin-bootstrap",
      }).returning({ id: peopleTable.id });
    } else {
      await tx.update(peopleTable)
        .set({ status: "active", role: "Administrator", organization: "TERAS Academy" })
        .where(eq(peopleTable.id, person.id));
    }
    await tx.insert(personRolesTable).values({
      personId: person.id,
      role: "admin",
      createdBy: "configured-admin-bootstrap",
    }).onConflictDoNothing();
  });
}

export async function seedManagedPeople(people: SeedPerson[]) {
  await db.transaction(async tx => {
    await tx.execute(mutationLock);
    await tx.insert(peopleTable).values(people).onConflictDoNothing();
    for (const person of people) {
      if (person.email) {
        await tx.update(peopleTable)
          .set({ email: person.email })
          .where(eq(peopleTable.id, person.id));
      }
    }
  });
}