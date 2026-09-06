import assert from "node:assert/strict";
import { and, eq } from "drizzle-orm";
import { db, peopleTable, personRolesTable, pool } from "@workspace/db";
import { provisionSuperAdmin } from "@workspace/db/admin-membership";

const mode = process.argv[2];
const clerkUserId = `user_provision_${crypto.randomUUID().replaceAll("-", "")}`;
const identity = {
  clerkUserId,
  email: `${clerkUserId}@example.test`,
  name: "Production Owner",
  initials: "PO",
};

try {
  if (mode === "ready") {
    const first = await provisionSuperAdmin(identity);
    const retry = await provisionSuperAdmin(identity);
    assert.equal(first.personId, retry.personId);
    assert.equal(retry.status, "active");
    assert.ok(retry.roles.includes("super_admin"));

    await assert.rejects(
      provisionSuperAdmin({
        ...identity,
        clerkUserId: `${clerkUserId}_different`,
        email: `different-${identity.email}`,
      }),
      /active super_admin already exists/,
    );
  } else if (mode === "legacy") {
    await assert.rejects(provisionSuperAdmin(identity), /schema is not ready for super_admin/);
    const assignments = await db.select({ personId: peopleTable.id })
      .from(peopleTable)
      .innerJoin(personRolesTable, eq(personRolesTable.personId, peopleTable.id))
      .where(and(eq(peopleTable.clerkUserId, clerkUserId), eq(personRolesTable.role, "super_admin")));
    assert.equal(assignments.length, 0);
  } else {
    throw new Error("Expected integration mode: ready or legacy");
  }
} finally {
  await pool.end();
}