import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const appSource = readFileSync(new URL("../App.tsx", import.meta.url), "utf8");
const authSource = readFileSync(new URL("./supabase-auth.tsx", import.meta.url), "utf8");

test("email login uses the primary PKCE client and supports magic-link callbacks", () => {
  assert.match(appSource, /supabase\.auth\.signInWithOtp/);
  assert.match(appSource, /emailRedirectTo: `\$\{window\.location\.origin\}\$\{basePath\}\/security`/);
  assert.match(authSource, /exchangeCodeForSession\(code\)/);
  assert.doesNotMatch(appSource, /recoverySupabase/);
  assert.doesNotMatch(authSource, /flowType: "implicit"/);
});

test("email login instructions accept either a link or a displayed code", () => {
  assert.match(appSource, /Buka tautannya atau masukkan kode jika email menampilkan kode/);
  assert.match(appSource, /Kode masuk dari email \(opsional\)/);
});