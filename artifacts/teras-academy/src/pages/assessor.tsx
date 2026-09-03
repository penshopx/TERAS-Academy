import { getGetAssessmentQueryKey, getGetAssessorDashboardQueryKey, getGetAssessorQueueQueryKey, getGetCapabilityPassportQueryKey, getGetLearnerDashboardQueryKey, getGetLearnerJourneyQueryKey, getGetLearnerLearningPlanQueryKey, getGetLearnerReadinessQueryKey, getGetModuleQueryKey, getGetProgramQueryKey, getListAssessmentsQueryKey, getListGapsQueryKey, useGetAssessment, useGetAssessorDashboard, useSubmitAssessmentDecision } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Activity, BookOpen, AlertTriangle, Scale, ArrowRight, ShieldAlert, LockKeyhole, FileCheck2, History } from "lucide-react";
import { type ElementType, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { LearnerCondition } from "@/components/learner-condition";
import { DecisionSummary, getOfficialDecision, hasCriticalFailure, prioritizeDecisionQueue } from "@/components/assessor-decision";

export default function AssessorDesk() {
  const { data: dashboard, isLoading, error } = useGetAssessorDashboard();
  const [assessmentId, setAssessmentId] = useState<string | null>(null);
  const detailQuery = useGetAssessment(assessmentId ?? "", { query: { queryKey: getGetAssessmentQueryKey(assessmentId ?? ""), enabled: !!assessmentId } });
  const decisionMutation = useSubmitAssessmentDecision();
  const queryClient = useQueryClient(); const { toast } = useToast();
  const [decision, setDecision] = useState<"Competent" | "Not competent">("Competent");
  const [observation, setObservation] = useState("");
  const [scores, setScores] = useState<Record<string, number>>({});
  const [observations, setObservations] = useState<Record<string, string>>({});
  const metrics: { label: string; value: number; Icon: ElementType; color: string }[] = [
    { label: "Assessments", value: dashboard?.pendingAssessmentCount ?? 0, Icon: Scale, color: "text-primary" },
    { label: "Evidence", value: dashboard?.pendingEvidenceCount ?? 0, Icon: BookOpen, color: "" },
    { label: "Reassessments", value: dashboard?.reassessmentCount ?? 0, Icon: Activity, color: "text-amber-500" },
    { label: "Blocked Gates", value: dashboard?.blockedGateCount ?? 0, Icon: AlertTriangle, color: "text-destructive" },
  ];
  const openDecision = (id: string) => { setAssessmentId(id); setDecision("Competent"); setObservation(""); setScores({}); setObservations({}); };
  const submit = () => {
    const detail = detailQuery.data;
    if (!assessmentId || !detail || !observation.trim() || detail.criteria.some(c => scores[c.id] === undefined)) { toast({ title: "Complete the rubric", description: "A decision, overall observation, and score for every criterion are required.", variant: "destructive" }); return; }
    const criticalFail = hasCriticalFailure(detail.criteria, scores);
    decisionMutation.mutate({ assessmentId, data: { decision: getOfficialDecision(decision, criticalFail), observation, criteria: detail.criteria.map(c => ({ criterionId: c.id, score: scores[c.id]!, observation: observations[c.id] || null, evidenceId: null })) } }, { onSuccess: () => { toast({ title: "Decision recorded", description: criticalFail ? "Critical criterion failure recorded. Readiness remains blocked." : "The assessment decision and readiness state have been updated." }); setAssessmentId(null); [getListAssessmentsQueryKey(), getListGapsQueryKey(), getGetLearnerDashboardQueryKey(), getGetLearnerJourneyQueryKey(), getGetLearnerLearningPlanQueryKey(), getGetLearnerReadinessQueryKey(), getGetCapabilityPassportQueryKey(), getGetAssessorDashboardQueryKey(), getGetAssessorQueueQueryKey(), getGetAssessmentQueryKey(assessmentId), getGetModuleQueryKey(detail.assessment.moduleId), getGetProgramQueryKey("solar-pv-tech")].forEach(queryKey => queryClient.invalidateQueries({ queryKey })); }, onError: () => toast({ title: "Decision failed", description: "The assessment decision could not be recorded.", variant: "destructive" }) });
  };
  if (isLoading) return <div className="h-full flex items-center justify-center"><Activity className="w-8 h-8 text-primary animate-pulse" /></div>;
  if (error || !dashboard) return <div className="text-destructive">Failed to load assessor dashboard.</div>;
  const detail = detailQuery.data;
  const criticalFailure = detail ? hasCriticalFailure(detail.criteria, scores) : false;
  const storedDecision = detail?.attempts.find(attempt => attempt.decision)?.decision ?? null;
  const queue = prioritizeDecisionQueue(dashboard.recentActivity);
  return <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
    <div><h1 className="text-3xl font-bold tracking-tight">Assessor Command Center</h1><p className="text-muted-foreground mt-1 text-sm font-mono uppercase">ID: {dashboard.assessor.id} | {dashboard.assessor.name}</p></div>
    <LearnerCondition owner="Assessor" />
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">{metrics.map(({ label, value, Icon, color }) => <Card key={label} className="border-border bg-card"><CardContent className="p-6"><div className="flex items-center justify-between pb-2"><p className="text-sm font-medium uppercase tracking-wider text-muted-foreground">{label}</p><Icon className={`h-4 w-4 ${color || "text-muted-foreground"}`} /></div><div className={`text-3xl font-bold font-mono ${color}`}>{value}</div></CardContent></Card>)}</div>
    <Card className="cockpit-panel mt-6">
      <CardHeader className="gap-3">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle>Decision Queue</CardTitle>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <ShieldAlert className="h-4 w-4 text-destructive" />
            Safety-critical and gate-blocking work is shown first
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="hidden md:block">
          <Table>
            <TableHeader className="bg-background/50">
              <TableRow>
                <TableHead>Priority</TableHead>
                <TableHead>Learner</TableHead>
                 <TableHead>Status</TableHead>
                <TableHead>Subject</TableHead>
                 <TableHead>Decision impact</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {queue.map(item => (
                <TableRow key={item.id} className={item.priority === "Critical" ? "bg-destructive/5" : ""}>
                  <TableCell><Badge variant={item.priority === "Critical" ? "destructive" : "secondary"} className="font-mono text-[10px]">{item.priority === "Critical" ? "SAFETY / GATE" : item.priority}</Badge></TableCell>
                  <TableCell className="font-medium">{item.learnerName}</TableCell>
                  <TableCell><Badge variant="outline" className="font-mono text-[10px] uppercase bg-background">{item.status}</Badge></TableCell>
                  <TableCell>
                    <div className="text-sm">{item.title}</div>
                    <div className="text-xs text-muted-foreground font-mono">{item.kind} · {item.pathwayName} · {item.moduleName}</div>
                  </TableCell>
                  <TableCell className="max-w-[220px] text-xs text-muted-foreground">{item.priority === "Critical" ? "Safety clearance and readiness gate remain blocked until resolved." : "Official result updates the learner assessment record and readiness."}</TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" className="font-mono text-xs" onClick={() => openDecision(item.id)}>
                      DECIDE <ArrowRight className="w-3 h-3 ml-1" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="md:hidden flex flex-col divide-y divide-border">
           {queue.map(item => (
             <div key={item.id} className={`p-4 space-y-3 ${item.priority === "Critical" ? "bg-destructive/5" : ""}`}>
              <div className="flex justify-between items-start gap-2">
                <div>
                  <div className="font-medium">{item.learnerName}</div>
                  <div className="text-sm font-semibold mt-1 leading-snug">{item.title}</div>
                  <div className="text-xs text-muted-foreground font-mono mt-1">{item.pathwayName} · {item.moduleName}</div>
                </div>
                 <Badge variant={item.priority === "Critical" ? "destructive" : "secondary"} className="font-mono text-[10px] shrink-0">
                   {item.priority === "Critical" ? "SAFETY / GATE" : item.priority}
                </Badge>
              </div>
               <div className="rounded border border-border bg-background/60 p-2 text-xs text-muted-foreground">
                 <span className="font-medium text-foreground">{item.status}</span> · {item.priority === "Critical" ? "Safety clearance and readiness remain blocked until resolved." : "Decision updates the official assessment record and readiness."}
               </div>
              <div className="flex items-center justify-between pt-2 border-t border-border/50">
                <Badge variant="outline" className="font-mono text-[10px] uppercase bg-background">
                  {item.kind}
                </Badge>
                <Button size="sm" className="font-mono text-xs -mr-2" onClick={() => openDecision(item.id)}>
                  DECIDE <ArrowRight className="w-3 h-3 ml-1" />
                </Button>
              </div>
            </div>
          ))}
          {queue.length === 0 && (
            <div className="text-center py-8 text-muted-foreground font-mono text-sm">
              NO PENDING DECISIONS
            </div>
          )}
        </div>
      </CardContent>
    </Card>
    <Dialog open={!!assessmentId} onOpenChange={open => !open && setAssessmentId(null)}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Assessment decision workspace</DialogTitle>
          <DialogDescription>{detail?.assessment.name ?? "Loading rubric…"} · Review context before recording an official decision.</DialogDescription>
        </DialogHeader>
        {detailQuery.isLoading ? (
          <div className="py-8 text-center text-muted-foreground">Loading rubric criteria…</div>
        ) : detail && (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-md border border-border bg-muted/30 p-3">
                <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground"><LockKeyhole className="h-4 w-4" /> READINESS IMPACT</div>
                <p className="mt-2 text-sm font-medium">{detail.assessment.gateCode ? `Controls gate ${detail.assessment.gateCode}` : "Updates assessment readiness"}</p>
              </div>
              <div className="rounded-md border border-border bg-muted/30 p-3">
                <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground"><History className="h-4 w-4" /> ATTEMPT CONTEXT</div>
                <p className="mt-2 text-sm font-medium">Attempt {detail.assessment.attemptCount + 1} · {detail.attempts.length} prior record(s)</p>
              </div>
              <div className="rounded-md border border-border bg-muted/30 p-3">
                <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground"><FileCheck2 className="h-4 w-4" /> EVIDENCE LINKS</div>
                <p className="mt-2 text-sm font-medium">{detail.criteria.filter(c => c.evidenceId).length} of {detail.criteria.length} criteria linked</p>
              </div>
            </div>
            <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
              <strong>Safety enforcement:</strong> a score of 0 or 1 on any critical criterion automatically stores Not competent and keeps readiness blocked.
            </div>
            {detail.criteria.map(c => (
              <div key={c.id} className="grid gap-2 border-b border-border pb-3">
                <div className="flex justify-between items-start text-sm font-medium">
                 <div className="pr-4">
                   <div>{c.code} — {c.label}</div>
                   <div className="mt-1 flex flex-wrap gap-2 text-xs font-normal text-muted-foreground">
                     <span>Layer: {c.layer}</span>
                     <span>Evidence: {c.evidenceId ?? "Not linked"}</span>
                   </div>
                 </div>
                  {c.critical && <Badge variant="destructive" className="shrink-0">Critical</Badge>}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-[120px_1fr] gap-2">
                  <Select value={scores[c.id]?.toString()} onValueChange={value => setScores(current => ({ ...current, [c.id]: Number(value) }))}>
                    <SelectTrigger>
                      <SelectValue placeholder="Score 0–3" />
                    </SelectTrigger>
                    <SelectContent>
                      {[0, 1, 2, 3].map(score => (
                        <SelectItem key={score} value={String(score)}>
                          {score} — {["Not demonstrated", "Below standard", "Meets standard", "Exceeds standard"][score]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Textarea value={observations[c.id] ?? ""} onChange={e => setObservations(current => ({ ...current, [c.id]: e.target.value }))} placeholder="Criterion observation (optional)" className="min-h-9" />
                </div>
              </div>
            ))}
            <div>
              <label className="text-xs font-mono">OVERALL OBSERVATION</label>
              <Textarea value={observation} onChange={e => setObservation(e.target.value)} placeholder="Record the decision rationale…" />
            </div>
            <DecisionSummary
              requestedDecision={decision}
              criticalFailure={criticalFailure}
              requestedControl={
                <Select value={decision} onValueChange={value => setDecision(value as "Competent" | "Not competent")}>
                  <SelectTrigger className="mt-2"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Competent">Competent</SelectItem>
                    <SelectItem value="Not competent">Not competent</SelectItem>
                  </SelectContent>
                </Select>
              }
            />
            {storedDecision && <div className="text-xs text-muted-foreground">Latest prior stored decision: <span className="font-semibold text-foreground">{storedDecision}</span>. Recording creates the next official result.</div>}
          </div>
        )}
        <DialogFooter>
          <Button onClick={submit} disabled={!detail || decisionMutation.isPending}>{decisionMutation.isPending ? "RECORDING..." : "RECORD DECISION"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>;
}
