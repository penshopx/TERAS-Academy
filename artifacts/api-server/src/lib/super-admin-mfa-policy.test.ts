import assert from "node:assert/strict";
import test from "node:test";
import {
  allowsAdministrativeRoles,
  allowsSuperAdminMfa,
} from "@workspace/db/super-admin-mfa-policy";

const aal2 = { aal: "aal2", test: false } as const;

test("Super Admin requires both aal2 and the exact enrollment lock value", () => {
  assert.equal(allowsSuperAdminMfa(aal2, {}), false);
  assert.equal(allowsSuperAdminMfa(aal2, { SUPABASE_MFA_ENROLLMENT_LOCKED: "false" }), false);
  assert.equal(allowsSuperAdminMfa(aal2, { SUPABASE_MFA_ENROLLMENT_LOCKED: "TRUE" }), false);
  assert.equal(allowsSuperAdminMfa(aal2, { SUPABASE_MFA_ENROLLMENT_LOCKED: " true" }), false);
  assert.equal(allowsSuperAdminMfa(aal2, { SUPABASE_MFA_ENROLLMENT_LOCKED: "true" }), true);
  assert.equal(allowsSuperAdminMfa(
    { aal: "aal1", test: false },
    { SUPABASE_MFA_ENROLLMENT_LOCKED: "true" },
  ), false);
});

test("authorization denies generic aal2 Super Admin but does not burden admin", () => {
  assert.equal(allowsAdministrativeRoles(["super_admin"], aal2, {}), false);
  assert.equal(allowsAdministrativeRoles(
    ["super_admin"],
    aal2,
    { SUPABASE_MFA_ENROLLMENT_LOCKED: "false" },
  ), false);
  assert.equal(allowsAdministrativeRoles(
    ["super_admin"],
    aal2,
    { SUPABASE_MFA_ENROLLMENT_LOCKED: "true" },
  ), true);
  assert.equal(allowsAdministrativeRoles(["admin"], { aal: "aal1", test: false }, {}), true);
});

test("integration identities bypass the lock only in NODE_ENV=test", () => {
  const integrationIdentity = { aal: "aal2", test: true } as const;
  assert.equal(allowsSuperAdminMfa(integrationIdentity, { NODE_ENV: "test" }), true);
  assert.equal(allowsSuperAdminMfa(integrationIdentity, { NODE_ENV: "development" }), false);
  assert.equal(allowsSuperAdminMfa(integrationIdentity, { NODE_ENV: "production" }), false);
  assert.equal(allowsSuperAdminMfa(integrationIdentity, {}), false);
});