import { useGetCapabilityPassport } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Activity, Award, ShieldCheck, FileText } from "lucide-react";
import { LearnerCondition } from "@/components/learner-condition";
import { PassportRecord } from "@/components/passport-record";

export default function Passport() {
  const { data: passport, isLoading, error } = useGetCapabilityPassport();

  if (isLoading) {
    return <div className="h-full flex items-center justify-center min-h-[50vh]"><Activity className="w-8 h-8 text-primary animate-pulse" /></div>;
  }

  if (error || !passport) {
    return <div className="text-destructive p-8 bg-destructive/10 rounded-lg border border-destructive/20 text-center font-mono">Failed to load capability record.</div>;
  }

  return (
    <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-700 max-w-6xl mx-auto pb-20">
      
      {/* Passport Header */}
      <Card className="cockpit-panel border-border/50 overflow-hidden relative bg-card/40 backdrop-blur-md shadow-2xl">
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-primary/5 rounded-full blur-[100px] pointer-events-none" />
        <div className="absolute top-0 right-0 p-8 opacity-[0.03] pointer-events-none mix-blend-screen">
          <Award className="w-64 h-64 text-foreground" />
        </div>
        <CardContent className="p-8 md:p-10 relative z-10">
          <div className="flex flex-col md:flex-row gap-8 items-start">
            <div className="w-32 h-32 shrink-0 rounded-xl bg-background border border-border/50 flex items-center justify-center text-6xl font-bold font-mono text-foreground shadow-2xl relative overflow-hidden group">
              <div className="absolute inset-0 bg-gradient-to-b from-foreground/5 to-transparent pointer-events-none" />
              <div className="absolute top-1.5 left-1.5 w-1.5 h-1.5 bg-border rounded-full" />
              <div className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-border rounded-full" />
              <div className="absolute bottom-1.5 left-1.5 w-1.5 h-1.5 bg-border rounded-full" />
              <div className="absolute bottom-1.5 right-1.5 w-1.5 h-1.5 bg-border rounded-full" />
              {passport.learner.initials}
            </div>
            <div className="flex-1 space-y-5">
              <div>
                <div className="flex items-center gap-2 text-[10px] font-bold tracking-[0.2em] uppercase text-primary mb-3">
                  <ShieldCheck className="w-4 h-4" /> Longitudinal Capability Record
                </div>
                <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-foreground mb-2">{passport.learner.name}</h1>
                <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">{passport.subtitle}</p>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-muted-foreground font-mono text-xs">
                  <span className="flex items-center gap-1.5 text-foreground/70"><FileText className="w-3.5 h-3.5" /> INTERNAL TERAS CAPABILITY RECORD</span>
                  <span className="text-border">•</span>
                  <span className="text-foreground/70">CURRENT CONTEXT: {passport.pathway.name}</span>
                </div>
              </div>
              
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6 pt-6 border-t border-border/50">
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">Designation</div>
                  <div className="text-sm font-semibold text-foreground">{passport.learner.role}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">Organization</div>
                  <div className="text-sm font-semibold text-foreground">{passport.learner.organization || '—'}</div>
                </div>
                <div className="md:col-span-2">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">Active Pathway</div>
                  <div className="text-sm font-semibold text-foreground">{passport.pathway.name}</div>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <LearnerCondition owner="Learner" />

      <div className="mt-8">
        <PassportRecord timeline={passport.timeline} achievements={passport.achievements} />
      </div>
    </div>
  );
}
