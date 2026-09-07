import assert from "node:assert/strict";
import test from "node:test";
import { isValidTotpCode, normalizeTotpCode } from "./mfa";

test("MFA code state accepts only a complete six-digit TOTP", () => {
  assert.equal(isValidTotpCode("123456"), true);
  assert.equal(isValidTotpCode("12345"), false);
  assert.equal(isValidTotpCode("1234567"), false);
  assert.equal(isValidTotpCode("12ab56"), false);
});

test("MFA code state removes non-digits and does not retain excess input", () => {
  assert.equal(normalizeTotpCode("12 34-56"), "123456");
  assert.equal(normalizeTotpCode("123456789"), "123456");
});