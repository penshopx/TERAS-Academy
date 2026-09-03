import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { LearnerConditionView } from "./learner-condition";

const dashboard = {
  learner: { name: "Ayu Pratama" },
  pathway: { name: "Solar PV Technician" },
  evidenceCounts: {
    valid: 4,
    total: 5,
    underReview: 1,
    needsRevision: 0,
  },
};

const currentGate = {
  code: "G2",
  name: "Supervised practice",
  requirement: "Pass the critical isolation assessment.",
};

test("renders a clear learner condition with explicit safety and no blockers", () => {
  const markup = renderToStaticMarkup(
    <LearnerConditionView
      owner="Learner"
      dashboard={dashboard}
      readiness={{
        status: "Ready",
        score: 100,
        blockers: [],
        currentGate,
      }}
    />,
  );

  assert.match(markup, /SAFETY CLEAR/);
  assert.match(markup, /Safety status/);
  assert.match(markup, /no critical assessment failure/);
  assert.match(markup, /No active blockers/);
  assert.match(markup, /Action owner/);
  assert.match(markup, /Learner/);
});

test("renders a blocked learner condition with safety and every blocker visible", () => {
  const blockers = [
    "Critical assessment failed: electrical isolation",
    "Evidence package requires revision",
  ];
  const markup = renderToStaticMarkup(
    <LearnerConditionView
      owner="Assessor"
      dashboard={dashboard}
      readiness={{
        status: "Blocked",
        score: 62,
        blockers,
        currentGate,
      }}
    />,
  );

  assert.match(markup, /SAFETY BLOCKED/);
  assert.match(markup, /active critical assessment failure/);
  assert.match(markup, /Critical failure/);
  assert.match(markup, /Assessor/);
  for (const blocker of blockers) {
    assert.match(markup, new RegExp(blocker));
  }
});

test("all authenticated role pages include the canonical condition panel", async () => {
  const routes = [
    ["dashboard.tsx", "Learner"],
    ["readiness.tsx", "Learner"],
    ["trainer.tsx", "Trainer"],
    ["assessor.tsx", "Assessor"],
    ["passport.tsx", "Learner"],
  ] as const;

  await Promise.all(
    routes.map(async ([file, owner]) => {
      const source = await readFile(new URL(`../pages/${file}`, import.meta.url), "utf8");
      assert.match(source, /import\s+\{\s*LearnerCondition\s*\}\s+from\s+"@\/components\/learner-condition"/);
      assert.match(source, new RegExp(`<LearnerCondition\\s+owner="${owner}"\\s*\\/>`));
    }),
  );
});