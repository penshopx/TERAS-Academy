// All writes that can change active administrator membership belong here.
// @ts-nocheck
import { and, eq, inArray, isNotNull, isNull, or, sql } from "drizzle-orm";
import {
  adminAuditEventsTable,
  adminAccessRequestsTable,
  db,
  peopleTable,
  personRolesTable,
} from "./index";

export type AdminMutationActor = {
  /** Provider-qualified audit identity. clerkUserId is accepted only for old tests/callers. */
  authSubject?: string;
  clerkUserId?: string;
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
  authProvider?: string | null;
  authSubject?: string | null;
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
const actorSubject = (actor: AdminMutationActor) => actor.authSubject ?? actor.clerkUserId ?? "unknown";
const actorProvider = (actor: AdminMutationActor) => actor.authSubject ? "supabase" : "clerk";
const actorCreatedBy = (actor: AdminMutationActor) => `${actorProvider(actor)}:${actorSubject(actor)}`;
const validExternalIdentity = (input: { authProvider?: unknown; authSubject?: unknown }) =>
  (input.authProvider == null && input.authSubject == null)
  || (typeof input.authProvider === "string" && input.authProvider.length > 0
    && typeof input.authSubject === "string" && input.authSubject.length > 0);
const rolesPermittedFor = (roles: string[], before: string[] | null = null) => {
  const addedPrivileged = roles.some(role => PRIVILEGED_ROLES.includes(role as typeof PRIVILEGED_ROLES[number])
    && !(before ?? []).includes(role));
  return !addedPrivileged;
};

async function audit(tx: any, actor: AdminMutationActor, action: string, entityId: string, before: unknown, after: unknown) {
  await tx.insert(adminAuditEventsTable).values({
    id: crypto.randomUUID(),
    actorPersonId: actor.personId,
    actorClerkUserId: actorSubject(actor),
    actorAuthProvider: actorProvider(actor),
    actorAuthSubject: actorSubject(actor),
    action,
    entityType: "user",
    entityId,
    before,
    after,
    createdBy: actorCreatedBy(actor),
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

export async function createManagedUser(input: UserInput, actor: AdminMutationActor) {
  if (!validExternalIdentity(input)) throw new Error("External auth provider and subject must be supplied together.");
  if (!rolesPermittedFor(input.roles)) return { kind: "forbidden" as const };
  return db.transaction(async tx => {
    await tx.execute(mutationLock);
    await tx.insert(peopleTable).values({
      ...input,
      role: input.roles[0],
      createdBy: actorCreatedBy(actor),
    });
    await tx.insert(personRolesTable).values(input.roles.map(role => ({
      personId: input.id,
      role,
      createdBy: actorCreatedBy(actor),
    })));
    const result = await user(tx, input.id);
    if (!result) throw new Error("Managed user was not found after creation.");
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
  if (!validExternalIdentity(input)) throw new Error("External auth provider and subject must be supplied together.");
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
      createdBy: actorCreatedBy(actor),
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
      createdBy: actorCreatedBy(actor),
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
      personId: before.targetPersonId, role: before.requestedRole, createdBy: actorCreatedBy(actor),
    }).onConflictDoNothing();
    await audit(tx, actor, decision === "approved" ? "admin_request_approved" : "admin_request_rejected", requestId, before, value);
    return { kind: "updated" as const, value };
  });
}

/** One-time operator provisioning after a Supabase aal2 identity is verified by the caller. */
export async function provisionSuperAdmin(identity: {
  authSubject: string; email: string; name: string; initials: string;
}) {
  const { authSubject } = identity;
  return db.transaction(async tx => {
    await tx.execute(mutationLock);
    const schemaReadiness = await tx.execute(sql`
      SELECT
        to_regclass('public.teras_people') IS NOT NULL AS has_people,
        to_regclass('public.teras_person_roles') IS NOT NULL AS has_roles,
        EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conrelid = to_regclass('public.teras_person_roles')
            AND contype = 'c'
            AND pg_get_constraintdef(oid) LIKE '%super_admin%'
        ) AS allows_super_admin
    `);
    const readiness = schemaReadiness.rows[0] as {
      has_people?: boolean; has_roles?: boolean; allows_super_admin?: boolean;
    } | undefined;
    if (!readiness?.has_people || !readiness.has_roles || !readiness.allows_super_admin) {
      throw new Error("Production schema is not ready for super_admin; complete the publish schema update before provisioning.");
    }
    let [person] = await tx.select().from(peopleTable).where(and(eq(peopleTable.authProvider, "supabase"), eq(peopleTable.authSubject, authSubject))).limit(1);
    const before = person ? await user(tx, person.id) : null;
    const existingActiveSuperAdmins = await tx.select({ personId: peopleTable.id })
      .from(peopleTable)
      .innerJoin(personRolesTable, eq(personRolesTable.personId, peopleTable.id))
      .where(and(eq(peopleTable.status, "active"), eq(personRolesTable.role, "super_admin")));
    if (existingActiveSuperAdmins.some(item => item.personId !== person?.id)) {
      throw new Error("An active super_admin already exists; use reviewed in-app governance for further elevation.");
    }
    if (!person) {
      [person] = await tx.insert(peopleTable).values({
        id: crypto.randomUUID(), name: identity.name, initials: identity.initials,
        email: identity.email, role: "Super Administrator", authProvider: "supabase", authSubject,
        status: "active", createdBy: "super-admin-provisioning",
      }).returning();
    } else {
      [person] = await tx.update(peopleTable).set({
        name: identity.name, initials: identity.initials, email: identity.email, status: "active", authProvider: "supabase", authSubject,
      }).where(eq(peopleTable.id, person.id)).returning();
    }
    await tx.insert(personRolesTable).values({
      personId: person.id, role: "super_admin", createdBy: "super-admin-provisioning",
    }).onConflictDoNothing();
    const after = await user(tx, person.id);
    if (!after || after.status !== "active" || !after.roles.includes("super_admin")) {
      throw new Error("Failed to verify active super_admin after provisioning.");
    }
    await audit(
      tx,
      { authSubject, personId: person.id },
      "super_admin_provisioned",
      person.id,
      before,
      { personId: person.id, authProvider: "supabase", authSubject, status: after.status, roles: after.roles },
    );
    return {
      personId: person.id,
      authSubject,
      status: after.status,
      roles: after.roles,
    };
  });
}

/**
 * One-time Clerk-to-Supabase cutover for the existing owner. The signed
 * Supabase identity is verified by the HTTP layer before this function runs.
 */
export async function claimExistingSuperAdminIdentity(identity: {
  authSubject: string;
  verifiedEmail: string;
  allowRecoveryRebind?: boolean;
}) {
  return db.transaction(async tx => {
    await tx.execute(mutationLock);
    const activeOwners = await tx.select({ person: peopleTable })
      .from(peopleTable)
      .innerJoin(personRolesTable, eq(personRolesTable.personId, peopleTable.id))
      .where(and(eq(peopleTable.status, "active"), eq(personRolesTable.role, "super_admin")));
    if (activeOwners.length > 1) {
      throw new Error("Identity claim requires exactly one active super administrator.");
    }

    let person = activeOwners[0]?.person;
    let legacyAdminCutover = false;
    if (!person) {
      const activeLegacyAdmins = await tx.select({ person: peopleTable })
        .from(peopleTable)
        .innerJoin(personRolesTable, eq(personRolesTable.personId, peopleTable.id))
        .where(and(
          eq(peopleTable.status, "active"),
          eq(personRolesTable.role, "admin"),
          or(
            eq(peopleTable.authProvider, "clerk"),
            and(
              isNull(peopleTable.authProvider),
              isNull(peopleTable.authSubject),
              isNotNull(peopleTable.clerkUserId),
            ),
          ),
        ));
      const legacyIdentityIsConsistent = activeLegacyAdmins.length === 1
        && !!activeLegacyAdmins[0].person.clerkUserId
        && (
          (
            activeLegacyAdmins[0].person.authProvider === "clerk"
            && activeLegacyAdmins[0].person.authSubject === activeLegacyAdmins[0].person.clerkUserId
          )
          || (
            activeLegacyAdmins[0].person.authProvider == null
            && activeLegacyAdmins[0].person.authSubject == null
          )
        );
      if (activeLegacyAdmins.length !== 1
        || !legacyIdentityIsConsistent) {
        throw new Error("Identity claim requires exactly one active legacy Clerk administrator.");
      }
      person = activeLegacyAdmins[0].person;
      legacyAdminCutover = true;
    }

    if (!person.email || person.email.trim().toLowerCase() !== identity.verifiedEmail.trim().toLowerCase()) {
      throw new Error("The verified Supabase email does not match the existing super administrator.");
    }
    if (person.authProvider === "supabase" && person.authSubject === identity.authSubject) {
      return { personId: person.id, status: "already_claimed" as const };
    }
    const isRecoveryRebind = person.authProvider === "supabase";
    if (isRecoveryRebind && !identity.allowRecoveryRebind) {
      throw new Error("The existing super administrator is already linked to another Supabase identity.");
    }
    if (!isRecoveryRebind && person.authSubject && person.authProvider !== "clerk") {
      throw new Error("The existing super administrator is already linked to another identity.");
    }

    const [subjectOwner] = await tx.select({ id: peopleTable.id })
      .from(peopleTable)
      .where(and(
        eq(peopleTable.authProvider, "supabase"),
        eq(peopleTable.authSubject, identity.authSubject),
      ))
      .limit(1);
    if (subjectOwner && subjectOwner.id !== person.id) {
      throw new Error("This Supabase identity is already linked to another TERAS person.");
    }

    await tx.update(peopleTable).set({
      authProvider: "supabase",
      authSubject: identity.authSubject,
      role: legacyAdminCutover ? "super_admin" : person.role,
    }).where(eq(peopleTable.id, person.id));
    if (legacyAdminCutover) {
      await tx.delete(personRolesTable).where(and(
        eq(personRolesTable.personId, person.id),
        eq(personRolesTable.role, "admin"),
      ));
      await tx.insert(personRolesTable).values({
        personId: person.id,
        role: "super_admin",
        createdBy: "supabase:legacy-owner-cutover",
      });
    }
    await audit(
      tx,
      { authSubject: identity.authSubject, personId: person.id, roles: ["super_admin"] },
      legacyAdminCutover
        ? "legacy_admin_promoted_and_identity_claimed"
        : isRecoveryRebind ? "super_admin_identity_recovered" : "super_admin_identity_claimed",
      person.id,
      {
        authProvider: person.authProvider,
        authSubject: person.authSubject,
        roles: legacyAdminCutover ? ["admin"] : ["super_admin"],
      },
      { authProvider: "supabase", authSubject: identity.authSubject, roles: ["super_admin"] },
    );
    return { personId: person.id, status: isRecoveryRebind ? "recovered" as const : "claimed" as const };
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
