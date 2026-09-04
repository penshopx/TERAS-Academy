import { useListLearningCourses } from "@workspace/api-client-react";
import { computeCourseProgress } from "@/lib/learning-progress";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { BookOpen, PlayCircle, Clock, ChevronRight, Activity } from "lucide-react";
import { Link } from "wouter";
import { Skeleton } from "@/components/ui/skeleton";

export default function LearningList() {
  const { data: courses, isLoading, error } = useListLearningCourses();

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-5 w-96 mt-2" />
        </div>
        <div className="grid gap-4">
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      </div>
    );
  }

  if (error || !courses) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-8 text-center bg-destructive/10 border border-destructive/20 rounded-xl">
        <Activity className="h-12 w-12 text-destructive mb-4" />
        <h2 className="text-xl font-bold text-destructive">Failed to Load Learning</h2>
        <p className="text-sm text-destructive/70 mt-2">Could not retrieve learning courses at this time.</p>
      </div>
    );
  }

  if (courses.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-12 text-center border border-border/50 rounded-xl bg-card/50">
        <BookOpen className="h-12 w-12 text-muted-foreground mb-4" />
        <h2 className="text-xl font-bold text-foreground">No Courses Found</h2>
        <p className="text-sm text-muted-foreground mt-2 max-w-md">
          You are not currently enrolled in any learning courses. Check your Learning Plan or Programs to begin.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
          <BookOpen className="h-8 w-8 text-primary" />
          Learning Cockpit
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Track your required learning activities and resume exactly where you left off.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6">
        {courses.map((course) => {
          const progress = computeCourseProgress(course);
          
          let totalMinutes = 0;
          course.modules.forEach(m => m.lessons.forEach(l => totalMinutes += l.estimatedDurationMinutes));

          const isCompleted = progress.percentage === 100;
          const isStarted = progress.completedCount > 0;

          return (
            <Card key={course.id} className="overflow-hidden border-border/50 hover:border-primary/30 transition-colors bg-card/40 backdrop-blur-sm relative">
              {isCompleted && (
                <div className="absolute top-0 right-0 w-16 h-16 overflow-hidden">
                  <div className="absolute top-6 -right-6 bg-emerald-500/20 text-emerald-400 text-[10px] font-bold uppercase tracking-wider py-1 w-24 text-center rotate-45 border-y border-emerald-500/30">
                    Done
                  </div>
                </div>
              )}
              
              <CardContent className="p-0">
                <div className="grid grid-cols-1 md:grid-cols-[1fr_320px] divide-y md:divide-y-0 md:divide-x divide-border/50">
                  <div className="p-6 md:p-8 space-y-4">
                    <div className="flex items-center gap-3">
                      <Badge variant="outline" className="font-mono bg-primary/10 text-primary border-primary/20">
                        COURSE {course.sequence}
                      </Badge>
                      <Badge variant={course.status === 'ACTIVE' ? 'default' : 'secondary'} className="uppercase text-[10px] tracking-wider">
                        {course.status}
                      </Badge>
                    </div>
                    
                    <div>
                      <Link href={`/learning/courses/${course.id}`} className="inline-block group">
                        <h2 className="text-2xl font-bold text-foreground group-hover:text-primary transition-colors flex items-center gap-2">
                          {course.title}
                          <ChevronRight className="h-5 w-5 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all text-primary" />
                        </h2>
                      </Link>
                      <p className="text-muted-foreground mt-2 text-sm leading-relaxed max-w-2xl">
                        {course.description}
                      </p>
                    </div>

                    <div className="flex items-center gap-6 text-xs font-mono text-muted-foreground pt-4 border-t border-border/30">
                      <span className="flex items-center gap-2">
                        <BookOpen className="h-4 w-4 text-primary/70" />
                        {course.modules.length} MODULES
                      </span>
                      <span className="flex items-center gap-2">
                        <Clock className="h-4 w-4 text-primary/70" />
                        ~{Math.round(totalMinutes / 60)} HOURS
                      </span>
                    </div>
                  </div>

                  <div className="bg-muted/10 p-6 md:p-8 flex flex-col justify-center space-y-6">
                    <div className="space-y-2">
                      <div className="flex justify-between items-end">
                        <span className="text-xs font-mono font-bold tracking-wider text-muted-foreground uppercase">Progress</span>
                        <span className="text-2xl font-bold text-primary font-mono">{progress.percentage}%</span>
                      </div>
                      <Progress value={progress.percentage} className="h-2 bg-muted/30" />
                      <div className="flex justify-between text-[11px] text-muted-foreground font-mono mt-1">
                        <span>{progress.completedCount} COMPLETED</span>
                        <span>{progress.requiredCount} REQUIRED</span>
                      </div>
                    </div>

                    <div className="pt-2">
                      {progress.firstIncompleteAction ? (
                        <Link href={`/learning/lessons/${progress.firstIncompleteAction.lessonId}`} className="block">
                          <Button className="w-full font-bold uppercase tracking-widest text-xs h-12 shadow-[0_0_20px_rgba(0,195,255,0.15)] hover:shadow-[0_0_30px_rgba(0,195,255,0.3)] transition-all">
                            {isStarted ? (
                              <><PlayCircle className="w-4 h-4 mr-2" /> Continue Learning</>
                            ) : (
                              <><PlayCircle className="w-4 h-4 mr-2" /> Start Course</>
                            )}
                          </Button>
                        </Link>
                      ) : (
                        <Link href={`/learning/courses/${course.id}`} className="block">
                          <Button variant="outline" className="w-full font-bold uppercase tracking-widest text-xs h-12 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 hover:text-emerald-300">
                            Review Materials
                          </Button>
                        </Link>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
