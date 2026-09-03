import { useGetLearnerJourney } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Activity, CheckCircle2, Circle, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

export default function Journey() {
  const { data: journey, isLoading, error } = useGetLearnerJourney();

  if (isLoading) {
    return <div className="h-full flex items-center justify-center"><Activity className="w-8 h-8 text-primary animate-pulse" /></div>;
  }

  if (error || !journey) {
    return <div className="text-destructive">Failed to load journey.</div>;
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto w-full animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Capability Timeline</h1>
        <p className="text-muted-foreground mt-1 text-sm">Diagnostic-to-readiness progression path</p>
      </div>

      <Card className="border-border/50 bg-card/50 backdrop-blur">
        <CardContent className="p-8">
          <div className="relative border-l-2 border-muted pl-8 space-y-10 py-4">
            {journey.map((step, index) => {
              const isCompleted = step.status === "COMPLETED";
              const isActive = step.status === "ACTIVE";
              const isPending = step.status === "PENDING";

              return (
                <div key={step.id} className="relative">
                  <div className={cn(
                    "absolute -left-[41px] top-1 rounded-full bg-background p-1",
                    isCompleted ? "text-primary" : 
                    isActive ? "text-primary shadow-[0_0_10px_rgba(0,195,255,0.5)]" : 
                    "text-muted-foreground"
                  )}>
                    {isCompleted ? <CheckCircle2 className="w-5 h-5" /> : 
                     isActive ? <Circle className="w-5 h-5 fill-primary" /> :
                     <Circle className="w-5 h-5" />}
                  </div>
                  
                  <div className={cn(
                    "transition-all duration-300",
                    isActive ? "opacity-100 scale-100" : "opacity-70 scale-[0.98]"
                  )}>
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className={cn(
                        "font-semibold text-lg",
                        isActive && "text-primary",
                        isPending && "text-muted-foreground"
                      )}>{step.label}</h3>
                      <Badge variant={isCompleted ? "success" : isActive ? "default" : "outline"} className="font-mono text-[10px] uppercase">
                        {step.status}
                      </Badge>
                      {step.date && (
                        <div className="text-xs text-muted-foreground flex items-center gap-1 font-mono">
                          <Clock className="w-3 h-3" /> {step.date}
                        </div>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground max-w-2xl">{step.description}</p>
                    
                    {isActive && step.href && (
                      <div className="mt-4">
                        <a href={step.href} className="text-sm font-medium text-primary hover:underline underline-offset-4 flex items-center gap-1">
                          Continue Phase &rarr;
                        </a>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
