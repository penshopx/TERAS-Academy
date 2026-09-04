import { getGetCapabilityPassportQueryKey, getGetLearnerDashboardQueryKey, getGetLearnerJourneyQueryKey, getGetLearnerLearningPlanQueryKey, getGetProgramQueryKey, getListLearningCoursesQueryKey, useGetLearnerDashboard, useGetProgram, useSelectLearnerPathway } from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { Activity, CheckCircle2, ChevronRight, Layers, LayoutTemplate, Route } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Link, useParams } from "wouter";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
export default function ProgramDetail() {
  const { programId } = useParams(); const { data: program, isLoading, error } = useGetProgram(programId || ""); const { data: dashboard } = useGetLearnerDashboard(); const mutation = useSelectLearnerPathway(); const queryClient = useQueryClient(); const { toast } = useToast(); const [selectedId, setSelectedId] = useState<string | null>(null);
  useEffect(() => { if (!selectedId && dashboard?.pathway.id) setSelectedId(dashboard.pathway.id); }, [dashboard?.pathway.id, selectedId]);
  if (!programId) return null; if (isLoading) return <div className="flex h-full items-center justify-center"><Activity className="h-8 w-8 animate-pulse text-primary" /></div>; if (error || !program) return <div className="text-destructive">Failed to load program details.</div>;
  const selected = program.pathways.find((pathway) => pathway.id === selectedId) ?? program.pathways[0]; const modules = program.modules.filter((module) => module.pathwayId === selected?.id); const current = selected?.id === dashboard?.pathway.id;
  const activate = () => { if (!selected) return; mutation.mutate({ data: { pathwayId: selected.id } }, { onSuccess: () => { [getGetProgramQueryKey(programId), getGetLearnerDashboardQueryKey(), getGetLearnerJourneyQueryKey(), getGetLearnerLearningPlanQueryKey(), getGetCapabilityPassportQueryKey(), getListLearningCoursesQueryKey()].forEach((queryKey) => queryClient.invalidateQueries({ queryKey })); toast({ title: "Pathway activated", description: `${selected.name} is now your active capability pathway.` }); }, onError: () => toast({ title: "Pathway selection failed", description: "The pathway could not be activated.", variant: "destructive" }) }); };
  return (
    <div className="space-y-6">
      <div className="mb-2 flex items-center gap-2 font-mono text-sm text-muted-foreground">
        <Link href="/programs">PROGRAMS</Link>
        <ChevronRight className="h-4 w-4" />
        <span>{program.domain}</span>
      </div>
      <div>
        <h1 className="text-3xl md:text-4xl font-bold">{program.name}</h1>
        <p className="text-muted-foreground mt-1">{program.description}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex gap-2"><LayoutTemplate />Choose your capability pathway</CardTitle>
          <CardDescription>Each pathway has its own curriculum, evidence, assessments, and readiness gates.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2">
            {program.pathways.map((pathway) => (
              <button
                type="button"
                key={pathway.id}
                onClick={() => setSelectedId(pathway.id)}
                className={cn("rounded-lg border p-5 text-left transition-colors", pathway.id === selected?.id ? "border-primary bg-primary/5" : "border-border hover:border-primary/50")}
              >
                <div className="flex justify-between items-start gap-2">
                  <Badge variant="outline">{pathway.type}</Badge>
                  {pathway.id === dashboard?.pathway.id && <Badge variant="default" className="shrink-0"><CheckCircle2 className="mr-1 h-3 w-3" />ACTIVE</Badge>}
                </div>
                <div className="mt-3 font-semibold text-lg">{pathway.name}</div>
                <p className="text-sm text-muted-foreground mt-1">{pathway.outcome}</p>
              </button>
            ))}
          </div>
          <div className="mt-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-t border-border pt-4">
            <span className="font-medium text-sm text-muted-foreground">Selected: <strong className="text-foreground">{selected?.name}</strong></span>
            <Button onClick={activate} disabled={!selected || current || mutation.isPending} className="w-full sm:w-auto">
              {mutation.isPending ? "ACTIVATING..." : current ? "CURRENT PATHWAY" : "ACTIVATE PATHWAY"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex gap-2"><Layers />{selected?.name} modules</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Code</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Capability</TableHead>
                    <TableHead>Progress</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {modules.map((module) => (
                    <TableRow key={module.id}>
                      <TableCell className="font-mono text-xs text-muted-foreground">{module.code}</TableCell>
                      <TableCell className="font-medium"><Link href={`/modules/${module.id}`} className="hover:text-primary transition-colors">{module.name}</Link></TableCell>
                      <TableCell className="text-sm text-muted-foreground">{module.capability}</TableCell>
                      <TableCell><Progress value={module.progress} className="h-2" /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="md:hidden flex flex-col divide-y divide-border">
              {modules.map((module) => (
                <div key={module.id} className="p-4 space-y-2">
                  <div className="flex justify-between items-start gap-2">
                    <span className="font-mono text-xs text-muted-foreground bg-background px-2 py-0.5 rounded border border-border">{module.code}</span>
                    <span className="text-xs font-bold font-mono text-primary">{module.progress}%</span>
                  </div>
                  <div>
                    <Link href={`/modules/${module.id}`} className="font-medium hover:text-primary transition-colors block">
                      {module.name}
                    </Link>
                    <p className="text-xs text-muted-foreground mt-1">{module.capability}</p>
                  </div>
                  <Progress value={module.progress} className="h-1.5 mt-2" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex gap-2"><Route />Gate map</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="relative before:absolute before:inset-0 before:left-4 before:-translate-x-px before:w-0.5 before:bg-border before:z-0 space-y-6">
              {selected?.gates.map((gate) => (
                <div className="relative z-10 pl-10" key={gate.id}>
                  <div className="absolute left-0 top-0 w-8 h-8 rounded-full bg-background border-2 border-primary flex items-center justify-center">
                    <div className="w-2 h-2 rounded-full bg-primary" />
                  </div>
                  <Badge variant="outline" className="font-mono text-[10px] bg-background mb-1">{gate.code}</Badge>
                  <div className="font-semibold text-sm">{gate.name}</div>
                  <p className="text-xs text-muted-foreground mt-1">{gate.requirement}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}