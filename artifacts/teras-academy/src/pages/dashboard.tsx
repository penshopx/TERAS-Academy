import { useGetLearnerDashboard } from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Activity, AlertTriangle, ArrowRight, Briefcase, FileSignature, Target, Zap } from "lucide-react";
import { Link } from "wouter";
import { cn } from "@/lib/utils";
import { LearnerCondition } from "@/components/learner-condition";

export default function Dashboard() {
  const { data: dashboard, isLoading, error } = useGetLearnerDashboard();

  if (isLoading) {
    return <div className="h-full flex items-center justify-center"><Activity className="w-8 h-8 text-primary animate-pulse" /></div>;
  }

  if (error || !dashboard) {
    return (
      <Card className="mx-auto max-w-xl border-amber-500/40" role="alert">
        <CardHeader>
          <CardTitle>Dashboard learner tidak tersedia</CardTitle>
          <CardDescription>
            Akun ini mungkin menggunakan peran admin atau belum memiliki enrollment learner aktif.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Link href="/admin">
            <Button>Buka Admin Control Room</Button>
          </Link>
          <Button variant="outline" onClick={() => window.location.reload()}>
            Coba lagi
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Status Overview</h1>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <p className="text-muted-foreground font-mono text-sm uppercase">Program: {dashboard.program.name}</p>
          <Badge variant="outline" className="font-mono">{dashboard.pathway.name}</Badge>
        </div>
      </div>

      <LearnerCondition owner="Learner" />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="cockpit-panel border-primary/20 lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex justify-between items-center">
              <span>Capability Readiness</span>
              <Badge variant={dashboard.readiness.status === "READY" ? "success" : "warning"} className="font-mono">
                {dashboard.readiness.status}
              </Badge>
            </CardTitle>
            <CardDescription>Overall progression towards next gate</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-4 mb-4">
              <span className="text-5xl font-bold font-mono tracking-tighter text-primary">{dashboard.readiness.score}</span>
              <span className="text-muted-foreground pb-1">/ 100</span>
            </div>
            <Progress value={dashboard.readiness.score} className="h-2" />
            
            <div className="mt-6 grid grid-cols-2 gap-4">
              <div className="bg-background/50 p-3 rounded border border-border">
                <div className="text-xs text-muted-foreground mb-1 uppercase tracking-wider">Current Gate</div>
                <div className="font-medium text-sm">{dashboard.readiness.currentGate.name}</div>
              </div>
              <div className="bg-background/50 p-3 rounded border border-border">
                <div className="text-xs text-muted-foreground mb-1 uppercase tracking-wider">Next Gate</div>
                <div className="font-medium text-sm">{dashboard.readiness.nextGate?.name || "None"}</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-primary/5 border-primary/20">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Zap className="w-5 h-5 text-primary" /> 
              Next Action
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <Badge variant={dashboard.nextAction.priority === "HIGH" ? "destructive" : "default"} className="mb-2">
                  {dashboard.nextAction.priority} PRIORITY
                </Badge>
                <h4 className="font-semibold text-lg">{dashboard.nextAction.title}</h4>
                <p className="text-sm text-muted-foreground mt-1">{dashboard.nextAction.description}</p>
              </div>
              <Link href={dashboard.nextAction.href} className="w-full">
                <Button className="w-full flex items-center gap-2 font-mono uppercase tracking-wider">
                  Execute Action <ArrowRight className="w-4 h-4" />
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Link href="/modules/current">
          <Card className="hover-elevate cursor-pointer transition-all border-l-4 border-l-primary group">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                <Target className="w-4 h-4" /> Current Module
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="font-bold text-lg leading-tight group-hover:text-primary transition-colors">
                {dashboard.currentLearning.name}
              </div>
              <div className="mt-4 flex items-center gap-2">
                <Progress value={dashboard.currentLearning.progress} className="h-1 flex-1" />
                <span className="text-xs font-mono">{dashboard.currentLearning.progress}%</span>
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href="/practice">
          <Card className="hover-elevate cursor-pointer transition-all border-l-4 border-l-blue-500 group">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                <Activity className="w-4 h-4" /> Active Practice
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="font-bold text-lg leading-tight group-hover:text-blue-400 transition-colors">
                {dashboard.currentPractice.title}
              </div>
              <Badge variant="outline" className="mt-3 font-mono text-[10px]">
                {dashboard.currentPractice.durationMinutes} MIN
              </Badge>
            </CardContent>
          </Card>
        </Link>

        <Link href="/evidence">
          <Card className="hover-elevate cursor-pointer transition-all border-l-4 border-l-amber-500 group">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                <Briefcase className="w-4 h-4" /> Evidence
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold font-mono group-hover:text-amber-400 transition-colors">
                  {dashboard.evidenceCounts.valid}
                </span>
                <span className="text-sm text-muted-foreground">/ {dashboard.evidenceCounts.total} valid</span>
              </div>
              <div className="mt-2 text-xs text-muted-foreground">
                {dashboard.evidenceCounts.underReview} pending review
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href="/gaps">
          <Card className={cn(
            "hover-elevate cursor-pointer transition-all border-l-4 group",
            dashboard.mainGap ? "border-l-destructive" : "border-l-green-500"
          )}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" /> Critical Gap
              </CardTitle>
            </CardHeader>
            <CardContent>
              {dashboard.mainGap ? (
                <>
                  <div className="font-bold text-sm leading-tight text-destructive">
                    {dashboard.mainGap.criterion}
                  </div>
                  <Badge variant="outline" className="mt-2 border-destructive/50 text-destructive font-mono text-[10px]">
                    {dashboard.mainGap.recommendedAction}
                  </Badge>
                </>
              ) : (
                <div className="font-bold text-lg text-green-500 flex items-center gap-2">
                  No critical gaps
                </div>
              )}
            </CardContent>
          </Card>
        </Link>
      </div>
    </div>
  );
}
