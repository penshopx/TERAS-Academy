import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const app = readFileSync(new URL("../App.tsx", import.meta.url), "utf8");

test("new verified learners receive a safe waiting state until enrollment", () => {
  assert.match(app, /function LearnerAwaitingEnrollment/);
  assert.match(app, /const requiresEnrollment = learnerOnly && location !== "\/security"/);
  assert.match(app, /enabled:\s*requiresEnrollment/);
  assert.match(app, /requiresEnrollment && learnerDashboard\.isError/);
  assert.match(app, /Akses ke pathway utama sedang[\s\S]*disiapkan otomatis/);
});