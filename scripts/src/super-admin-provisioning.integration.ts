import assert from "node:assert/strict";
import { and, eq } from "drizzle-orm";
import { db, peopleTable, personRolesTable, pool } from "@workspace/db";
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
  } else {
    throw new Error("Expected integration mode: ready or legacy");
  }
} finally {
  await pool.end();
}