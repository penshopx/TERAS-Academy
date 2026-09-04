import { getListEvidenceQueryKey, useCreateEvidence, useListEvidence, useListPracticeTasks } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Activity, Plus, FileText, CheckCircle, Clock, XCircle } from "lucide-react";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

export default function Evidence() {
  const { data: evidenceList, isLoading, error } = useListEvidence();
  const { data: tasks } = useListPracticeTasks();
  const createEvidence = useCreateEvidence();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const query = new URLSearchParams(window.location.search);
  const sourceActivityId = query.get("activityId");
  const practiceAttemptId = query.get("practiceAttemptId");
  const requestedTaskId = query.get("taskId");
  const [showForm, setShowForm] = useState(Boolean(sourceActivityId && practiceAttemptId && requestedTaskId));
  const [taskId, setTaskId] = useState(requestedTaskId ?? "");
  const [title, setTitle] = useState("");
  const [type, setType] = useState("DOCUMENT");
  const [description, setDescription] = useState("");
  const selectedTask = tasks?.find(task => task.id === taskId);

  const handleSubmit = () => {
    if (!selectedTask || !sourceActivityId || !practiceAttemptId || !title.trim() || !description.trim()) {
      toast({ title: "Causal link required", description: "Open Evidence from a recorded practice attempt and complete all fields.", variant: "destructive" });
      return;
    }
    createEvidence.mutate({
      data: {
        moduleId: selectedTask.moduleId,
        taskId: selectedTask.id,
        sourceActivityId,
        practiceAttemptId,
        title: title.trim(),
        type,
        description: description.trim(),
        fileName: null,
      },
    }, {
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: getListEvidenceQueryKey() });
        setTitle("");
        setDescription("");
        setShowForm(false);
        toast({ title: "Evidence submitted", description: "Evidence is linked to the practice attempt and is now awaiting review. Readiness has not changed." });
      },
      onError: () => toast({ title: "Submission failed", description: "Evidence could not be linked to the active learning journey.", variant: "destructive" }),
    });
  };

  if (isLoading) {
    return <div className="h-full flex items-center justify-center"><Activity className="w-8 h-8 text-primary animate-pulse" /></div>;
  }

  if (error || !evidenceList) {
    return <div className="text-destructive">Failed to load evidence portfolio.</div>;
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'VALID': return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'REVIEW': return <Clock className="w-4 h-4 text-yellow-500" />;
      case 'REVISION': return <XCircle className="w-4 h-4 text-destructive" />;
      default: return <FileText className="w-4 h-4 text-muted-foreground" />;
    }
  };

  const getStatusVariant = (status: string) => {
    switch (status) {
      case 'VALID': return 'success';
      case 'REVIEW': return 'warning';
      case 'REVISION': return 'destructive';
      default: return 'outline';
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Evidence Portfolio</h1>
          <p className="text-muted-foreground mt-1 text-sm">Submitted artifacts mapped to capability criteria</p>
        </div>
        <Button className="font-mono text-xs" onClick={() => setShowForm(value => !value)}>
          <Plus className="w-4 h-4 mr-2" /> UPLOAD EVIDENCE
        </Button>
      </div>

      <div className="grid gap-3 border-y border-border/50 py-4 text-sm sm:grid-cols-3">
        <div><p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Learning progress</p><p className="mt-1 font-semibold">Evidence submission recorded</p></div>
        <div><p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Learning achievement</p><p className="mt-1 font-semibold">Pending authorized review</p></div>
        <div><p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Capability readiness</p><p className="mt-1 font-semibold">Evaluated separately</p></div>
      </div>

      {showForm && (
        <Card className="border-primary/30 bg-primary/5">
          <CardHeader>
            <CardTitle>Submit linked evidence</CardTitle>
            <p className="text-sm text-muted-foreground">This creates a new evidence record. It does not overwrite earlier submissions or prove readiness.</p>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-mono">PRACTICE TASK</label>
              <select className="w-full rounded-md border border-input bg-background p-3 text-sm" value={taskId} onChange={event => setTaskId(event.target.value)} disabled={Boolean(requestedTaskId)}>
                <option value="">Select linked task</option>
                {tasks?.map(task => <option key={task.id} value={task.id}>{task.title}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-mono">EVIDENCE TYPE</label>
              <select className="w-full rounded-md border border-input bg-background p-3 text-sm" value={type} onChange={event => setType(event.target.value)}>
                <option value="DOCUMENT">Document</option>
                <option value="PHOTO">Photo record</option>
                <option value="VIDEO">Video record</option>
                <option value="OBSERVATION">Observation note</option>
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="mb-1.5 block text-xs font-mono">TITLE</label>
              <input className="w-full rounded-md border border-input bg-background p-3 text-sm" value={title} onChange={event => setTitle(event.target.value)} placeholder="Name this evidence record" />
            </div>
            <div className="md:col-span-2">
              <label className="mb-1.5 block text-xs font-mono">DESCRIPTION</label>
              <textarea className="h-28 w-full resize-none rounded-md border border-input bg-background p-3 text-sm" value={description} onChange={event => setDescription(event.target.value)} placeholder="Describe what this evidence demonstrates" />
            </div>
            <div className="md:col-span-2 flex justify-end">
              <Button onClick={handleSubmit} disabled={createEvidence.isPending || !sourceActivityId || !practiceAttemptId}>
                {createEvidence.isPending ? "SUBMITTING..." : "SUBMIT FOR REVIEW"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="cockpit-panel border-border/50 overflow-hidden">
        <CardContent className="p-0">
          <div className="hidden md:block">
            <Table>
              <TableHeader className="bg-background/80">
                <TableRow>
                  <TableHead className="w-[300px]">Title & Module</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Quality Checks</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {evidenceList.map((record) => (
                  <TableRow key={record.id} className="hover:bg-muted/30">
                    <TableCell>
                      <div className="font-medium text-sm">{record.title}</div>
                      <div className="text-xs text-muted-foreground font-mono mt-1">{record.moduleName}</div>
                      {record.practiceAttemptId && <div className="mt-1 text-[10px] font-mono text-primary/80">ATTEMPT {record.practiceAttemptId}</div>}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="font-mono text-[10px]">{record.type}</Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {new Date(record.submittedAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {getStatusIcon(record.status)}
                        <Badge variant={getStatusVariant(record.status) as any} className="font-mono text-[10px] uppercase">
                          {record.status}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <div title="Valid" className={`w-2 h-2 rounded-full ${record.quality.valid ? 'bg-green-500' : 'bg-muted'}`} />
                        <div title="Relevant" className={`w-2 h-2 rounded-full ${record.quality.relevant ? 'bg-green-500' : 'bg-muted'}`} />
                        <div title="Sufficient" className={`w-2 h-2 rounded-full ${record.quality.sufficient ? 'bg-green-500' : 'bg-muted'}`} />
                        <div title="Traceable" className={`w-2 h-2 rounded-full ${record.quality.traceable ? 'bg-green-500' : 'bg-muted'}`} />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {evidenceList.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground font-mono text-sm">
                      NO EVIDENCE RECORDS FOUND
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          <div className="md:hidden flex flex-col divide-y divide-border">
            {evidenceList.map((record) => (
              <div key={record.id} className="p-4 space-y-3">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="font-medium text-sm">{record.title}</div>
                    <div className="text-xs text-muted-foreground font-mono mt-1">{record.moduleName}</div>
                    {record.practiceAttemptId && <div className="mt-1 text-[10px] font-mono text-primary/80">ATTEMPT {record.practiceAttemptId}</div>}
                  </div>
                  <Badge variant={getStatusVariant(record.status) as any} className="font-mono text-[10px] uppercase shrink-0 flex items-center gap-1">
                    {getStatusIcon(record.status)}
                    <span>{record.status}</span>
                  </Badge>
                </div>
                <div className="flex justify-between items-center mt-2">
                  <div className="flex gap-2">
                    <Badge variant="secondary" className="font-mono text-[10px]">{record.type}</Badge>
                    <span className="font-mono text-xs text-muted-foreground flex items-center">
                      {new Date(record.submittedAt).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="flex gap-1 border border-border/50 bg-background/50 rounded-full px-2 py-1">
                    <div title="Valid" className={`w-2 h-2 rounded-full ${record.quality.valid ? 'bg-green-500' : 'bg-muted'}`} />
                    <div title="Relevant" className={`w-2 h-2 rounded-full ${record.quality.relevant ? 'bg-green-500' : 'bg-muted'}`} />
                    <div title="Sufficient" className={`w-2 h-2 rounded-full ${record.quality.sufficient ? 'bg-green-500' : 'bg-muted'}`} />
                    <div title="Traceable" className={`w-2 h-2 rounded-full ${record.quality.traceable ? 'bg-green-500' : 'bg-muted'}`} />
                  </div>
                </div>
              </div>
            ))}
            {evidenceList.length === 0 && (
              <div className="text-center py-8 text-muted-foreground font-mono text-sm">
                NO EVIDENCE RECORDS FOUND
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
