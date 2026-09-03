import { useGetLearnerReadiness } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Activity, Lock, Unlock, CheckCircle2, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { LearnerCondition } from "@/components/learner-condition";

export default function Readiness() {
  const { data: readiness, isLoading, error } = useGetLearnerReadiness();

  if (isLoading) {
    return <div className="h-full flex items-center justify-center"><Activity className="w-8 h-8 text-primary animate-pulse" /></div>;
  }

  if (error || !readiness) {
    return <div className="text-destructive">Failed to load readiness status.</div>;
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Gate Readiness</h1>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <p className="text-muted-foreground text-sm">Progression control mechanisms and clearances</p>
          <Badge variant="outline" className="font-mono">{readiness.pathway.name}</Badge>
        </div>
      </div>

      <LearnerCondition owner="Learner" />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 cockpit-panel border-primary/30">
          <CardContent className="p-8">
            <div className="flex flex-col md:flex-row gap-8 items-center">
              <div className="w-48 h-48 rounded-full border-4 border-muted flex items-center justify-center relative bg-background/50">
                <svg className="absolute inset-0 w-full h-full -rotate-90">
                  <circle cx="92" cy="92" r="88" fill="none" stroke="currentColor" strokeWidth="8" className="text-muted opacity-20" />
                  <circle 
                    cx="92" cy="92" r="88" fill="none" stroke="currentColor" strokeWidth="8" 
                    className="text-primary"
                    strokeDasharray={2 * Math.PI * 88}
                    strokeDashoffset={2 * Math.PI * 88 * (1 - readiness.score / 100)}
                  />
                </svg>
                <div className="text-center">
                  <div className="text-5xl font-bold font-mono text-primary">{readiness.score}</div>
                  <div className="text-xs uppercase tracking-widest text-muted-foreground mt-1">READINESS</div>
                </div>
              </div>
              
              <div className="flex-1 space-y-6 w-full">
                <div>
                  <h3 className="text-lg font-semibold mb-2">Current Status</h3>
                  <Badge variant={readiness.status === "READY" ? "success" : "warning"} className="text-sm px-3 py-1 font-mono uppercase">
                    {readiness.status}
                  </Badge>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-3 bg-destructive/10 border border-destructive/20 rounded">
                    <div className="text-2xl font-bold font-mono text-destructive">{readiness.outstandingGapCount}</div>
                    <div className="text-xs text-muted-foreground uppercase">Outstanding Gaps</div>
                  </div>
                  <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded">
                    <div className="text-2xl font-bold font-mono text-amber-500">{readiness.missingEvidenceCount}</div>
                    <div className="text-xs text-muted-foreground uppercase">Missing Evidence</div>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-destructive" /> Active Blockers
            </CardTitle>
          </CardHeader>
          <CardContent>
            {readiness.blockers.length > 0 ? (
              <ul className="space-y-3">
                {readiness.blockers.map((blocker, i) => (
                  <li key={i} className="text-sm border-l-2 border-destructive pl-3 text-muted-foreground">
                    {blocker}
                  </li>
                ))}
              </ul>
            ) : (
              <div className="text-sm text-green-500 flex items-center gap-2 font-mono">
                <CheckCircle2 className="w-4 h-4" /> NO BLOCKERS
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <h2 className="text-xl font-bold mt-8 mb-4">Gate Sequence</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {readiness.gates.map((gate, idx) => {
          const isPassed = gate.status === "PASSED";
          const isCurrent = gate.status === "ACTIVE";
          
          return (
            <Card key={gate.id} className={cn(
              "relative overflow-hidden transition-all",
              isCurrent ? "border-primary shadow-[0_0_15px_rgba(0,195,255,0.15)] scale-105 z-10" : "border-border/50 opacity-80"
            )}>
              {isPassed && <div className="absolute inset-0 bg-green-500/5 z-0" />}
              <CardContent className="p-5 relative z-10">
                <div className="flex justify-between items-start mb-3">
                  <Badge variant="outline" className="font-mono text-[10px]">{gate.code}</Badge>
                  {isPassed ? <Unlock className="w-4 h-4 text-green-500" /> : <Lock className="w-4 h-4 text-muted-foreground" />}
                </div>
                <h4 className="font-bold text-lg mb-1 leading-tight">{gate.name}</h4>
                <div className="text-xs text-muted-foreground mb-4 h-8">{gate.requirement}</div>
                <Badge variant={isPassed ? "success" : isCurrent ? "default" : "secondary"} className="font-mono text-[10px] w-full justify-center">
                  {gate.status}
                </Badge>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
