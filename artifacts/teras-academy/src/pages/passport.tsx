import { useGetCapabilityPassport } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Activity, Award, Calendar, Layers, ShieldCheck, Clock, FileText, ChevronRight } from "lucide-react";
import { LearnerCondition } from "@/components/learner-condition";

const getPathwayLabel = (text: string) => text.match(/\bPath\s+[AB]\b/i)?.[0] ?? null;

const getTimelineStatusStyle = (status: string) => {
  const s = status.toLowerCase();
  if (s.includes('complete') || s.includes('achieved') || s.includes('clear')) {
    return { variant: 'success' as const, dotClass: 'bg-green-500 border-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]' };
  }
  if (s.includes('progress') || s.includes('pending') || s.includes('active') || s.includes('review')) {
    return { variant: 'warning' as const, dotClass: 'bg-amber-500 border-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)] animate-pulse' };
  }
  if (s.includes('block') || s.includes('fail') || s.includes('gap') || s.includes('remediat')) {
    return { variant: 'destructive' as const, dotClass: 'bg-destructive border-destructive shadow-[0_0_8px_rgba(239,68,68,0.5)]' };
  }
  return { variant: 'secondary' as const, dotClass: 'bg-muted-foreground border-muted-foreground' };
};

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
                  <ShieldCheck className="w-4 h-4" /> Official Capability Record
                </div>
                <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-foreground mb-2">{passport.learner.name}</h1>
                <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">{passport.subtitle}</p>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-muted-foreground font-mono text-xs">
                  <span className="flex items-center gap-1.5 text-foreground/70"><FileText className="w-3.5 h-3.5" /> VERIFIED ENGINE RECORD</span>
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

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 mt-8">
        <div className="lg:col-span-7 space-y-6">
          <div className="flex items-center justify-between border-b border-border pb-4">
            <div>
              <h2 className="text-xl font-bold tracking-tight">Longitudinal Record</h2>
              <p className="text-sm text-muted-foreground mt-1">Traceable development activity and evaluations.</p>
            </div>
          </div>
          
          <div className="relative pl-6 space-y-8 before:absolute before:inset-y-0 before:left-[11px] before:w-px before:bg-border/50">
            {passport.timeline.length === 0 ? (
              <div className="text-sm text-muted-foreground p-4">No recorded activity.</div>
            ) : (
              passport.timeline.map((step, i) => {
                const style = getTimelineStatusStyle(step.status);
                const pathwayLabel = getPathwayLabel(`${step.label} ${step.description}`);
                return (
                  <div key={step.id || i} className="relative group">
                    <div className={`absolute -left-[29px] top-2 w-2.5 h-2.5 rounded-full ${style.dotClass} z-10 ring-4 ring-background transition-transform group-hover:scale-125`} />
                    <div className="bg-card/30 border border-border/40 rounded-lg p-5 hover:bg-card/50 hover:border-border/80 transition-all duration-300 hover:-translate-y-0.5">
                      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-3">
                        <div>
                          <h3 className="font-bold text-base text-foreground">{step.label}</h3>
                          <p className="text-sm text-muted-foreground mt-1 leading-relaxed">{step.description}</p>
                        </div>
                        {step.date && (
                          <div className="flex items-center gap-1.5 text-xs font-mono text-muted-foreground shrink-0 bg-background/50 px-2.5 py-1 rounded border border-border/30">
                            <Clock className="w-3.5 h-3.5" />
                            {step.date}
                          </div>
                        )}
                      </div>
                      
                      <div className="flex flex-wrap items-center justify-between gap-3 mt-4 pt-4 border-t border-border/30">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant={style.variant} className="font-mono text-[10px] uppercase">
                            {step.status}
                          </Badge>
                          {pathwayLabel && (
                            <Badge variant="outline" className="font-mono text-[10px] uppercase">
                              {pathwayLabel} history
                            </Badge>
                          )}
                        </div>
                        {step.href && (
                          <a href={step.href} className="text-[11px] font-bold uppercase tracking-wider text-primary hover:text-primary/80 flex items-center gap-1 transition-colors">
                            View Record <ChevronRight className="w-3.5 h-3.5" />
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="lg:col-span-5 space-y-6">
          <div className="flex items-center justify-between border-b border-border pb-4">
            <div>
              <h2 className="text-xl font-bold tracking-tight">Verified Capabilities</h2>
              <p className="text-sm text-muted-foreground mt-1">Confirmed capabilities and evidence pool.</p>
            </div>
            <span className="text-[10px] font-mono font-bold text-muted-foreground uppercase tracking-widest bg-muted/30 px-2 py-1 rounded">{passport.achievements.length} RECORDS</span>
          </div>

          <div className="space-y-4">
            {passport.achievements.length === 0 ? (
              <div className="text-center p-8 border border-border/40 rounded-lg bg-card/30 text-muted-foreground text-sm">
                No verified capabilities in record.
              </div>
            ) : (
              passport.achievements.map((achievement) => (
                <Card key={achievement.id} className="border-border/40 bg-card/30 hover:bg-card/50 hover:border-primary/30 transition-colors group relative overflow-hidden shadow-sm hover:shadow-md">
                  <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-primary/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                  <CardContent className="p-5">
                    <div className="flex justify-between items-start mb-4">
                      <div className="flex gap-4">
                        <div className="w-10 h-10 rounded bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                          <Award className="w-5 h-5 text-primary" />
                        </div>
                        <div>
                          <h3 className="font-bold text-sm leading-tight text-foreground">{achievement.capability}</h3>
                          <div className="text-[11px] text-muted-foreground mt-1 uppercase tracking-wider">
                            {achievement.program} • {achievement.pathway}
                          </div>
                        </div>
                      </div>
                      <Badge variant="outline" className="font-mono text-[10px] border-primary/30 text-primary bg-primary/5 shrink-0 whitespace-nowrap ml-2">
                        LVL {achievement.level}
                      </Badge>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-3 pt-4 border-t border-border/30">
                      <div>
                        <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Achieved Date</div>
                        <div className="text-xs font-mono text-foreground">{achievement.achievedAt || 'Not recorded'}</div>
                      </div>
                      <div>
                        <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Evidence Pool</div>
                        <div className="text-xs font-mono text-primary flex items-center gap-1.5 font-bold">
                          <Layers className="w-3.5 h-3.5" />
                          {achievement.evidenceCount} verified
                        </div>
                      </div>
                    </div>
                    
                    <div className="mt-4 pt-3 border-t border-border/30 flex justify-between items-center">
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Status</span>
                      <span className={`text-[10px] font-mono font-bold uppercase ${
                        achievement.status?.toLowerCase().includes('verif') || achievement.status?.toLowerCase().includes('activ') 
                          ? 'text-green-500' 
                          : 'text-amber-500'
                      }`}>
                        {achievement.status || 'Status not recorded'}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
