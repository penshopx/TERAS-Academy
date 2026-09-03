import { useListAssessments } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Activity, ShieldAlert, ArrowRight } from "lucide-react";
import { Link } from "wouter";

export default function Assessments() {
  const { data: assessments, isLoading, error } = useListAssessments();

  if (isLoading) {
    return <div className="h-full flex items-center justify-center"><Activity className="w-8 h-8 text-primary animate-pulse" /></div>;
  }

  if (error || !assessments) {
    return <div className="text-destructive">Failed to load assessments.</div>;
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Assessment History</h1>
        <p className="text-muted-foreground mt-1 text-sm">Formal capability evaluations against standard rubrics</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {assessments.map((assessment) => (
          <Card key={assessment.id} className="hover-elevate transition-all border-border/50">
            <CardHeader className="pb-2 flex flex-row items-start justify-between space-y-0">
              <div className="space-y-1">
                <CardTitle className="text-xl">{assessment.name}</CardTitle>
                <div className="text-xs text-muted-foreground font-mono">MODULE ID: {assessment.moduleId}</div>
              </div>
              <Badge variant={assessment.status === "PASSED" ? "success" : assessment.status === "FAILED" ? "destructive" : "outline"}>
                {assessment.status}
              </Badge>
            </CardHeader>
            <CardContent>
              <div className="flex justify-between items-end mt-4">
                <div>
                  <div className="text-4xl font-bold font-mono text-primary">{assessment.score}<span className="text-xl text-muted-foreground">/100</span></div>
                  <div className="text-xs text-muted-foreground mt-1">ATTEMPTS: {assessment.attemptCount}</div>
                </div>
                <Link href={`/assessments/${assessment.id}`}>
                  <Button variant="outline" size="sm" className="font-mono text-xs gap-1">
                    VIEW RUBRIC <ArrowRight className="w-3 h-3" />
                  </Button>
                </Link>
              </div>
              
              {assessment.criticalFailure && (
                <div className="mt-4 p-2 bg-destructive/10 border border-destructive/20 text-destructive text-xs rounded font-medium flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4" />
                  CRITICAL CAPABILITY FAILURE DETECTED
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
