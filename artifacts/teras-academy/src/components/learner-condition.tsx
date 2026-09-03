import { useGetLearnerDashboard, useGetLearnerReadiness } from "@workspace/api-client-react";
import { AlertTriangle, CheckCircle2, ClipboardCheck, FileCheck2, ShieldAlert, ShieldCheck, UserRound } from "lucide-react";
import React from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

type LearnerConditionProps = {
  owner: string;
};

type LearnerConditionViewProps = LearnerConditionProps & {
  dashboard: {
    learner: { name: string };
    pathway: { name: string };
    evidenceCounts: {
      valid: number;
      total: number;
      underReview: number;
      needsRevision: number;
    };
  };
  readiness: {
    status: string;
    score: number;
    blockers: string[];
    currentGate: {
      code: string;
      name: string;
      requirement: string;
    };
  };
};

type LearnerConditionStateProps = LearnerConditionProps & {
  dashboard: LearnerConditionViewProps["dashboard"] | undefined;
  readiness: LearnerConditionViewProps["readiness"] | undefined;
  dashboardLoading: boolean;
  readinessLoading: boolean;
  dashboardError: unknown;
  readinessError: unknown;
};

export function LearnerCondition({ owner }: LearnerConditionProps) {
  const dashboardQuery = useGetLearnerDashboard();
  const readinessQuery = useGetLearnerReadiness();

  return (
    <LearnerConditionState
      owner={owner}
      dashboard={dashboardQuery.data}
      readiness={readinessQuery.data}
      dashboardLoading={dashboardQuery.isLoading}
      readinessLoading={readinessQuery.isLoading}
      dashboardError={dashboardQuery.error}
      readinessError={readinessQuery.error}
    />
  );
}

export function LearnerConditionState({
  owner,
  dashboard,
  readiness,
  dashboardLoading,
  readinessLoading,
  dashboardError,
  readinessError,
}: LearnerConditionStateProps) {
  if (dashboardError || readinessError) {
    return <Card className="border-destructive/40 bg-destructive/5"><CardContent className="p-5 text-sm text-destructive">Learner condition is unavailable. Safety status cannot be confirmed until dashboard and readiness data are available.</CardContent></Card>;
  }

  if (dashboardLoading || readinessLoading) {
    return <Card className="border-primary/20"><CardContent className="p-5 text-sm text-muted-foreground">Loading learner condition…</CardContent></Card>;
  }

  if (!dashboard || !readiness) {
    return <Card className="border-destructive/40 bg-destructive/5"><CardContent className="p-5 text-sm text-destructive">Learner condition is unavailable. Safety status cannot be confirmed until dashboard and readiness data are available.</CardContent></Card>;
  }

  return <LearnerConditionView owner={owner} dashboard={dashboard} readiness={readiness} />;
}

export function LearnerConditionView({ owner, dashboard, readiness }: LearnerConditionViewProps) {
  const safetyState = readiness.status === "Blocked"
    ? "BLOCKED"
    : readiness.score === 100 && readiness.blockers.length === 0
      ? "CLEAR"
      : "NOT CLEARED";
  const safetyBlocked = safetyState === "BLOCKED";
  const safetyClear = safetyState === "CLEAR";
  const safetyMessage = safetyState === "BLOCKED"
    ? "The readiness engine reports an active critical assessment failure or unresolved critical gap. Progression remains blocked."
    : safetyState === "CLEAR"
      ? "All readiness requirements are complete and the engine reports no critical assessment failure or unresolved critical gap."
      : "Safety clearance has not yet been established. Complete the outstanding assessment, evidence, and gap requirements.";
  const assessmentBlockers = readiness.blockers.filter(blocker =>
    /assessment/i.test(blocker),
  );
  const assessmentStatus = safetyBlocked
    ? "Critical failure"
    : assessmentBlockers.length
      ? "Pending"
      : "Current gate complete";

  return (
    <Card className={safetyBlocked ? "border-destructive/70 bg-destructive/5" : safetyClear ? "border-green-500/40 bg-green-500/5" : "border-amber-500/50 bg-amber-500/5"}>
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <UserRound className="h-5 w-5 text-primary" />
              Canonical learner condition
            </CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              {dashboard.learner.name} · {dashboard.pathway.name}
            </p>
          </div>
          <Badge variant={safetyBlocked ? "destructive" : safetyClear ? "success" : "warning"} className="w-fit gap-1.5 px-3 py-1 font-mono">
            {safetyClear ? <ShieldCheck className="h-3.5 w-3.5" /> : <ShieldAlert className="h-3.5 w-3.5" />}
            SAFETY {safetyState}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <ConditionMetric label="Readiness" value={`${readiness.score}/100`} detail={readiness.status}>
            <Progress value={readiness.score} className="mt-2 h-1.5" />
          </ConditionMetric>
          <ConditionMetric label="Current gate" value={readiness.currentGate.code} detail={readiness.currentGate.name} />
          <ConditionMetric
            label="Evidence"
            value={`${dashboard.evidenceCounts.valid}/${dashboard.evidenceCounts.total} valid`}
            detail={`${dashboard.evidenceCounts.underReview} under review · ${dashboard.evidenceCounts.needsRevision} revision`}
          />
          <ConditionMetric label="Assessment" value={assessmentStatus} detail={`${assessmentBlockers.length} assessment blocker${assessmentBlockers.length === 1 ? "" : "s"}`} />
          <ConditionMetric label="Action owner" value={owner} detail={readiness.blockers.length ? "Resolve current blockers" : "Maintain progression"} />
        </div>

        <div className="grid gap-3 lg:grid-cols-[1fr_1.4fr]">
          <div className={`rounded-md border p-3 ${safetyBlocked ? "border-destructive/40 bg-destructive/10" : safetyClear ? "border-green-500/30 bg-green-500/5" : "border-amber-500/40 bg-amber-500/10"}`}>
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider">
              {safetyClear ? <CheckCircle2 className="h-4 w-4 text-green-500" /> : <AlertTriangle className={`h-4 w-4 ${safetyBlocked ? "text-destructive" : "text-amber-500"}`} />}
              Safety status
            </div>
            <p className={`mt-2 text-sm font-medium ${safetyBlocked ? "text-destructive" : safetyClear ? "text-green-500" : "text-amber-500"}`}>
              {safetyMessage}
            </p>
          </div>
          <div className="rounded-md border border-border bg-background/50 p-3">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider">
              <ClipboardCheck className="h-4 w-4 text-primary" />
              Gate requirement & blockers
            </div>
            <p className="mt-2 text-sm">{readiness.currentGate.requirement}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {readiness.blockers.length ? readiness.blockers.map(blocker => (
                <Badge key={blocker} variant="outline" className="border-destructive/40 text-destructive">
                  {blocker}
                </Badge>
              )) : (
                <Badge variant="success" className="gap-1"><FileCheck2 className="h-3 w-3" /> No active blockers</Badge>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ConditionMetric({ label, value, detail, children }: { label: string; value: string; detail: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-md border border-border bg-background/60 p-3">
      <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 font-mono text-sm font-bold">{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{detail}</div>
      {children}
    </div>
  );
}