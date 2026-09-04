import React from "react";

export type LegacyAssessmentDecision = "Competent" | "Not competent";

type QueueItem = {
  priority: string;
  updatedAt: string;
};

type Criterion = {
  id: string;
  critical: boolean;
};

type FocusTarget = {
  focus: (options?: FocusOptions) => void;
};

export function restoreDecisionFocus({
  target,
  preserveViewport,
  scrollY,
  schedule,
  scrollTo,
}: {
  target: FocusTarget | null;
  preserveViewport: boolean;
  scrollY: number;
  schedule: (callback: () => void) => void;
  scrollTo: (x: number, y: number) => void;
}) {
  schedule(() => {
    target?.focus({ preventScroll: preserveViewport });
    if (preserveViewport) scrollTo(0, scrollY);
  });
}

export function prioritizeDecisionQueue<T extends QueueItem>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const priority = (value: string) => value === "Critical" ? 0 : 1;
    return priority(a.priority) - priority(b.priority)
      || new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
  });
}

export function hasCriticalFailure(criteria: Criterion[], scores: Record<string, number>): boolean {
  return criteria.some(
    criterion => criterion.critical
      && scores[criterion.id] !== undefined
      && scores[criterion.id] < 2,
  );
}

export function enforceInternalRecommendation(
  requestedDecision: LegacyAssessmentDecision,
  criticalFailure: boolean,
): LegacyAssessmentDecision {
  return criticalFailure ? "Not competent" : requestedDecision;
}

export function recommendationLabel(decision: LegacyAssessmentDecision): string {
  return decision === "Competent" ? "Ready for Next Stage" : "Needs Reinforcement";
}

export function DecisionSummary({
  requestedDecision,
  criticalFailure,
  requestedControl,
}: {
  requestedDecision: LegacyAssessmentDecision;
  criticalFailure: boolean;
  requestedControl?: React.ReactNode;
}) {
  const storedRecommendation = enforceInternalRecommendation(requestedDecision, criticalFailure);

  return (
    <div className="grid gap-3 rounded-lg border border-border p-4 sm:grid-cols-2">
      <div>
        <div className="text-xs font-mono text-muted-foreground">REQUESTED RECOMMENDATION</div>
        <div data-testid="requested-decision-value">
          {requestedControl ?? <div className="mt-2 text-lg font-bold">{recommendationLabel(requestedDecision)}</div>}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">Your selection before safety enforcement is applied.</p>
      </div>
      <div className={criticalFailure ? "rounded-md border border-destructive/40 bg-destructive/5 p-3" : "rounded-md border border-primary/30 bg-primary/5 p-3"}>
        <div className="text-xs font-mono text-muted-foreground">INTERNAL READINESS RECOMMENDATION</div>
        <div className={`mt-2 text-lg font-bold ${criticalFailure ? "text-destructive" : "text-primary"}`} data-testid="internal-recommendation-value">{recommendationLabel(storedRecommendation)}</div>
        <p className="mt-1 text-xs text-muted-foreground">{criticalFailure ? "Overridden by critical-criterion safety enforcement." : "Matches the requested recommendation based on current scores."}</p>
      </div>
    </div>
  );
}