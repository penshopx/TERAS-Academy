import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Activity, Users, AlertCircle, FileText, ArrowRight, ShieldAlert, History } from "lucide-react";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { trackReadinessDecisionRecorded, trackReadinessQueueOpened } from "@/lib/analytics";
import { getGetCapabilityPassportQueryKey, getGetLearnerDashboardQueryKey, getGetLearnerReadinessQueryKey, getGetTrainerDashboardQueryKey, getGetTrainerReviewQueueQueryKey, getListEvidenceQueryKey, useReviewEvidenceByTrainer, useReviewPracticeAttempt, TrainerDashboard } from "@workspace/api-client-react";

type QueueItem = { id: string; kind: string; title: string; moduleName: string; learnerName: string; pathwayName: string; priority: string; };

export function ReviewQueue({ dashboard }: { dashboard: TrainerDashboard }) {
  const evidenceReview = useReviewEvidenceByTrainer();
  const practiceReview = useReviewPracticeAttempt();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [selected, setSelected] = useState<QueueItem | null>(null);
  const [status, setStatus] = useState("Valid");
  const [comment, setComment] = useState("");
  const [quality, setQuality] = useState({ valid: true, relevant: true, sufficient: true, traceable: true });
  
  const pending = evidenceReview.isPending || practiceReview.isPending;

  const metrics = [
    { label: "Assigned", value: dashboard.assignedLearnerCount ?? 0, Icon: Users, color: "" },
    { label: "Practice feedback", value: dashboard.pendingFeedbackCount ?? 0, Icon: FileText, color: "text-primary" },
    { label: "Evidence", value: dashboard.pendingEvidenceCount ?? 0, Icon: FileText, color: "" },
    { label: "Remediation", value: dashboard.activeRemediationCount ?? 0, Icon: Activity, color: "text-amber-500" },
    { label: "Blocked", value: dashboard.blockedLearnerCount ?? 0, Icon: AlertCircle, color: "text-destructive" },
  ];

  const openReview = (item: QueueItem) => {
    trackReadinessQueueOpened({
      queueType: item.kind === "Practice" ? "trainer_practice" : "trainer_evidence",
      pathway: item.pathwayName,
      hasBlocker: item.priority === "Critical",
    });
    setSelected(item); setComment("");
    setStatus(item.kind === "Practice" ? "Reviewed" : "Valid");
    setQuality({ valid: true, relevant: true, sufficient: true, traceable: true });
  };
  
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: getGetTrainerDashboardQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetTrainerReviewQueueQueryKey() });
    queryClient.invalidateQueries({ queryKey: getListEvidenceQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetLearnerDashboardQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetLearnerReadinessQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetCapabilityPassportQueryKey() });
  };
  
  const submit = () => {
    if (!selected || !comment.trim()) {
      toast({ title: "Feedback required", description: "Record a review comment before submitting.", variant: "destructive" });
      return;
    }
    const done = () => {
      trackReadinessDecisionRecorded({
        queueType: selected.kind === "Practice" ? "trainer_practice" : "trainer_evidence",
        pathway: selected.pathwayName,
        hasBlocker: status === "Needs revision",
        outcome: status === "Needs revision" ? "needs_revision" : selected.kind === "Practice" ? "reviewed" : "valid",
      });
      toast({ title: "Review recorded", description: "The latest review is now visible in the workspace." });
      setSelected(null); refresh();
    };
    const failed = () => toast({ title: "Review failed", description: "The review could not be recorded. Please try again.", variant: "destructive" });
    if (selected.kind === "Practice") {
      practiceReview.mutate({ attemptId: selected.id, data: { status: status as "Reviewed" | "Needs revision", feedback: comment } }, { onSuccess: done, onError: failed });
    } else {
      evidenceReview.mutate({ evidenceId: selected.id, data: { status: status as "Valid" | "Needs revision", comment, quality } }, { onSuccess: done, onError: failed });
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div><h1 className="text-3xl font-bold tracking-tight">Trainer Command Center</h1><p className="text-muted-foreground mt-1 text-sm font-mono uppercase">ID: {dashboard.trainer.id} | {dashboard.trainer.name}</p></div>
      <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-4 text-sm" data-testid="trainer-non-certification-notice">
        <div className="flex items-center gap-2 font-semibold"><ShieldAlert className="h-4 w-4 text-amber-600" />Trainer review is not certification</div>
        <p className="mt-1 text-muted-foreground">Practice feedback and evidence verification inform remediation and readiness. They do not issue certification, clearance, or a final readiness decision.</p>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {metrics.map(({ label, value, Icon, color }) => <Card key={label} className={label === "Blocked" ? "border-destructive/50 bg-destructive/5" : "border-border bg-card"}><CardContent className="p-6"><div className="flex items-center justify-between pb-2"><p className="text-sm font-medium uppercase tracking-wider text-muted-foreground">{label}</p><Icon className={`h-4 w-4 ${color || "text-muted-foreground"}`} /></div><div className={`text-3xl font-bold font-mono ${color}`}>{value}</div></CardContent></Card>)}
      </div>
      <Card className="cockpit-panel mt-6">
        <CardHeader><CardTitle data-testid="trainer-role-queue-title">Trainer review queue</CardTitle><p className="text-sm text-muted-foreground">Review submitted practice for feedback and evidence for verification. Remediation and readiness counts are handoff context only; this contract does not expose actions for them here.</p></CardHeader>
        <CardContent className="p-0">
          <div className="hidden md:block">
            <Table>
              <TableHeader className="bg-background/50">
                <TableRow>
                  <TableHead>Priority</TableHead>
                  <TableHead>Learner</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dashboard.recentActivity.map(item => (
                  <TableRow key={item.id}>
                    <TableCell><Badge variant={item.priority === "High" || item.priority === "Critical" ? "destructive" : "secondary"} className="font-mono text-[10px]">{item.priority}</Badge></TableCell>
                    <TableCell className="font-medium">{item.learnerName}</TableCell>
                    <TableCell><Badge variant="outline" className="font-mono text-[10px] uppercase bg-background">{item.kind}</Badge></TableCell>
                    <TableCell>
                      <div className="text-sm">{item.title}</div>
                      <div className="text-xs text-muted-foreground font-mono">{item.pathwayName} · {item.moduleName}</div>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="ghost" className="font-mono text-xs text-primary" data-testid={`button-review-${item.id}`} onClick={() => openReview(item)}>
                        REVIEW <ArrowRight className="w-3 h-3 ml-1" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="md:hidden flex flex-col divide-y divide-border">
            {dashboard.recentActivity.map(item => (
              <div key={item.id} className="p-4 space-y-3">
                <div className="flex justify-between items-start gap-2">
                  <div>
                    <div className="font-medium">{item.learnerName}</div>
                    <div className="text-sm font-semibold mt-1 leading-snug">{item.title}</div>
                    <div className="text-xs text-muted-foreground font-mono mt-1">{item.pathwayName} · {item.moduleName}</div>
                  </div>
                  <Badge variant={item.priority === "High" || item.priority === "Critical" ? "destructive" : "secondary"} className="font-mono text-[10px] shrink-0">
                    {item.priority}
                  </Badge>
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-border/50">
                  <Badge variant="outline" className="font-mono text-[10px] uppercase bg-background">
                    {item.kind}
                  </Badge>
                  <Button size="sm" variant="ghost" className="font-mono text-xs text-primary -mr-2" data-testid={`button-review-mobile-${item.id}`} onClick={() => openReview(item)}>
                    REVIEW <ArrowRight className="w-3 h-3 ml-1" />
                  </Button>
                </div>
              </div>
            ))}
            {dashboard.recentActivity.length === 0 && (
              <div className="text-center py-8 text-muted-foreground font-mono text-sm">
                NO PENDING REVIEWS
              </div>
            )}
          </div>
        </CardContent>
      </Card>
      <Card data-testid="trainer-mutation-history">
        <CardHeader><CardTitle className="flex items-center gap-2 text-base"><History className="h-4 w-4" />Recorded review history</CardTitle><p className="text-sm text-muted-foreground">Server-backed, append-only reviews for your assigned learner scope. Newest records appear first.</p></CardHeader>
        <CardContent>
          {dashboard.reviewHistory.length ? <ul className="space-y-3">{dashboard.reviewHistory.map(entry => (
            <li key={entry.id} className="rounded-md border border-border p-3 text-sm" data-testid={`text-review-history-${entry.id}`}>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="font-mono text-[10px] uppercase">{entry.kind}</Badge>
                <strong>{entry.outcome}</strong>
                <span className="text-muted-foreground">· {entry.learnerName} · {entry.pathwayName}</span>
              </div>
              <p className="mt-2 font-medium">{entry.subject}</p>
              <p className="mt-1 text-muted-foreground">{entry.comment}</p>
              {entry.quality && <div className="mt-2 flex flex-wrap gap-2 text-xs" data-testid={`text-review-quality-${entry.id}`}>
                {Object.entries(entry.quality).map(([dimension, passed]) => <Badge key={dimension} variant={passed ? "secondary" : "destructive"} className="capitalize">{dimension}: {passed ? "pass" : "fail"}</Badge>)}
              </div>}
              <p className="mt-2 text-xs text-muted-foreground">Reviewer: {entry.reviewer ?? "Not recorded"} · {new Date(entry.recordedAt).toLocaleString()}</p>
            </li>
          ))}</ul> : <p className="text-sm text-muted-foreground">No recorded reviews are available for your assigned learner scope.</p>}
        </CardContent>
      </Card>
      
      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Review {selected?.kind}</DialogTitle>
            <DialogDescription>{selected?.title} · {selected?.moduleName}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-xs font-mono">OUTCOME</label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger data-testid="select-trainer-review-outcome"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {selected?.kind === "Practice" ? (
                    <><SelectItem value="Reviewed">Reviewed</SelectItem><SelectItem value="Needs revision">Needs revision</SelectItem></>
                  ) : (
                    <><SelectItem value="Valid">Valid</SelectItem><SelectItem value="Needs revision">Needs revision</SelectItem></>
                  )}
                </SelectContent>
              </Select>
            </div>
            {selected?.kind !== "Practice" && (
              <div className="grid grid-cols-2 gap-2 text-sm">
                {Object.entries(quality).map(([key, checked]) => (
                  <label key={key} className="flex items-center gap-2 capitalize">
                    <input type="checkbox" checked={checked} data-testid={`checkbox-evidence-quality-${key}`} onChange={e => setQuality(current => ({ ...current, [key]: e.target.checked }))} />
                    {key}
                  </label>
                ))}
              </div>
            )}
            <div>
              <label className="text-xs font-mono">{selected?.kind === "Practice" ? "FEEDBACK" : "REVIEW COMMENT"}</label>
              <Textarea value={comment} data-testid="input-trainer-review-comment" onChange={e => setComment(e.target.value)} placeholder="Record actionable feedback…" />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={submit} disabled={pending} data-testid="button-record-trainer-review">{pending ? "RECORDING..." : "RECORD REVIEW"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
