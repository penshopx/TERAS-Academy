import type { CapabilityAchievement, JourneyStep } from "@workspace/api-client-react";
import { Award, ChevronRight, Clock, Layers, Route } from "lucide-react";
import React from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

type PassportRecordProps = {
  timeline: JourneyStep[];
  achievements: CapabilityAchievement[];
};

const displayText = (value: string | null | undefined, fallback: string) => value?.trim() || fallback;

const getPathwayLabel = (step: JourneyStep) =>
  displayText(step.pathwayName, step.pathwayId ? `Pathway ${step.pathwayId}` : "Pathway not recorded");

const getTimelineStatusStyle = (status: string | null | undefined) => {
  const normalized = status?.trim().toLowerCase() ?? "";
  if (normalized.includes("complete") || normalized.includes("achieved") || normalized.includes("clear")) {
    return { variant: "success" as const, dotClass: "bg-green-500 border-green-500" };
  }
  if (normalized.includes("progress") || normalized.includes("pending") || normalized.includes("active") || normalized.includes("review")) {
    return { variant: "warning" as const, dotClass: "bg-amber-500 border-amber-500" };
  }
  if (normalized.includes("block") || normalized.includes("fail") || normalized.includes("gap") || normalized.includes("remediat")) {
    return { variant: "destructive" as const, dotClass: "bg-destructive border-destructive" };
  }
  return { variant: "secondary" as const, dotClass: "bg-muted-foreground border-muted-foreground" };
};

export function PassportRecord({ timeline, achievements }: PassportRecordProps) {
  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 lg:gap-12">
      <section className="min-w-0 space-y-6 lg:col-span-7" aria-labelledby="passport-timeline-title">
        <div className="border-b border-border pb-4">
          <h2 id="passport-timeline-title" className="text-xl font-bold tracking-tight">Longitudinal Record</h2>
          <p className="mt-1 text-sm text-muted-foreground">Traceable development activity across Path A and Path B.</p>
        </div>

        <div className="relative space-y-5 pl-5 before:absolute before:inset-y-0 before:left-[7px] before:w-px before:bg-border/50 sm:space-y-6 sm:pl-7 sm:before:left-[11px]">
          {timeline.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border/60 bg-card/20 p-6 text-sm text-muted-foreground" data-testid="empty-passport-timeline">
              No pathway activity has been recorded yet.
            </div>
          ) : timeline.map((step, index) => {
            const style = getTimelineStatusStyle(step.status);
            const pathwayLabel = getPathwayLabel(step);
            const key = step.id || `timeline-${index}`;
            return (
              <article key={key} className="relative min-w-0" data-testid={`timeline-record-${key}`}>
                <div className={`absolute -left-[21px] top-6 h-2.5 w-2.5 rounded-full border ${style.dotClass} ring-4 ring-background sm:-left-[31px]`} />
                <div className="rounded-lg border border-border/50 bg-card/30 p-4 sm:p-5">
                  <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <Badge variant="outline" className="gap-1 font-mono text-[10px] uppercase">
                          <Route className="h-3 w-3" /> {pathwayLabel}
                        </Badge>
                        <Badge variant={style.variant} className="font-mono text-[10px] uppercase" data-testid={`status-timeline-${key}`}>
                          {displayText(step.status, "Status not recorded")}
                        </Badge>
                      </div>
                      <h3 className="break-words text-base font-bold text-foreground">{displayText(step.label, "Untitled activity")}</h3>
                      <p className="mt-1 break-words text-sm leading-relaxed text-muted-foreground">{displayText(step.description, "No activity details recorded.")}</p>
                    </div>
                    <div className="flex w-fit shrink-0 items-center gap-1.5 rounded border border-border/30 bg-background/50 px-2.5 py-1 font-mono text-xs text-muted-foreground">
                      <Clock className="h-3.5 w-3.5" />
                      {displayText(step.date, "Date not recorded")}
                    </div>
                  </div>
                  {step.href && (
                    <div className="mt-4 border-t border-border/30 pt-3">
                      <a href={step.href} data-testid={`link-timeline-${key}`} className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-primary hover:text-primary/80">
                        View Record <ChevronRight className="h-3.5 w-3.5" />
                      </a>
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="min-w-0 space-y-6 lg:col-span-5" aria-labelledby="passport-achievements-title">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border pb-4">
          <div>
            <h2 id="passport-achievements-title" className="text-xl font-bold tracking-tight">Verified Capabilities</h2>
            <p className="mt-1 text-sm text-muted-foreground">Confirmed capabilities and evidence pool.</p>
          </div>
          <span className="rounded bg-muted/30 px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground" data-testid="count-achievement-records">
            {achievements.length} records
          </span>
        </div>

        <div className="space-y-4">
          {achievements.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border/60 bg-card/20 p-8 text-center text-sm text-muted-foreground" data-testid="empty-passport-achievements">
              No verified capabilities have been recorded yet.
            </div>
          ) : achievements.map((achievement) => (
            <Card key={achievement.id} className="min-w-0 border-border/50 bg-card/30" data-testid={`achievement-record-${achievement.id}`}>
              <CardContent className="p-4 sm:p-5">
                <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex min-w-0 gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded border border-primary/20 bg-primary/10">
                      <Award className="h-5 w-5 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="break-words text-sm font-bold leading-tight text-foreground">{displayText(achievement.capability, "Capability not recorded")}</h3>
                      <div className="mt-1 break-words text-[11px] uppercase tracking-wider text-muted-foreground">
                        {displayText(achievement.program, "Program not recorded")} · {displayText(achievement.pathway, "Path not recorded")}
                      </div>
                    </div>
                  </div>
                  <Badge variant="outline" className="w-fit shrink-0 whitespace-nowrap border-primary/30 bg-primary/5 font-mono text-[10px] text-primary">
                    LVL {displayText(achievement.level, "—")}
                  </Badge>
                </div>

                <dl className="mt-4 grid grid-cols-1 gap-3 border-t border-border/30 pt-4 min-[380px]:grid-cols-2">
                  <div>
                    <dt className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">Achieved date</dt>
                    <dd className="break-words font-mono text-xs text-foreground">{displayText(achievement.achievedAt, "Date not recorded")}</dd>
                  </div>
                  <div>
                    <dt className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">Evidence pool</dt>
                    <dd className="flex items-center gap-1.5 font-mono text-xs font-bold text-primary">
                      <Layers className="h-3.5 w-3.5" /> {achievement.evidenceCount} verified
                    </dd>
                  </div>
                </dl>
                <div className="mt-4 flex flex-col gap-1 border-t border-border/30 pt-3 min-[380px]:flex-row min-[380px]:items-center min-[380px]:justify-between">
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Capability status</span>
                  <span className="break-words font-mono text-[10px] font-bold uppercase text-foreground" data-testid={`status-achievement-${achievement.id}`}>
                    {displayText(achievement.status, "Status not recorded")}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}