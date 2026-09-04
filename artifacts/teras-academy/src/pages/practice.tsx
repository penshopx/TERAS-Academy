import { useListPracticeTasks, useCreatePracticeAttempt, getListPracticeTasksQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Activity, PlayCircle, ShieldAlert, CheckCircle2 } from "lucide-react";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";

export default function Practice() {
  const { data: tasks, isLoading, error } = useListPracticeTasks();
  const createAttempt = useCreatePracticeAttempt();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const query = new URLSearchParams(window.location.search);
  const requestedTaskId = query.get("taskId");
  const sourceActivityId = query.get("activityId");
  
  const [activeTask, setActiveTask] = useState<string | null>(requestedTaskId);
  const [reflection, setReflection] = useState("");
  const [outputSummary, setOutputSummary] = useState("");
  const [nextEvidenceHref, setNextEvidenceHref] = useState<string | null>(null);

  if (isLoading) {
    return <div className="h-full flex items-center justify-center"><Activity className="w-8 h-8 text-primary animate-pulse" /></div>;
  }

  if (error || !tasks) {
    return <div className="text-destructive">Failed to load practice tasks.</div>;
  }

  const handleSubmit = (taskId: string) => {
    if (!reflection || !outputSummary || !sourceActivityId) {
      toast({ title: "Incomplete", description: sourceActivityId ? "Please fill both reflection and output fields." : "Open practice from the completed learning activity so its causal link is preserved.", variant: "destructive" });
      return;
    }
    
    createAttempt.mutate({
      taskId,
      data: { reflection, outputSummary, sourceActivityId }
    }, {
      onSuccess: (attempt) => {
        toast({ title: "Submitted", description: "Practice attempt recorded. This is not a readiness decision." });
        setNextEvidenceHref(attempt.nextAction.href);
        setReflection("");
        setOutputSummary("");
        queryClient.invalidateQueries({ queryKey: getListPracticeTasksQueryKey() });
      },
      onError: () => {
        toast({ title: "Error", description: "Failed to submit attempt.", variant: "destructive" });
      }
    });
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Practice Workspace</h1>
        <p className="text-muted-foreground mt-1 text-sm">Execute tasks and record practical reflections</p>
      </div>

      <div className="grid gap-3 border-y border-border/50 py-4 text-sm sm:grid-cols-3">
        <div><p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Learning progress</p><p className="mt-1 font-semibold">Practice attempts are appended</p></div>
        <div><p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Learning achievement</p><p className="mt-1 font-semibold">Requires reviewed evidence</p></div>
        <div><p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Capability readiness</p><p className="mt-1 font-semibold">Controlled by existing gates</p></div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-4 lg:max-h-[calc(100vh-200px)] lg:overflow-y-auto pr-0 lg:pr-2 pb-10">
          <h2 className="text-lg font-semibold border-b border-border pb-2">Available Tasks</h2>
          {tasks.map((task) => (
            <Card 
              key={task.id} 
              className={`cursor-pointer transition-all border ${activeTask === task.id ? 'border-primary shadow-[0_0_15px_rgba(0,195,255,0.15)] bg-card/80' : 'border-border/50 hover:border-primary/50'}`}
              onClick={() => setActiveTask(task.id)}
            >
              <CardContent className="p-5">
                <div className="flex justify-between items-start mb-2">
                  <h3 className="font-semibold text-lg leading-tight">{task.title}</h3>
                  <Badge variant={task.status === "COMPLETED" ? "success" : "outline"} className="font-mono text-[10px]">
                    {task.status}
                  </Badge>
                </div>
                <div className="flex gap-4 text-xs font-mono text-muted-foreground mt-2">
                  <span>MODE: {task.mode}</span>
                  <span>DUR: {task.durationMinutes}m</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="h-full">
          {activeTask ? (() => {
            const task = tasks.find(t => t.id === activeTask)!;
            return (
              <Card className="cockpit-panel h-full flex flex-col border-primary/30 sticky top-0">
                <CardHeader className="bg-background/80 border-b border-border/50 pb-4">
                  <div className="flex items-center gap-2 mb-2 text-xs font-mono text-primary">
                    <PlayCircle className="w-4 h-4" /> ACTIVE WORKSPACE
                  </div>
                  <CardTitle className="text-2xl">{task.title}</CardTitle>
                </CardHeader>
                
                <CardContent className="p-6 flex-1 overflow-y-auto">
                  <div className="space-y-6">
                    <div>
                      <h4 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-2">Instructions</h4>
                      <p className="text-sm leading-relaxed">{task.description}</p>
                    </div>

                    {task.safetyNote && (
                      <div className="p-4 bg-destructive/10 border border-destructive/30 rounded-md flex gap-3">
                        <ShieldAlert className="w-5 h-5 text-destructive shrink-0" />
                        <div>
                          <h4 className="text-sm font-bold text-destructive mb-1">SAFETY CRITICAL</h4>
                          <p className="text-xs text-destructive/90">{task.safetyNote}</p>
                        </div>
                      </div>
                    )}

                    <div className="pt-6 border-t border-border">
                      <h4 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-4">Submission Record</h4>
                      
                      {nextEvidenceHref ? (
                        <div className="flex items-center gap-3 p-4 bg-green-500/10 text-green-500 rounded border border-green-500/20">
                          <CheckCircle2 className="w-6 h-6" />
                          <div>
                            <div className="font-bold">Attempt Recorded Successfully</div>
                            <div className="text-xs opacity-80">This attempt was appended to the active pathway. Submit linked evidence next.</div>
                            <Link href={nextEvidenceHref}>
                              <Button size="sm" className="mt-3 font-mono text-xs">CONTINUE TO EVIDENCE</Button>
                            </Link>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          <div>
                            <label className="text-xs font-mono mb-1.5 block">OUTPUT SUMMARY</label>
                            <textarea 
                              className="w-full h-24 bg-background border border-input rounded-md p-3 text-sm focus:ring-1 focus:ring-primary focus:border-primary outline-none resize-none font-mono"
                              placeholder="Describe the physical output generated..."
                              value={outputSummary}
                              onChange={(e) => setOutputSummary(e.target.value)}
                            />
                          </div>
                          <div>
                            <label className="text-xs font-mono mb-1.5 block">REFLECTION</label>
                            <textarea 
                              className="w-full h-32 bg-background border border-input rounded-md p-3 text-sm focus:ring-1 focus:ring-primary focus:border-primary outline-none resize-none font-mono"
                              placeholder="What went well? What gaps did you identify?"
                              value={reflection}
                              onChange={(e) => setReflection(e.target.value)}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
                
                {!nextEvidenceHref && (
                  <CardFooter className="p-4 bg-background/80 border-t border-border/50">
                    <Button 
                      className="w-full font-mono font-bold tracking-wider" 
                      onClick={() => handleSubmit(task.id)}
                      disabled={createAttempt.isPending}
                    >
                      {createAttempt.isPending ? "SUBMITTING..." : "COMMIT ATTEMPT RECORD"}
                    </Button>
                  </CardFooter>
                )}
              </Card>
            );
          })() : (
            <div className="h-full border border-dashed border-border rounded-lg flex flex-col items-center justify-center text-muted-foreground p-8 text-center bg-card/20">
              <Activity className="w-12 h-12 mb-4 opacity-20" />
              <p className="font-mono text-sm">SELECT A TASK TO INITIALIZE WORKSPACE</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
