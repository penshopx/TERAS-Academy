import { getGetCapabilityPassportQueryKey, getGetLearnerDashboardQueryKey, getGetLearnerReadinessQueryKey, getGetTrainerDashboardQueryKey, getGetTrainerReviewQueueQueryKey, getListEvidenceQueryKey, useGetTrainerDashboard, useReviewEvidenceByTrainer, useReviewPracticeAttempt } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Activity, Users, AlertCircle, FileText, ArrowRight } from "lucide-react";
import { type ElementType, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

type QueueItem = { id: string; kind: string; title: string; moduleName: string };

export default function TrainerDesk() {
  const { data: dashboard, isLoading, error } = useGetTrainerDashboard();
  const evidenceReview = useReviewEvidenceByTrainer();
  const practiceReview = useReviewPracticeAttempt();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [selected, setSelected] = useState<QueueItem | null>(null);
  const [status, setStatus] = useState("Valid");
  const [comment, setComment] = useState("");
  const [quality, setQuality] = useState({ valid: true, relevant: true, sufficient: true, traceable: true });
  const pending = evidenceReview.isPending || practiceReview.isPending;
  const metrics: { label: string; value: number; Icon: ElementType; color: string }[] = [
    { label: "Assigned", value: dashboard?.assignedLearnerCount ?? 0, Icon: Users, color: "" },
    { label: "Feedback Queue", value: dashboard?.pendingFeedbackCount ?? 0, Icon: FileText, color: "text-primary" },
    { label: "Evidence", value: dashboard?.pendingEvidenceCount ?? 0, Icon: FileText, color: "" },
    { label: "Blocked", value: dashboard?.blockedLearnerCount ?? 0, Icon: AlertCircle, color: "text-destructive" },
  ];

  const openReview = (item: QueueItem) => {
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
    const done = () => { toast({ title: "Review recorded", description: "The latest review is now visible in the workspace." }); setSelected(null); refresh(); };
    const failed = () => toast({ title: "Review failed", description: "The review could not be recorded. Please try again.", variant: "destructive" });
    if (selected.kind === "Practice") {
      practiceReview.mutate({ attemptId: selected.id, data: { status: status as "Reviewed" | "Needs revision", feedback: comment } }, { onSuccess: done, onError: failed });
    } else {
      evidenceReview.mutate({ evidenceId: selected.id, data: { status: status as "Valid" | "Needs revision", comment, quality } }, { onSuccess: done, onError: failed });
    }
  };

  if (isLoading) return <div className="h-full flex items-center justify-center"><Activity className="w-8 h-8 text-primary animate-pulse" /></div>;
  if (error || !dashboard) return <div className="text-destructive">Failed to load trainer dashboard.</div>;

  return <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
    <div><h1 className="text-3xl font-bold tracking-tight">Trainer Command Center</h1><p className="text-muted-foreground mt-1 text-sm font-mono uppercase">ID: {dashboard.trainer.id} | {dashboard.trainer.name}</p></div>
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {metrics.map(({ label, value, Icon, color }) => <Card key={label} className={label === "Blocked" ? "border-destructive/50 bg-destructive/5" : "border-border bg-card"}><CardContent className="p-6"><div className="flex items-center justify-between pb-2"><p className="text-sm font-medium uppercase tracking-wider text-muted-foreground">{label}</p><Icon className={`h-4 w-4 ${color || "text-muted-foreground"}`} /></div><div className={`text-3xl font-bold font-mono ${color}`}>{value}</div></CardContent></Card>)}
    </div>
    <Card className="cockpit-panel mt-6"><CardHeader><CardTitle>Action Queue</CardTitle></CardHeader><CardContent className="p-0"><Table><TableHeader className="bg-background/50"><TableRow><TableHead>Priority</TableHead><TableHead>Learner</TableHead><TableHead>Type</TableHead><TableHead>Subject</TableHead><TableHead className="text-right">Action</TableHead></TableRow></TableHeader><TableBody>
      {dashboard.recentActivity.map(item => <TableRow key={item.id}><TableCell><Badge variant={item.priority === "High" || item.priority === "Critical" ? "destructive" : "secondary"} className="font-mono text-[10px]">{item.priority}</Badge></TableCell><TableCell className="font-medium">{item.learnerName}</TableCell><TableCell><Badge variant="outline" className="font-mono text-[10px] uppercase bg-background">{item.kind}</Badge></TableCell><TableCell><div className="text-sm">{item.title}</div><div className="text-xs text-muted-foreground font-mono">{item.pathwayName} · {item.moduleName}</div></TableCell><TableCell className="text-right"><Button size="sm" variant="ghost" className="font-mono text-xs text-primary" onClick={() => openReview(item)}>REVIEW <ArrowRight className="w-3 h-3 ml-1" /></Button></TableCell></TableRow>)}
    </TableBody></Table></CardContent></Card>
    <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}><DialogContent><DialogHeader><DialogTitle>Review {selected?.kind}</DialogTitle><DialogDescription>{selected?.title} · {selected?.moduleName}</DialogDescription></DialogHeader>
      <div className="space-y-4"><div><label className="text-xs font-mono">OUTCOME</label><Select value={status} onValueChange={setStatus}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{selected?.kind === "Practice" ? <><SelectItem value="Reviewed">Reviewed</SelectItem><SelectItem value="Needs revision">Needs revision</SelectItem></> : <><SelectItem value="Valid">Valid</SelectItem><SelectItem value="Needs revision">Needs revision</SelectItem></>}</SelectContent></Select></div>
      {selected?.kind !== "Practice" && <div className="grid grid-cols-2 gap-2 text-sm">{Object.entries(quality).map(([key, checked]) => <label key={key} className="flex items-center gap-2 capitalize"><input type="checkbox" checked={checked} onChange={e => setQuality(current => ({ ...current, [key]: e.target.checked }))} />{key}</label>)}</div>}
      <div><label className="text-xs font-mono">{selected?.kind === "Practice" ? "FEEDBACK" : "REVIEW COMMENT"}</label><Textarea value={comment} onChange={e => setComment(e.target.value)} placeholder="Record actionable feedback…" /></div></div>
      <DialogFooter><Button onClick={submit} disabled={pending}>{pending ? "RECORDING..." : "RECORD REVIEW"}</Button></DialogFooter>
    </DialogContent></Dialog>
  </div>;
}