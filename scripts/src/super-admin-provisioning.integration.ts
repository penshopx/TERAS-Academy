import assert from "node:assert/strict";
import { and, eq } from "drizzle-orm";
import { adminAuditEventsTable, db, peopleTable, personRolesTable, pool } from "@workspace/db";
import {
  claimExistingSuperAdminIdentity,
  provisionSuperAdmin,
} from "@workspace/db/admin-membership";

const mode = process.argv[2];
const authSubject = crypto.randomUUID();
const identity = {
  authSubject,
  email: `${authSubject}@example.test`,
  name: "Production Owner",
  initials: "PO",
};

try {
  if (mode === "ready") {
    const first = await provisionSuperAdmin(identity);
    await db.update(peopleTable).set({
      authProvider: "clerk",
      authSubject: `legacy-${authSubject}`,
      clerkUserId: `legacy-${authSubject}`,
    }).where(eq(peopleTable.id, first.personId));
    await assert.rejects(
      claimExistingSuperAdminIdentity({
        authSubject,
        verifiedEmail: `different-${identity.email}`,
      }),
      /does not match/,
    );
    const claim = await claimExistingSuperAdminIdentity({
      authSubject,
      verifiedEmail: identity.email,
    });
    const repeatedClaim = await claimExistingSuperAdminIdentity({
      authSubject,
      verifiedEmail: identity.email,
    });
    assert.equal(claim.status, "claimed");
    assert.equal(repeatedClaim.status, "already_claimed");
    const retry = await provisionSuperAdmin(identity);
    assert.equal(first.personId, retry.personId);
    assert.equal(retry.status, "active");
    assert.ok(retry.roles.includes("super_admin"));

    await assert.rejects(
      provisionSuperAdmin({
        ...identity,
        authSubject: crypto.randomUUID(),
        email: `different-${identity.email}`,
      }),
      /active super_admin already exists/,
    );
    const recoveredSubject = crypto.randomUUID();
    await assert.rejects(
      claimExistingSuperAdminIdentity({
        authSubject: recoveredSubject,
        verifiedEmail: identity.email,
      }),
      /another Supabase identity/,
    );
    const recovery = await claimExistingSuperAdminIdentity({
      authSubject: recoveredSubject,
      verifiedEmail: identity.email,
      allowRecoveryRebind: true,
    });
    assert.equal(recovery.status, "recovered");
    const repeatedRecovery = await claimExistingSuperAdminIdentity({
      authSubject: recoveredSubject,
      verifiedEmail: identity.email,
    });
    assert.equal(repeatedRecovery.status, "already_claimed");
  } else if (mode === "legacy") {
    await assert.rejects(provisionSuperAdmin(identity), /schema is not ready for super_admin/);
    const assignments = await db.select({ personId: peopleTable.id })
      .from(peopleTable)
      .innerJoin(personRolesTable, eq(personRolesTable.personId, peopleTable.id))
      .where(and(eq(peopleTable.authSubject, authSubject), eq(personRolesTable.role, "super_admin")));
    assert.equal(assignments.length, 0);
  } else if (mode === "legacy-admin-cutover") {
    const first = await provisionSuperAdmin(identity);
    const legacySubject = `legacy-${authSubject}`;
    await db.update(peopleTable).set({
      email: null,
      authProvider: null,
      authSubject: null,
      clerkUserId: legacySubject,
      role: "admin",
    }).where(eq(peopleTable.id, first.personId));
    await db.delete(personRolesTable).where(eq(personRolesTable.personId, first.personId));
    await db.insert(personRolesTable).values({
      personId: first.personId,
      role: "admin",
      createdBy: "legacy-fixture",
    });

    await assert.rejects(
      claimExistingSuperAdminIdentity({
        authSubject,
        verifiedEmail: identity.email,
      }),
      /configured legacy owner/,
    );
    await assert.rejects(
      claimExistingSuperAdminIdentity({
        authSubject,
        verifiedEmail: `different-${identity.email}`,
        expectedOwnerEmail: identity.email,
      }),
      /configured legacy owner/,
    );
    const claim = await claimExistingSuperAdminIdentity({
      authSubject,
      verifiedEmail: identity.email,
      expectedOwnerEmail: identity.email,
    });
    assert.equal(claim.status, "claimed");

    const [person] = await db.select().from(peopleTable).where(eq(peopleTable.id, first.personId));
    const roles = await db.select({ role: personRolesTable.role })
      .from(personRolesTable)
      .where(eq(personRolesTable.personId, first.personId));
    const auditEvents = await db.select({ action: adminAuditEventsTable.action })
      .from(adminAuditEventsTable)
      .where(eq(adminAuditEventsTable.entityId, first.personId));
    assert.equal(person.authProvider, "supabase");
    assert.equal(person.authSubject, authSubject);
    assert.equal(person.email, identity.email);
    assert.equal(person.role, "super_admin");
    assert.deepEqual(roles.map(item => item.role), ["super_admin"]);
    assert.ok(auditEvents.some(event => event.action === "legacy_admin_promoted_and_identity_claimed"));

    const repeated = await claimExistingSuperAdminIdentity({
      authSubject,
      verifiedEmail: identity.email,
    });
    assert.equal(repeated.status, "already_claimed");
  } else {
    throw new Error("Expected integration mode: ready, legacy, or legacy-admin-cutover");
  }
} finally {
  await pool.end();
}