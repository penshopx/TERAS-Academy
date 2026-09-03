export type SafetyDecision = "Competent" | "Not competent";

export type SafetyCriterionScore = {
  critical: boolean;
  score: number;
};

export function enforceSafetyDecision(
  criteria: SafetyCriterionScore[],
  requestedDecision: SafetyDecision,
): { decision: SafetyDecision; criticalFailure: boolean } {
  const criticalFailure = criteria.some(criterion => criterion.critical && criterion.score < 2);
  return {
    decision: criticalFailure ? "Not competent" : requestedDecision,
    criticalFailure,
  };
}