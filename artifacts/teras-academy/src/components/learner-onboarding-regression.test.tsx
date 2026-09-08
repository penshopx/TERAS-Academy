import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const app = readFileSync(new URL("../App.tsx", import.meta.url), "utf8");

test("new verified learners receive a safe waiting state until enrollment", () => {
  assert.match(app, /function LearnerAwaitingEnrollment/);
  assert.match(app, /enabled:\s*learnerOnly/);
  assert.match(app, /learnerOnly && learnerDashboard\.isError/);
  assert.match(app, /Admin perlu menambahkan Anda[\s\S]*program dan pathway/);
});