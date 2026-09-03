import { useGetAssessorDashboard } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Activity, BookOpen, AlertTriangle, Scale, ArrowRight } from "lucide-react";

export default function AssessorDesk() {
  const { data: dashboard, isLoading, error } = useGetAssessorDashboard();

  if (isLoading) {
    return <div className="h-full flex items-center justify-center"><Activity className="w-8 h-8 text-primary animate-pulse" /></div>;
  }

  if (error || !dashboard) {
    return <div className="text-destructive">Failed to load assessor dashboard.</div>;
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Assessor Command Center</h1>
        <p className="text-muted-foreground mt-1 text-sm font-mono uppercase">ID: {dashboard.assessor.id} | {dashboard.assessor.name}</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="border-primary/50 bg-primary/5">
          <CardContent className="p-6">
            <div className="flex items-center justify-between space-y-0 pb-2">
              <p className="text-sm font-medium uppercase tracking-wider text-muted-foreground">Assessments</p>
              <Scale className="h-4 w-4 text-primary" />
            </div>
            <div className="text-3xl font-bold font-mono text-primary">{dashboard.pendingAssessmentCount}</div>
          </CardContent>
        </Card>
        <Card className="border-border bg-card">
          <CardContent className="p-6">
            <div className="flex items-center justify-between space-y-0 pb-2">
              <p className="text-sm font-medium uppercase tracking-wider text-muted-foreground">Evidence</p>
              <BookOpen className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="text-3xl font-bold font-mono">{dashboard.pendingEvidenceCount}</div>
          </CardContent>
        </Card>
        <Card className="border-amber-500/50 bg-amber-500/5">
          <CardContent className="p-6">
            <div className="flex items-center justify-between space-y-0 pb-2">
              <p className="text-sm font-medium uppercase tracking-wider text-muted-foreground">Reassessments</p>
              <Activity className="h-4 w-4 text-amber-500" />
            </div>
            <div className="text-3xl font-bold font-mono text-amber-500">{dashboard.reassessmentCount}</div>
          </CardContent>
        </Card>
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="p-6">
            <div className="flex items-center justify-between space-y-0 pb-2">
              <p className="text-sm font-medium uppercase tracking-wider text-muted-foreground">Blocked Gates</p>
              <AlertTriangle className="h-4 w-4 text-destructive" />
            </div>
            <div className="text-3xl font-bold font-mono text-destructive">{dashboard.blockedGateCount}</div>
          </CardContent>
        </Card>
      </div>

      <Card className="cockpit-panel mt-6">
        <CardHeader>
          <CardTitle>Decision Queue</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-background/50">
              <TableRow>
                <TableHead>Priority</TableHead>
                <TableHead>Learner</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Subject</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {dashboard.recentActivity.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>
                    <Badge variant={item.priority === "HIGH" ? "destructive" : "secondary"} className="font-mono text-[10px]">
                      {item.priority}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-medium">{item.learnerName}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="font-mono text-[10px] uppercase bg-background">{item.kind}</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">{item.title}</div>
                    <div className="text-xs text-muted-foreground font-mono">{item.moduleName}</div>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="default" className="font-mono text-xs">
                      DECIDE <ArrowRight className="w-3 h-3 ml-1" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
