import React from "react";

export type AssessorDecision = "Competent" | "Not competent";

type QueueItem = {
  priority: string;
  updatedAt: string;
};

type Criterion = {
  id: string;
  critical: boolean;
};

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

export function getOfficialDecision(
  requestedDecision: AssessorDecision,
  criticalFailure: boolean,
): AssessorDecision {
  return criticalFailure ? "Not competent" : requestedDecision;
}

export function DecisionSummary({
  requestedDecision,
  criticalFailure,
  requestedControl,
}: {
  requestedDecision: AssessorDecision;
  criticalFailure: boolean;
  requestedControl?: React.ReactNode;
}) {
  const officialDecision = getOfficialDecision(requestedDecision, criticalFailure);

  return (
    <div className="grid gap-3 rounded-lg border border-border p-4 sm:grid-cols-2">
      <div>
        <div className="text-xs font-mono text-muted-foreground">REQUESTED DECISION</div>
        {requestedControl ?? <div className="mt-2 text-lg font-bold">{requestedDecision}</div>}
        <p className="mt-2 text-xs text-muted-foreground">Your selection before safety enforcement is applied.</p>
      </div>
      <div className={criticalFailure ? "rounded-md border border-destructive/40 bg-destructive/5 p-3" : "rounded-md border border-primary/30 bg-primary/5 p-3"}>
        <div className="text-xs font-mono text-muted-foreground">OFFICIAL DECISION TO BE STORED</div>
        <div className={`mt-2 text-lg font-bold ${criticalFailure ? "text-destructive" : "text-primary"}`}>{officialDecision}</div>
        <p className="mt-1 text-xs text-muted-foreground">{criticalFailure ? "Overridden by critical-criterion safety enforcement." : "Matches the requested decision based on current scores."}</p>
      </div>
    </div>
  );
}