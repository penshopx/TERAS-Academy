import assert from "node:assert/strict";
import test from "node:test";
import { classifyBottleneck, type BottleneckData } from "./trainer-bottlenecks";

const at = new Date("2025-01-01T00:00:00.000Z");
const context = { enrollment: { id: "enrollment-a" }, learner: { id: "learner-a" }, pathway: { id: "pathway-a" } };
const otherContext = { enrollment: { id: "enrollment-b" }, learner: { id: "learner-b" }, pathway: { id: "pathway-b" } };
const base = (): BottleneckData => ({ attempts: [], practiceReviews: [], evidence: [], evidenceReviews: [], gaps: [], gapEvents: [], plans: [], activities: [], remediationEvents: [], reassessmentLinks: [], assessments: [], learningTransitions: [], readinessEvents: [] });

test("bottlenecks use deterministic latest gap events and never borrow another assignment", () => {
  const data = base();
  data.gaps.push(
    { id: "gap-a", learnerId: "learner-a", pathwayId: "pathway-a" } as never,
    { id: "gap-b", learnerId: "learner-b", pathwayId: "pathway-b" } as never,
  ) as never;
  data.gapEvents.push(
    { id: "a-open", gapId: "gap-a", status: "Open", createdAt: at } as never,
    { id: "z-resolved", gapId: "gap-a", status: "Resolved", createdAt: at } as never,
  ) as never;
  data.plans.push({ id: "plan-b", gapId: "gap-b" } as never);
  data.activities.push({ id: "activity-b", planId: "plan-b" } as never);

  assert.equal(classifyBottleneck(context, data), "Learning", "same-time events resolve by id, not input order");
  assert.equal(classifyBottleneck(otherContext, data), "Remediation", "only the matching learner/pathway receives its plan");
});

test("bottleneck precedence keeps an active remediation handoff ahead of pending feedback", () => {
  const data = base();
  data.gaps.push({ id: "gap-a", learnerId: "learner-a", pathwayId: "pathway-a" } as never);
  data.plans.push({ id: "plan-a", gapId: "gap-a" } as never);
  data.activities.push({ id: "activity-a", planId: "plan-a" } as never);
  data.attempts.push({ id: "attempt-a", learnerId: "learner-a", pathwayId: "pathway-a", status: "Submitted" } as never);

  assert.equal(classifyBottleneck(context, data), "Remediation");
});