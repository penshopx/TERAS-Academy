import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const security = readFileSync(new URL("../pages/security.tsx", import.meta.url), "utf8");

test("security page tolerates transitional session and MFA payloads", () => {
  assert.match(security, /Array\.isArray\(currentSession\.data\?\.roles\)/);
  assert.match(security, /Array\.isArray\(data\?\.all\)/);
  assert.match(security, /catch\s*\{/);
  assert.doesNotMatch(security, /currentSession\.data\?\.roles\.includes/);
});