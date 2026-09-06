import type { AdminOperationalSummary } from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ShieldAlert } from "lucide-react";

export function AdminReadOnlyDashboard({ desk, projection }: {
  desk: "Learner" | "Trainer" | "Assessor";
  projection: AdminOperationalSummary;
}) {
  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500" data-testid={`admin-read-only-${desk.toLowerCase()}-dashboard`}>
      <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-4 text-sm" role="status" data-testid="admin-read-only-banner">
        <div className="flex items-center gap-2 font-semibold"><ShieldAlert className="h-4 w-4 text-amber-600" />Admin read-only mode</div>
        <p className="mt-1 text-muted-foreground">You are viewing the {desk.toLowerCase()} workspace as an administrator. Your identity remains admin; no operational role is assumed and all actor-specific actions are unavailable.</p>
      </div>
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{desk} operational overview</h1>
        <p className="mt-1 text-sm text-muted-foreground">Organization-wide aggregate view · generated {new Date(projection.generatedAt).toLocaleString()}</p>
      </div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {projection.metrics.map(metric => (
          <Card key={metric.id}>
            <CardHeader className="pb-2"><CardDescription>{metric.label}</CardDescription></CardHeader>
            <CardContent><p className="font-mono text-3xl font-bold">{metric.value}</p><p className="mt-1 text-xs text-muted-foreground">{metric.description}</p></CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader><CardTitle>Assignment coverage</CardTitle><CardDescription>Operational assignments are displayed for administration only; this view cannot review, assess, or submit work.</CardDescription></CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          <p><strong>{projection.incompleteAssignments.trainer}</strong><span className="block text-sm text-muted-foreground">active enrollments without trainer</span></p>
          <p><strong>{projection.incompleteAssignments.assessor}</strong><span className="block text-sm text-muted-foreground">active enrollments without assessor</span></p>
          <p><strong>{projection.incompleteAssignments.total}</strong><span className="block text-sm text-muted-foreground">incomplete assignments</span></p>
        </CardContent>
      </Card>
    </div>
  );
}