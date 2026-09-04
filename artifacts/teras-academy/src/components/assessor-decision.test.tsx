import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  DecisionSummary,
  enforceInternalRecommendation,
  hasCriticalFailure,
  prioritizeDecisionQueue,
  recommendationLabel,
  restoreDecisionFocus,
} from "./assessor-decision";

test("critical queue items appear before normal items", () => {
  const queue = prioritizeDecisionQueue([
    { id: "normal", priority: "Normal", updatedAt: "2026-09-01T08:00:00Z" },
    { id: "critical-later", priority: "Critical", updatedAt: "2026-09-02T08:00:00Z" },
    { id: "critical-earlier", priority: "Critical", updatedAt: "2026-09-01T08:00:00Z" },
  ]);

  assert.deepEqual(queue.map(item => item.id), ["critical-earlier", "critical-later", "normal"]);
});

for (const score of [0, 1]) {
  test(`critical score ${score} preserves the requested recommendation and shows the safety override`, () => {
    const criticalFailure = hasCriticalFailure([{ id: "critical", critical: true }], { critical: score });
    const markup = renderToStaticMarkup(
      <DecisionSummary requestedDecision="Competent" criticalFailure={criticalFailure} />,
    );

    assert.equal(enforceInternalRecommendation("Competent", criticalFailure), "Not competent");
    assert.match(markup, /data-testid="requested-decision-value"/);
    assert.match(markup, /REQUESTED RECOMMENDATION[\s\S]*Ready for Next Stage/);
    assert.match(markup, /data-testid="internal-recommendation-value">Needs Reinforcement/);
    assert.match(markup, /INTERNAL READINESS RECOMMENDATION[\s\S]*Needs Reinforcement/);
    assert.match(markup, /Overridden by critical-criterion safety enforcement/);
  });
}

test("attempt history identifies decisions as internal evaluation records", async () => {
  const source = await readFile(new URL("../pages/assessment-detail.tsx", import.meta.url), "utf8");

  assert.match(source, /Internal Evaluation History/);
  assert.match(source, /Stored internal recommendations; newest record appears last\./);
  assert.match(source, /INTERNAL READINESS RECOMMENDATION/);
});

test("submission still sends the requested decision unless safety enforcement overrides it", () => {
  assert.equal(enforceInternalRecommendation("Competent", false), "Competent");
  assert.equal(enforceInternalRecommendation("Not competent", false), "Not competent");
  assert.equal(enforceInternalRecommendation("Competent", true), "Not competent");
  assert.equal(recommendationLabel("Competent"), "Ready for Next Stage");
  assert.equal(recommendationLabel("Not competent"), "Needs Reinforcement");
});

test("assessor selects expose stable keyboard-accessible names", async () => {
  const source = await readFile(new URL("../pages/assessor.tsx", import.meta.url), "utf8");

  assert.match(source, /aria-label=\{`Score for \$\{c\.code\} — \$\{c\.label\}`\}/);
  assert.match(source, /aria-label="Requested recommendation"/);
  assert.match(source, /data-testid="requested-decision-select"/);
});

test("closing a mobile decision restores its trigger without moving the queue viewport", () => {
  const calls: string[] = [];
  const target = {
    focus: (options?: FocusOptions) => calls.push(`focus:${options?.preventScroll}`),
  };

  restoreDecisionFocus({
    target,
    preserveViewport: true,
    scrollY: 640,
    schedule: callback => callback(),
    scrollTo: (x, y) => calls.push(`scroll:${x},${y}`),
  });

  assert.deepEqual(calls, ["focus:true", "scroll:0,640"]);
});

test("successful mobile submission focuses the visible queue title without restoring stale scroll", () => {
  const calls: string[] = [];
  const target = {
    focus: (options?: FocusOptions) => calls.push(`focus:${options?.preventScroll}`),
  };

  restoreDecisionFocus({
    target,
    preserveViewport: false,
    scrollY: 640,
    schedule: callback => callback(),
    scrollTo: () => calls.push("unexpected-scroll"),
  });

  assert.deepEqual(calls, ["focus:false"]);
});

test("mobile queue controls expose item-specific browser selectors", async () => {
  const source = await readFile(new URL("../pages/assessor.tsx", import.meta.url), "utf8");

  assert.match(source, /data-testid=\{`mobile-decide-\$\{item\.id\}`\}/);
  assert.match(source, /data-testid="decision-queue-title"/);
  assert.match(source, /decisionScrollYRef\.current = window\.scrollY/);
});
