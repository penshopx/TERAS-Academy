import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const workspaceRoot = fileURLToPath(new URL("../../", import.meta.url));
const [authorization, membership, provisioning, repl, schema, securityPage, mfaPolicy] = await Promise.all([
  readFile(`${workspaceRoot}artifacts/api-server/src/lib/authorization.ts`, "utf8"),
  readFile(`${workspaceRoot}lib/db/src/admin-membership.ts`, "utf8"),
  readFile(`${workspaceRoot}scripts/src/provision-super-admin.ts`, "utf8"),
  readFile(`${workspaceRoot}.replit`, "utf8"),
  readFile(`${workspaceRoot}lib/db/src/schema/teras.ts`, "utf8"),
  readFile(`${workspaceRoot}artifacts/teras-academy/src/pages/security.tsx`, "utf8"),
  readFile(`${workspaceRoot}lib/db/src/super-admin-mfa-policy.ts`, "utf8"),
]);

assert.doesNotMatch(authorization, /TERAS_BOOTSTRAP_ADMIN|ensureConfiguredBootstrapAdmin/);
assert.match(authorization, /supabaseIdentity/);
assert.match(authorization, /allowsAdministrativeRoles\(roles, actor, process\.env\)/);
assert.match(mfaPolicy, /identity\.aal === "aal2"/);
assert.match(mfaPolicy, /SUPABASE_MFA_ENROLLMENT_LOCKED === "true"/);
assert.doesNotMatch(membership, /ensureConfiguredAdmin/);
assert.doesNotMatch(repl, /TERAS_BOOTSTRAP_ADMIN/);
assert.match(provisioning, /verifySupabaseJwt\(token\)/);
assert.match(provisioning, /allowsSuperAdminMfa\(\{ aal: identity\.aal, test: false \}, process\.env\)/);
assert.match(provisioning, /process\.env\.SUPABASE_BOOTSTRAP_ACCESS_TOKEN/);
assert.doesNotMatch(provisioning, /--supabase-access-token/);
assert.match(provisioning, /identity\.emailVerified/);
assert.doesNotMatch(provisioning, /@clerk|createClerkClient|CLERK_SECRET_KEY/);
assert.doesNotMatch(provisioning, /Supabase access token \$\{token\}/);
assert.match(provisioning, /NODE_ENV !== "production"/);
assert.match(provisioning, /REPLIT_DEPLOYMENT !== "1"/);
assert.match(provisioning, /result\.status !== "active"/);
assert.match(provisioning, /result\.roles\.includes\("super_admin"\)/);
assert.match(membership, /An active super_admin already exists/);
assert.match(membership, /Production schema is not ready for super_admin/);
assert.match(membership, /expectedOwnerEmail/);
assert.match(schema, /teras_person_roles_role_check/);
assert.match(schema, /IN \('super_admin', 'admin', 'trainer', 'assessor', 'learner'\)/);
assert.doesNotMatch(securityPage, /mfa\.(?:enroll|unenroll)\s*\(/);

process.stdout.write("Super Admin provisioning policy checks passed\n");