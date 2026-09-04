import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  DecisionSummary,
  getOfficialDecision,
  hasCriticalFailure,
  prioritizeDecisionQueue,
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
  test(`critical score ${score} preserves the requested label and shows the official override`, () => {
    const criticalFailure = hasCriticalFailure([{ id: "critical", critical: true }], { critical: score });
    const markup = renderToStaticMarkup(
      <DecisionSummary requestedDecision="Competent" criticalFailure={criticalFailure} />,
    );

    assert.equal(getOfficialDecision("Competent", criticalFailure), "Not competent");
    assert.match(markup, /data-testid="requested-decision-value"/);
    assert.match(markup, /REQUESTED DECISION[\s\S]*Competent/);
    assert.match(markup, /data-testid="official-decision-value">Not competent/);
    assert.match(markup, /OFFICIAL DECISION TO BE STORED[\s\S]*Not competent/);
    assert.match(markup, /Overridden by critical-criterion safety enforcement/);
  });
}

test("attempt history identifies decisions as official stored records", async () => {
  const source = await readFile(new URL("../pages/assessment-detail.tsx", import.meta.url), "utf8");

  assert.match(source, /Official Attempt History/);
  assert.match(source, /Stored decisions only; newest official record appears last\./);
  assert.match(source, /OFFICIAL STORED DECISION/);
});

test("submission still sends the requested decision unless safety enforcement overrides it", () => {
  assert.equal(getOfficialDecision("Competent", false), "Competent");
  assert.equal(getOfficialDecision("Not competent", false), "Not competent");
  assert.equal(getOfficialDecision("Competent", true), "Not competent");
});

test("assessor selects expose stable keyboard-accessible names", async () => {
  const source = await readFile(new URL("../pages/assessor.tsx", import.meta.url), "utf8");

  assert.match(source, /aria-label=\{`Score for \$\{c\.code\} — \$\{c\.label\}`\}/);
  assert.match(source, /aria-label="Requested decision"/);
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
