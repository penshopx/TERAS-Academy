import { useGetModule } from "@workspace/api-client-react";
import { useParams, Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Activity, BookOpen, Target, FileSignature, ChevronRight, CheckCircle2 } from "lucide-react";

export default function ModuleDetail() {
  const { moduleId } = useParams();
  const { data: moduleDetail, isLoading, error } = useGetModule(moduleId || "");

  if (!moduleId) return null;

  if (isLoading) {
    return <div className="h-full flex items-center justify-center"><Activity className="w-8 h-8 text-primary animate-pulse" /></div>;
  }

  if (error || !moduleDetail) {
    return <div className="text-destructive">Failed to load module details.</div>;
  }

  const { module, learningOutcomes, theory, practiceTasks, assessment, evidenceRequirement } = moduleDetail;

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2 font-mono">
        <Link href="/learning-plan" className="hover:text-primary transition-colors">LEARNING PLAN</Link>
        <ChevronRight className="w-4 h-4" />
        <span className="text-foreground">{module.code}</span>
      </div>

      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-3xl font-bold tracking-tight">{module.name}</h1>
            <Badge variant={module.status === "ACTIVE" ? "default" : "outline"}>{module.status}</Badge>
          </div>
          <p className="text-muted-foreground font-mono text-sm uppercase tracking-wider">{module.capability}</p>
        </div>
        
        <div className="w-full md:w-64 p-4 border border-border rounded-lg bg-card/50">
          <div className="flex justify-between text-xs font-mono mb-2">
            <span className="text-muted-foreground">MODULE PROGRESS</span>
            <span className="text-primary font-bold">{module.progress}%</span>
          </div>
          <Progress value={module.progress} className="h-2" />
        </div>
      </div>

      <Tabs defaultValue="theory" className="w-full">
        <TabsList className="grid w-full grid-cols-2 md:grid-cols-4 gap-1 h-auto bg-background border border-border rounded-lg p-1">
          <TabsTrigger value="theory" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary rounded-md py-2.5">
            <BookOpen className="w-4 h-4 mr-2" /> Theory
          </TabsTrigger>
          <TabsTrigger value="practice" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary rounded-md py-2.5">
            <Target className="w-4 h-4 mr-2" /> Practice
          </TabsTrigger>
          <TabsTrigger value="evidence" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary rounded-md py-2.5">
            <FileSignature className="w-4 h-4 mr-2" /> Evidence
          </TabsTrigger>
          <TabsTrigger value="assessment" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary rounded-md py-2.5">
            <CheckCircle2 className="w-4 h-4 mr-2" /> Assessment
          </TabsTrigger>
        </TabsList>

        <div className="mt-6 border border-border rounded-lg bg-card p-6 shadow-sm min-h-[400px]">
          <TabsContent value="theory" className="space-y-6 m-0 focus-visible:outline-none">
            <div>
              <h3 className="text-xl font-semibold mb-4">Learning Outcomes</h3>
              <ul className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {learningOutcomes.map((outcome, i) => (
                  <li key={i} className="flex items-start gap-2 bg-background/50 p-3 rounded border border-border/50">
                    <CheckCircle2 className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                    <span className="text-sm">{outcome}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="text-xl font-semibold mb-4 border-t border-border pt-6">Theory Content</h3>
              <div className="prose prose-sm dark:prose-invert max-w-none space-y-4">
                {theory.map((paragraph, i) => (
                  <p key={i} className="text-muted-foreground leading-relaxed">{paragraph}</p>
                ))}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="practice" className="m-0 focus-visible:outline-none">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-semibold">Practice Tasks</h3>
              <Link href="/practice">
                <Button variant="outline" size="sm" className="font-mono text-xs">GO TO WORKSPACE</Button>
              </Link>
            </div>
            
            <div className="grid grid-cols-1 gap-4">
              {practiceTasks.map((task) => (
                <div key={task.id} className="border border-border rounded-lg p-4 bg-background/50 hover:border-primary/50 transition-colors">
                  <div className="flex justify-between items-start mb-2">
                    <h4 className="font-semibold text-lg">{task.title}</h4>
                    <Badge variant={task.status === "COMPLETED" ? "success" : "secondary"} className="font-mono text-[10px]">
                      {task.status}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground mb-4">{task.description}</p>
                  <div className="flex items-center gap-4 text-xs font-mono text-muted-foreground">
                    <span>MODE: {task.mode}</span>
                    <span>DURATION: {task.durationMinutes}M</span>
                  </div>
                  {task.safetyNote && (
                    <div className="mt-4 p-2 bg-destructive/10 border border-destructive/20 text-destructive text-xs rounded">
                      <strong>SAFETY CRITICAL:</strong> {task.safetyNote}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="evidence" className="m-0 focus-visible:outline-none">
            <h3 className="text-xl font-semibold mb-6">Evidence Requirements</h3>
            <div className="bg-background/80 border border-border p-6 rounded-lg space-y-4">
              <div className="flex items-center gap-3">
                <Badge variant="outline" className="font-mono">{evidenceRequirement.code}</Badge>
                <h4 className="font-semibold text-lg">{evidenceRequirement.name}</h4>
              </div>
              <p className="text-muted-foreground">{evidenceRequirement.description}</p>
              
              <div className="pt-4 border-t border-border">
                <h5 className="text-sm font-semibold mb-2 uppercase text-muted-foreground tracking-wider">Allowed Formats</h5>
                <div className="flex gap-2 flex-wrap">
                  {evidenceRequirement.allowedTypes.map((type) => (
                    <Badge key={type} variant="secondary">{type}</Badge>
                  ))}
                </div>
              </div>
              
              <div className="pt-4">
                <Link href="/evidence/new">
                  <Button className="w-full md:w-auto font-mono text-xs">SUBMIT EVIDENCE</Button>
                </Link>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="assessment" className="m-0 focus-visible:outline-none">
            <h3 className="text-xl font-semibold mb-6">Formal Assessment</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="border border-border p-6 rounded-lg bg-background/50 text-center">
                <h4 className="text-sm font-mono text-muted-foreground mb-2">CURRENT SCORE</h4>
                <div className="text-5xl font-bold font-mono text-primary mb-2">{assessment.score}%</div>
                <Badge variant={assessment.status === "PASSED" ? "success" : "outline"}>{assessment.status}</Badge>
              </div>
              
              <div className="space-y-4 border border-border p-6 rounded-lg bg-background/50">
                <h4 className="font-semibold border-b border-border pb-2">Assessment Details</h4>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Attempts Used:</span>
                  <span className="font-mono">{assessment.attemptCount}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Critical Failure:</span>
                  <span className="font-mono text-destructive">{assessment.criticalFailure ? "YES" : "NO"}</span>
                </div>
                
                <Link href={`/assessments/${assessment.id}`} className="block pt-2">
                  <Button variant="outline" className="w-full font-mono text-xs">VIEW FULL RUBRIC</Button>
                </Link>
              </div>
            </div>
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
