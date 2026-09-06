import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const workspaceRoot = fileURLToPath(new URL("../../", import.meta.url));
const [authorization, membership, provisioning, repl, schema] = await Promise.all([
  readFile(`${workspaceRoot}artifacts/api-server/src/lib/authorization.ts`, "utf8"),
  readFile(`${workspaceRoot}lib/db/src/admin-membership.ts`, "utf8"),
  readFile(`${workspaceRoot}scripts/src/provision-super-admin.ts`, "utf8"),
  readFile(`${workspaceRoot}.replit`, "utf8"),
  readFile(`${workspaceRoot}lib/db/src/schema/teras.ts`, "utf8"),
]);

assert.doesNotMatch(authorization, /TERAS_BOOTSTRAP_ADMIN|ensureConfiguredBootstrapAdmin/);
assert.doesNotMatch(membership, /ensureConfiguredAdmin/);
assert.doesNotMatch(repl, /TERAS_BOOTSTRAP_ADMIN/);
assert.match(provisioning, /users\.getUser\(clerkUserId\)/);
assert.doesNotMatch(provisioning, /getUserList|emailAddress:\s*\[/);
assert.match(provisioning, /verification\?\.status === "verified"/);
assert.match(provisioning, /NODE_ENV !== "production"/);
assert.match(provisioning, /REPLIT_DEPLOYMENT !== "1"/);
assert.match(provisioning, /result\.status !== "active"/);
assert.match(provisioning, /result\.roles\.includes\("super_admin"\)/);
assert.match(membership, /An active super_admin already exists/);
assert.match(membership, /Production schema is not ready for super_admin/);
assert.match(schema, /teras_person_roles_role_check/);
assert.match(schema, /IN \('super_admin', 'admin', 'trainer', 'assessor', 'learner'\)/);

process.stdout.write("Super Admin provisioning policy checks passed\n");