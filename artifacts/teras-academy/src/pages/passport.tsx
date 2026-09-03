import { useGetCapabilityPassport } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Activity, Award, Calendar, Layers, ShieldCheck } from "lucide-react";
import { LearnerCondition } from "@/components/learner-condition";

export default function Passport() {
  const { data: passport, isLoading, error } = useGetCapabilityPassport();

  if (isLoading) {
    return <div className="h-full flex items-center justify-center"><Activity className="w-8 h-8 text-primary animate-pulse" /></div>;
  }

  if (error || !passport) {
    return <div className="text-destructive">Failed to load capability passport.</div>;
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-5xl mx-auto">
      
      {/* Passport Header */}
      <Card className="cockpit-panel border-primary overflow-hidden relative">
        <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
          <Award className="w-48 h-48 text-primary" />
        </div>
        <CardContent className="p-8 relative z-10">
          <div className="flex flex-col md:flex-row gap-8 items-start md:items-center">
            <div className="w-24 h-24 rounded-lg bg-primary/20 border-2 border-primary flex items-center justify-center text-4xl font-bold font-mono text-primary shadow-[0_0_20px_rgba(0,195,255,0.3)]">
              {passport.learner.initials}
            </div>
            <div className="flex-1 space-y-2">
              <div className="flex gap-2 text-xs font-mono text-primary">
                <ShieldCheck className="w-4 h-4" /> VERIFIED CREDENTIAL RECORD
              </div>
              <h1 className="text-4xl font-bold tracking-tight">{passport.learner.name}</h1>
              <p className="text-lg text-muted-foreground">{passport.headline}</p>
              <div className="flex flex-wrap gap-2 pt-2">
                <Badge variant="outline" className="font-mono text-primary">{passport.pathway.name}</Badge>
                <Badge variant="outline" className="font-mono">{passport.learner.role}</Badge>
                {passport.learner.organization && (
                  <Badge variant="secondary" className="font-mono">{passport.learner.organization}</Badge>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <LearnerCondition owner="Learner" />

      <h2 className="text-2xl font-bold tracking-tight mt-10 mb-4 border-b border-border pb-2">Verified Achievements</h2>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {passport.achievements.map((achievement) => (
          <Card key={achievement.id} className="border-border/50 hover-elevate bg-card/50">
            <CardContent className="p-5 flex gap-4">
              <div className="w-12 h-12 rounded bg-background border border-border flex items-center justify-center shrink-0">
                <Award className="w-6 h-6 text-primary" />
              </div>
              <div className="flex-1">
                <div className="flex justify-between items-start mb-1">
                  <h3 className="font-bold text-lg leading-tight">{achievement.capability}</h3>
                  <Badge variant="success" className="font-mono text-[10px]">LEVEL: {achievement.level}</Badge>
                </div>
                <div className="text-xs text-muted-foreground mb-3">{achievement.program} • {achievement.pathway}</div>
                <div className="flex items-center justify-between text-xs font-mono border-t border-border/50 pt-2">
                  <div className="flex items-center gap-1 text-muted-foreground">
                    <Calendar className="w-3 h-3" /> {achievement.achievedAt}
                  </div>
                  <div className="flex items-center gap-1 text-primary">
                    <Layers className="w-3 h-3" /> {achievement.evidenceCount} EVIDENCES
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

    </div>
  );
}
