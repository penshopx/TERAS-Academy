import { getGetCapabilityPassportQueryKey, getGetLearnerDashboardQueryKey, getGetLearnerJourneyQueryKey, getGetLearnerLearningPlanQueryKey, getGetProgramQueryKey, useGetLearnerDashboard, useGetProgram, useSelectLearnerPathway } from "@workspace/api-client-react";
import { useParams, Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { Activity, Check, ChevronRight, Layers, LayoutTemplate } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

export default function ProgramDetail() {
  const { programId } = useParams();
  const { data: program, isLoading, error } = useGetProgram(programId || "");
  const { data: dashboard } = useGetLearnerDashboard();
  const pathwayMutation = useSelectLearnerPathway();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const selectPathway = (pathwayId: string, pathwayName: string) => {
    pathwayMutation.mutate({ data: { pathwayId } }, {
      onSuccess: () => {
        toast({ title: "Pathway activated", description: `${pathwayName} is now your active capability pathway.` });
        [
          getGetProgramQueryKey(programId || ""),
          getGetLearnerDashboardQueryKey(),
          getGetLearnerJourneyQueryKey(),
          getGetLearnerLearningPlanQueryKey(),
          getGetCapabilityPassportQueryKey(),
        ].forEach(queryKey => queryClient.invalidateQueries({ queryKey }));
      },
      onError: () => toast({ title: "Pathway selection failed", description: "The pathway could not be activated.", variant: "destructive" }),
    });
  };

  if (!programId) return null;

  if (isLoading) {
    return <div className="h-full flex items-center justify-center"><Activity className="w-8 h-8 text-primary animate-pulse" /></div>;
  }

  if (error || !program) {
    return <div className="text-destructive">Failed to load program details.</div>;
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2 font-mono">
        <Link href="/programs" className="hover:text-primary transition-colors">PROGRAMS</Link>
        <ChevronRight className="w-4 h-4" />
        <span className="text-foreground">{program.domain}</span>
      </div>

      <div className="mb-8">
        <div className="flex items-center gap-4 mb-2">
          <h1 className="text-4xl font-bold tracking-tight">{program.name}</h1>
          <Badge variant={program.status === "ACTIVE" ? "default" : "secondary"}>{program.status}</Badge>
        </div>
        <p className="text-muted-foreground text-lg max-w-3xl">{program.description}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Layers className="w-5 h-5 text-primary" /> Required Modules</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[100px]">Code</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Capability</TableHead>
                    <TableHead className="text-right">Progress</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {program.modules.map((mod) => (
                    <TableRow key={mod.id} className="cursor-pointer hover:bg-muted/50 transition-colors">
                      <TableCell className="font-mono text-xs">{mod.code}</TableCell>
                      <TableCell className="font-medium">
                        <Link href={`/modules/${mod.id}`} className="hover:underline hover:text-primary decoration-primary/50 underline-offset-4">
                          {mod.name}
                        </Link>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{mod.capability}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Progress value={mod.progress} className="w-16 h-1.5" />
                          <span className="font-mono text-xs w-8 text-right">{mod.progress}%</span>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="bg-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><LayoutTemplate className="w-5 h-5 text-primary" /> Supported Pathways</CardTitle>
              <CardDescription>Qualification outcomes for this program</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {program.pathways.map((pathway) => {
                  const isActive = dashboard?.pathway.id === pathway.id;
                  return (
                    <div key={pathway.id} className={`p-4 rounded-md border bg-background/50 ${isActive ? "border-primary/60 ring-1 ring-primary/20" : "border-border"}`}>
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <Badge variant="outline" className="font-mono text-[10px]">{pathway.type}</Badge>
                        {isActive && <Badge className="font-mono text-[10px]"><Check className="mr-1 h-3 w-3" /> ACTIVE</Badge>}
                      </div>
                      <div className="font-semibold">{pathway.name}</div>
                      <div className="text-xs text-muted-foreground mt-1 mb-4">Outcome: {pathway.outcome}</div>
                      <Button
                        size="sm"
                        variant={isActive ? "secondary" : "outline"}
                        className="w-full font-mono text-xs"
                        disabled={isActive || pathwayMutation.isPending}
                        onClick={() => selectPathway(pathway.id, pathway.name)}
                      >
                        {isActive ? "ACTIVE PATHWAY" : pathwayMutation.isPending ? "ACTIVATING..." : "ACTIVATE PATHWAY"}
                      </Button>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
