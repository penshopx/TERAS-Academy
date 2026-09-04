import { useGetAssessment } from "@workspace/api-client-react";
import { useParams, Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Activity, ChevronRight, ShieldAlert, FileSignature, LockKeyhole, History, FileCheck2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { recommendationLabel, type LegacyAssessmentDecision } from "@/components/assessor-decision";

export default function AssessmentDetail() {
  const { assessmentId } = useParams();
  const { data: detail, isLoading, error } = useGetAssessment(assessmentId || "");

  if (!assessmentId) return null;

  if (isLoading) {
    return <div className="h-full flex items-center justify-center"><Activity className="w-8 h-8 text-primary animate-pulse" /></div>;
  }

  if (error || !detail) {
    return <div className="text-destructive">Failed to load assessment details.</div>;
  }

  const { assessment, criteria, attempts } = detail;

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2 font-mono">
        <Link href="/assessments" className="hover:text-primary transition-colors">ASSESSMENTS</Link>
        <ChevronRight className="w-4 h-4" />
        <span className="text-foreground font-mono">{assessment.id}</span>
      </div>

      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{assessment.name}</h1>
          <p className="text-muted-foreground font-mono text-sm uppercase tracking-wider mt-1">Rubric Evaluation Record</p>
        </div>

        <div className="flex items-center gap-4 bg-card/50 p-4 rounded-lg border border-border">
          <div className="text-right">
            <div className="text-xs text-muted-foreground font-mono">FINAL SCORE</div>
            <div className="text-3xl font-bold text-primary">{assessment.score}%</div>
          </div>
          <Badge variant={assessment.status === "PASSED" ? "success" : "outline"} className="h-8 px-4 text-sm font-mono">
            {assessment.status}
          </Badge>
        </div>
      </div>

      {assessment.criticalFailure && (
        <div className="bg-destructive/10 border border-destructive/30 p-4 rounded-lg flex items-center gap-3 text-destructive">
          <ShieldAlert className="w-6 h-6 shrink-0" />
          <div>
            <h3 className="font-bold">Critical Failure Registered</h3>
            <p className="text-sm opacity-90">One or more critical capability criteria were not met. Automatic failure applied.</p>
          </div>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground"><LockKeyhole className="h-4 w-4 text-primary" /> READINESS IMPACT</div>
            <p className="mt-2 font-semibold">{assessment.gateCode ? `Controls gate ${assessment.gateCode}` : "Assessment record"}</p>
            <p className="mt-1 text-xs text-muted-foreground">{assessment.criticalFailure ? "Gate remains blocked by a critical failure." : "Stored result contributes to readiness."}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground"><History className="h-4 w-4 text-primary" /> ATTEMPT CONTEXT</div>
            <p className="mt-2 font-semibold">{assessment.attemptCount} internal evaluation attempt{assessment.attemptCount === 1 ? "" : "s"}</p>
            <p className="mt-1 text-xs text-muted-foreground">Latest stored status: {assessment.status}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground"><FileCheck2 className="h-4 w-4 text-primary" /> EVIDENCE TRACE</div>
            <p className="mt-2 font-semibold">{criteria.filter(item => item.evidenceId).length} of {criteria.length} criteria linked</p>
            <p className="mt-1 text-xs text-muted-foreground">Evidence IDs are shown beside each criterion.</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 cockpit-panel border-primary/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><FileSignature className="w-5 h-5 text-primary" /> Evaluation Rubric</CardTitle>
            <CardDescription>Line-item scoring against standard capability criteria</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="hidden md:block">
              <Table>
                <TableHeader className="bg-background/80">
                  <TableRow>
                    <TableHead className="w-[100px]">Code</TableHead>
                    <TableHead>Criterion</TableHead>
                    <TableHead>Layer / Evidence</TableHead>
                    <TableHead className="text-center w-[100px]">Safety</TableHead>
                    <TableHead className="text-right w-[100px]">Score</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {criteria.map((criterion) => (
                    <TableRow key={criterion.id} className={cn(
                      "hover:bg-muted/30",
                      criterion.critical && criterion.score === 0 ? "bg-destructive/5 hover:bg-destructive/10" : ""
                    )}>
                      <TableCell className="font-mono text-xs">{criterion.code}</TableCell>
                      <TableCell>
                        <div className="font-medium text-sm">{criterion.label}</div>
                        {criterion.observation && (
                          <div className="text-xs text-muted-foreground mt-1 italic border-l-2 border-primary/50 pl-2">
                            "{criterion.observation}"
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="text-xs">{criterion.layer}</div>
                        <div className="mt-1 font-mono text-[11px] text-muted-foreground">{criterion.evidenceId ?? "No evidence linked"}</div>
                      </TableCell>
                      <TableCell className="text-center">
                        {criterion.critical && <ShieldAlert className="w-4 h-4 text-destructive mx-auto" />}
                      </TableCell>
                      <TableCell className="text-right">
                        {criterion.score !== null ? (
                          <span className={cn(
                            "font-mono font-bold",
                            criterion.score === 3 ? "text-green-500" :
                            criterion.score === 0 ? "text-destructive" :
                            "text-foreground"
                          )}>{criterion.score}/3</span>
                        ) : (
                          <span className="text-muted-foreground font-mono">-</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="md:hidden flex flex-col divide-y divide-border">
              {criteria.map((criterion) => (
                <div key={criterion.id} className={cn(
                  "p-4 space-y-2",
                  criterion.critical && criterion.score === 0 ? "bg-destructive/5" : ""
                )}>
                  <div className="flex justify-between items-start gap-2">
                    <span className="font-mono text-xs text-muted-foreground">{criterion.code}</span>
                    <div className="flex items-center gap-2">
                      {criterion.critical && <Badge variant="destructive" className="text-[10px] h-5 px-1.5 shrink-0">CRITICAL</Badge>}
                      {criterion.score !== null ? (
                        <span className={cn(
                          "font-mono font-bold shrink-0 text-sm",
                          criterion.score === 3 ? "text-green-500" :
                          criterion.score === 0 ? "text-destructive" :
                          "text-foreground"
                        )}>{criterion.score}/3</span>
                      ) : (
                        <span className="text-muted-foreground font-mono">-</span>
                      )}
                    </div>
                  </div>
                  <div className="font-medium text-sm">{criterion.label}</div>
                  <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span>Layer: {criterion.layer}</span>
                    <span className="font-mono">Evidence: {criterion.evidenceId ?? "Not linked"}</span>
                  </div>
                  {criterion.observation && (
                    <div className="text-xs text-muted-foreground italic border-l-2 border-primary/50 pl-2">
                      "{criterion.observation}"
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card h-fit">
          <CardHeader>
            <CardTitle>Internal Evaluation History</CardTitle>
            <CardDescription>Stored internal recommendations; newest record appears last.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4 relative before:absolute before:inset-0 before:left-4 before:-translate-x-px before:w-0.5 before:bg-border before:z-0">
              {attempts.map((attempt) => (
                <div key={attempt.id} className="relative z-10 flex gap-4">
                  <div className="w-8 h-8 rounded-full bg-background border-2 border-primary flex items-center justify-center font-mono text-xs shrink-0 mt-0.5">
                    {attempt.number}
                  </div>
                  <div className="bg-background/80 p-3 rounded border border-border w-full">
                    <div className="flex justify-between items-start mb-2">
                      <div className="font-mono text-xs text-muted-foreground">{new Date(attempt.submittedAt).toLocaleDateString()}</div>
                      <Badge variant="outline" className="text-[10px] uppercase font-mono">{attempt.status}</Badge>
                    </div>
                    {attempt.decision && (
                      <div className="mt-1">
                        <div className="text-[10px] font-mono text-muted-foreground">INTERNAL READINESS RECOMMENDATION</div>
                        <div className="text-sm font-semibold">{recommendationLabel(attempt.decision as LegacyAssessmentDecision)}</div>
                      </div>
                    )}
                    {attempt.assessor && (
                      <div className="text-xs text-muted-foreground mt-2 border-t border-border pt-2">
                        Internal evaluator: {attempt.assessor}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
