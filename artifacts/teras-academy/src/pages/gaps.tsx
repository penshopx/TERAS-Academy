import { useListGaps, useListRemediation, useCompleteRemediation, getListRemediationQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Activity, ShieldAlert, Wrench, CheckCircle } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

export default function GapsAndRemediation() {
  const { data: gaps, isLoading: gapsLoading } = useListGaps();
  const { data: remediations, isLoading: remLoading } = useListRemediation();
  const completeRemediation = useCompleteRemediation();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const isLoading = gapsLoading || remLoading;

  if (isLoading) {
    return <div className="h-full flex items-center justify-center"><Activity className="w-8 h-8 text-primary animate-pulse" /></div>;
  }

  const handleComplete = (planId: string) => {
    completeRemediation.mutate({ remediationId: planId }, {
      onSuccess: () => {
        toast({ title: "Remediation Complete", description: "Plan marked as completed successfully." });
        queryClient.invalidateQueries({ queryKey: getListRemediationQueryKey() });
      }
    });
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Gaps & Remediation</h1>
        <p className="text-muted-foreground mt-1 text-sm">Identified capability deficiencies and active resolution plans</p>
      </div>

      <div className="space-y-4">
        <h2 className="text-xl font-semibold flex items-center gap-2 border-b border-border pb-2">
          <ShieldAlert className="w-5 h-5 text-destructive" /> Active Capability Gaps
        </h2>
        {gaps?.length === 0 ? (
          <div className="p-6 bg-green-500/10 border border-green-500/20 text-green-500 rounded-lg text-center font-mono">
            NO ACTIVE GAPS DETECTED
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {gaps?.map((gap) => (
              <Card key={gap.id} className="border-l-4 border-l-destructive border-border/50">
                <CardContent className="p-4 flex flex-col md:flex-row justify-between md:items-center gap-4">
                  <div className="space-y-2 flex-1">
                    <div className="flex items-center gap-2">
                      <Badge variant="destructive" className="font-mono text-[10px]">{gap.severity}</Badge>
                      <span className="font-semibold">{gap.criterion}</span>
                    </div>
                    <div className="text-sm text-muted-foreground bg-background/50 p-2 rounded">
                      <span className="font-mono text-xs uppercase mr-2">DIAGNOSIS:</span> {gap.diagnosis}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Blocks Gate: <span className="font-mono">{gap.gate}</span>
                    </div>
                  </div>
                  <div className="md:text-right">
                    <div className="text-xs font-mono text-muted-foreground mb-1">RECOMMENDED ACTION</div>
                    <div className="text-sm font-medium">{gap.recommendedAction}</div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-4">
        <h2 className="text-xl font-semibold flex items-center gap-2 border-b border-border pb-2">
          <Wrench className="w-5 h-5 text-primary" /> Remediation Plans
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {remediations?.map((plan) => (
            <Card key={plan.id} className="cockpit-panel border-primary/20 bg-card">
              <CardHeader className="pb-3 border-b border-border/50">
                <div className="flex justify-between items-start mb-2">
                  <Badge variant={plan.status === "COMPLETED" ? "success" : "default"} className="font-mono">
                    {plan.status}
                  </Badge>
                  {plan.dueLabel && <span className="text-xs font-mono text-muted-foreground">{plan.dueLabel}</span>}
                </div>
                <CardTitle className="text-lg">{plan.title}</CardTitle>
                <p className="text-sm text-muted-foreground">{plan.description}</p>
              </CardHeader>
              <CardContent className="pt-4 space-y-4">
                <div className="space-y-2">
                  <div className="text-xs font-mono uppercase text-muted-foreground mb-2">Required Activities</div>
                  {plan.activities.map(act => (
                    <div key={act.id} className="flex items-start gap-2 p-2 bg-background rounded border border-border/50">
                      <div className="mt-0.5">
                        {act.status === "COMPLETED" ? (
                          <CheckCircle className="w-4 h-4 text-green-500" />
                        ) : (
                          <div className="w-4 h-4 rounded-full border border-muted-foreground" />
                        )}
                      </div>
                      <div>
                        <div className="text-sm font-medium">{act.title}</div>
                        <div className="text-xs text-muted-foreground">{act.description}</div>
                      </div>
                    </div>
                  ))}
                </div>
                
                {plan.status !== "COMPLETED" && (
                  <Button 
                    className="w-full font-mono text-xs mt-4" 
                    variant="outline"
                    onClick={() => handleComplete(plan.id)}
                    disabled={completeRemediation.isPending}
                  >
                    MARK PLAN COMPLETE
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
          {remediations?.length === 0 && (
            <div className="col-span-full p-8 border border-dashed border-border rounded-lg text-center text-muted-foreground font-mono text-sm">
              NO ACTIVE REMEDIATION PLANS
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
