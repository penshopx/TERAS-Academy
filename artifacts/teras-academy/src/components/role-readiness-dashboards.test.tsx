import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("trainer dashboard separates its review remit from readiness handoff", async () => {
  const source = await readFile(new URL("./trainer/review-queue.tsx", import.meta.url), "utf8");

  assert.match(source, /Trainer review is not certification/);
  assert.match(source, /Practice feedback/);
  assert.match(source, /Remediation/);
  assert.match(source, /Recorded review history/);
  assert.match(source, /dashboard\.reviewHistory/);
  assert.match(source, /Server-backed, append-only reviews/);
  assert.match(source, /entry\.learnerName.*entry\.pathwayName/);
  assert.match(source, /entry\.comment/);
  assert.match(source, /Object\.entries\(entry\.quality\)/);
  assert.match(source, /entry\.reviewer/);
  assert.match(source, /getGetTrainerDashboardQueryKey\(\)/);
  assert.match(source, /getGetLearnerReadinessQueryKey\(\)/);
  assert.match(source, /data-testid="trainer-mutation-history"/);
  assert.match(source, /Readiness lifecycle bottleneck/);
  assert.match(source, /dashboard\.bottlenecks/);
  assert.match(source, /dashboard\.bottlenecks\.asOf/);
  assert.match(source, /Most frequently stalled across your assigned active learner pathways/);
  assert.match(source, /data-testid="trainer-bottleneck-summary"/);
});

test("assessor dashboard records internal recommendations without claiming certification", async () => {
  const source = await readFile(new URL("../pages/assessor.tsx", import.meta.url), "utf8");

  assert.match(source, /Internal evaluation is not certification/);
  assert.match(source, /Assessor decision and reassessment queue/);
  assert.match(source, /Readiness handoff context/);
  assert.match(source, /Decision results this session/);
  assert.match(source, /getGetAssessorDashboardQueryKey\(\)/);
  assert.match(source, /getGetLearnerReadinessQueryKey\(\)/);
  assert.match(source, /data-testid="assessor-mutation-history"/);
});