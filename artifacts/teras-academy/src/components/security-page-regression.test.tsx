import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const security = readFileSync(new URL("../pages/security.tsx", import.meta.url), "utf8");

test("security page tolerates transitional session and MFA payloads", () => {
  assert.match(security, /Array\.isArray\(currentSession\.data\?\.roles\)/);
  assert.match(security, /Array\.isArray\(data\?\.all\)/);
  assert.match(security, /catch\s*\{/);
  assert.doesNotMatch(security, /currentSession\.data\?\.roles\.includes/);
  assert.match(security, /Ajukan menjadi Admin/);
  assert.match(security, /targetPersonId:\s*personId/);
  assert.match(security, /Admin atau Super Admin akan menyetujui atau menolaknya/);
  assert.doesNotMatch(security, /Hubungkan akses pemilik/);
});