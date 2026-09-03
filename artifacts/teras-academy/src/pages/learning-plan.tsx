import { useGetLearnerLearningPlan } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Activity, PlayCircle, Clock, Target } from "lucide-react";
import { Link } from "wouter";

export default function LearningPlan() {
  const { data: plan, isLoading, error } = useGetLearnerLearningPlan();

  if (isLoading) {
    return <div className="h-full flex items-center justify-center"><Activity className="w-8 h-8 text-primary animate-pulse" /></div>;
  }

  if (error || !plan) {
    return <div className="text-destructive">Failed to load learning plan.</div>;
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Personalized Plan</h1>
        <p className="text-muted-foreground mt-1 text-sm">Sequence generated based on identified gaps</p>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {plan.map((item) => (
          <Card key={item.id} className="border-border/50 hover:border-primary/30 transition-colors">
            <CardContent className="p-6 flex flex-col md:flex-row gap-6 items-start md:items-center">
              <div className="flex-1 space-y-3">
                <div className="flex items-center gap-3">
                  <Badge variant="outline" className="font-mono bg-muted/50">{item.module.code}</Badge>
                  <h3 className="font-bold text-xl">{item.module.name}</h3>
                  <Badge variant={item.priority === "HIGH" ? "destructive" : "secondary"} className="uppercase text-[10px]">
                    {item.priority} PRIORITY
                  </Badge>
                </div>
                
                <p className="text-sm text-muted-foreground border-l-2 border-muted pl-3">
                  <span className="font-medium text-foreground">Focus Reason:</span> {item.reason}
                </p>
                
                <div className="flex items-center gap-4 text-xs font-mono text-muted-foreground">
                  <span className="flex items-center gap-1"><Target className="w-3 h-3" /> {item.module.capability}</span>
                  <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {item.estimatedMinutes} MIN</span>
                </div>
              </div>

              <div className="w-full md:w-64 space-y-4">
                <div className="space-y-1">
                  <div className="flex justify-between text-xs font-mono">
                    <span>PROGRESS</span>
                    <span className="text-primary">{item.module.progress}%</span>
                  </div>
                  <Progress value={item.module.progress} className="h-1.5" />
                </div>
                
                <Link href={`/modules/${item.module.id}`} className="block">
                  <Button className="w-full font-mono uppercase tracking-wider text-xs" variant={item.status === "ACTIVE" ? "default" : "secondary"}>
                    {item.status === "ACTIVE" ? (
                      <><PlayCircle className="w-4 h-4 mr-2" /> Resume</>
                    ) : (
                      "Start Module"
                    )}
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
