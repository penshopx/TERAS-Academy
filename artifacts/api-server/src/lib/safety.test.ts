import assert from "node:assert/strict";
import { enforceSafetyDecision } from "./safety.js";

const pass = (score: number) => ({ critical: true, score });

assert.deepEqual(
  enforceSafetyDecision([pass(0), { critical: false, score: 3 }], "Competent"),
  { decision: "Not competent", criticalFailure: true },
);
assert.deepEqual(
  enforceSafetyDecision([pass(1), pass(3)], "Competent"),
  { decision: "Not competent", criticalFailure: true },
);
assert.deepEqual(
  enforceSafetyDecision([pass(1), ...Array.from({ length: 9 }, () => ({ critical: false, score: 3 }))], "Competent"),
  { decision: "Not competent", criticalFailure: true },
);
assert.deepEqual(
  enforceSafetyDecision([pass(2), pass(3)], "Competent"),
  { decision: "Competent", criticalFailure: false },
);
assert.deepEqual(
  enforceSafetyDecision([pass(2), pass(3)], "Not competent"),
  { decision: "Not competent", criticalFailure: false },
);

console.log("Safety blocker regression checks passed");