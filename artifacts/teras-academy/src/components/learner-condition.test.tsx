import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { LearnerConditionState, LearnerConditionView } from "./learner-condition";

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

const readiness = {
  status: "Ready",
  score: 100,
  blockers: [],
  currentGate,
};

function renderConditionState(overrides: Partial<React.ComponentProps<typeof LearnerConditionState>> = {}) {
  return renderToStaticMarkup(
    <LearnerConditionState
      owner="Learner"
      dashboard={dashboard}
      readiness={readiness}
      dashboardLoading={false}
      readinessLoading={false}
      dashboardError={null}
      readinessError={null}
      {...overrides}
    />,
  );
}

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

test("keeps the learner condition loading state visible without stale safety data", () => {
  const markup = renderConditionState({
    dashboard: undefined,
    readiness: undefined,
    dashboardLoading: true,
    readinessLoading: true,
  });

  assert.match(markup, /Loading learner condition/);
  assert.doesNotMatch(markup, /SAFETY CLEAR|SAFETY BLOCKED|Ayu Pratama/);
});

for (const failedSource of ["dashboard", "readiness"] as const) {
  test(`renders unavailable without stale safety data when ${failedSource} fails`, () => {
    const markup = renderConditionState({
      [`${failedSource}Error`]: new Error(`${failedSource} failed`),
      [`${failedSource}Loading`]: false,
      [failedSource === "dashboard" ? "readinessLoading" : "dashboardLoading"]: true,
    });

    assert.match(markup, /Learner condition is unavailable/);
    assert.match(markup, /Safety status cannot be confirmed/);
    assert.doesNotMatch(markup, /Loading learner condition|SAFETY CLEAR|SAFETY BLOCKED|Ayu Pratama|Solar PV Technician/);
  });
}

test("all authenticated role pages include the canonical condition panel", async () => {
  const routes = [
    ["dashboard.tsx", "Learner"],
    ["readiness.tsx", "Learner"],
    ["trainer.tsx", "Trainer"],
    ["assessor.tsx", "Internal Evaluator"],
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