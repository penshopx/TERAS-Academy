import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sources = [
  "../App.tsx",
  "../pages/passport.tsx",
  "../pages/assessment-detail.tsx",
  "../pages/assessor.tsx",
  "./assessor-decision.tsx",
];

test("active UI uses TERAS internal readiness terminology", async () => {
  const content = (
    await Promise.all(
      sources.map(path => readFile(new URL(path, import.meta.url), "utf8")),
    )
  ).join("\n");

  for (const forbidden of [
    "Official Capability Record",
    "VERIFIED ENGINE RECORD",
    "Official Attempt History",
    "OFFICIAL STORED DECISION",
    "OFFICIAL DECISION TO BE STORED",
    "Sertifikasi TERAS Academy",
    "Kesiapan rilis",
  ]) {
    assert.doesNotMatch(content, new RegExp(forbidden, "i"));
  }

  assert.doesNotMatch(content, />\s*Competent\s*</i);
  assert.doesNotMatch(content, />\s*Not competent\s*</i);
  assert.match(content, /Internal Readiness Recommendation/i);
  assert.match(content, /Longitudinal Capability Record/i);
});