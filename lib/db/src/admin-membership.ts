// All writes that can change active administrator membership belong here.
// @ts-nocheck
import { and, eq, inArray, sql } from "drizzle-orm";
import {
  adminAuditEventsTable,
  db,
  peopleTable,
  personRolesTable,
} from "./index";

export type AdminMutationActor = {
  clerkUserId: string;
  personId: string | null;
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

async function activeAdminCount(tx: any, scope?: AdminMutationScope) {
  const fixtureIds = process.env.NODE_ENV === "test"
    ? scope?.activeAdminFixtureIds
    : undefined;
  return (await tx.select({ id: peopleTable.id })
    .from(peopleTable)
    .innerJoin(personRolesTable, eq(personRolesTable.personId, peopleTable.id))
    .where(and(
      eq(peopleTable.status, "active"),
      eq(personRolesTable.role, "admin"),
      fixtureIds ? inArray(peopleTable.id, [...fixtureIds]) : undefined,
    ))).length;
}

export async function createManagedUser(input: UserInput, actor: AdminMutationActor) {
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
    return result;
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
    if (
      input.status === "inactive"
      && before.roles.includes("admin")
      && await activeAdminCount(tx, scope) === 1
    ) return { kind: "last_admin" as const };
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
    if (
      before.roles.includes("admin")
      && !roles.includes("admin")
      && before.status === "active"
      && await activeAdminCount(tx, scope) === 1
    ) return { kind: "last_admin" as const };
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