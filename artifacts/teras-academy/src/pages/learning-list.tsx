import { useListLearningCourses } from "@workspace/api-client-react";
import { computeCourseProgress } from "@/lib/learning-progress";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { BookOpen, PlayCircle, Clock, ChevronRight, Activity, Route } from "lucide-react";
import { Link } from "wouter";
import { Skeleton } from "@/components/ui/skeleton";
import { trackLearningAction } from "@/lib/analytics";

export default function LearningList() {
  const { data: courses, isLoading, error } = useListLearningCourses();

  if (isLoading) {
    return (
      <div className="space-y-6 max-w-5xl mx-auto" data-testid="learning-list-loading">
        <div className="space-y-2">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-5 w-96" />
        </div>
        <div className="grid gap-6">
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      </div>
    );
  }

  if (error || !courses) {
    return (
      <div className="flex h-[50vh] flex-col items-center justify-center p-8 text-center bg-destructive/10 border border-destructive/20 rounded-xl max-w-5xl mx-auto" data-testid="learning-list-error">
        <Activity className="h-12 w-12 text-destructive mb-4" />
        <h2 className="text-xl font-bold text-destructive">Failed to Load Learning</h2>
        <p className="text-sm text-destructive/70 mt-2">Could not retrieve learning courses at this time.</p>
      </div>
    );
  }

  if (courses.length === 0) {
    return (
      <div className="flex h-[50vh] flex-col items-center justify-center p-12 text-center border border-border/50 rounded-xl bg-card/50 max-w-5xl mx-auto" data-testid="learning-list-empty">
        <BookOpen className="h-12 w-12 text-muted-foreground mb-4" />
        <h2 className="text-xl font-bold text-foreground">No Courses Found</h2>
        <p className="text-sm text-muted-foreground mt-2 max-w-md">
          You are not currently enrolled in any learning courses. Check your Learning Plan or Programs to begin.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-5xl mx-auto pb-12" data-testid="learning-list-page">
      <div className="border-b border-border/50 pb-6">
        <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 mb-4">
          <span className="flex h-2 w-2 rounded-full bg-primary animate-pulse"></span>
          <span className="font-mono text-[10px] font-bold tracking-[0.2em] text-primary">MY LEARNING</span>
        </div>
        <h1 className="text-4xl font-extrabold tracking-tight text-foreground flex items-center gap-3">
          My Learning
        </h1>
        <p className="text-muted-foreground mt-3 text-lg max-w-2xl leading-relaxed">
          Track your required learning activities and resume exactly where you left off.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-8" data-testid="course-list">
        {courses.map((course) => {
          const progress = computeCourseProgress(course);
          const resumeAction = course.resumeAction ?? progress.firstIncompleteAction;
          
          let totalMinutes = 0;
          course.modules.forEach(m => m.lessons.forEach(l => totalMinutes += l.estimatedDurationMinutes));

          const isCompleted = progress.percentage === 100;
          const isStarted = progress.hasStarted;

          return (
            <Card key={course.id} className="overflow-hidden border-border/50 hover:border-primary/40 transition-all duration-300 bg-card/40 backdrop-blur-sm relative group" data-testid={`course-card-${course.id}`}>
              {isCompleted && (
                <div className="absolute top-0 right-0 w-16 h-16 overflow-hidden z-10" data-testid={`course-completed-badge-${course.id}`}>
                  <div className="absolute top-6 -right-6 bg-primary/20 text-primary text-[10px] font-bold uppercase tracking-wider py-1 w-24 text-center rotate-45 border-y border-primary/30 shadow-[0_0_10px_rgba(0,195,255,0.2)]">
                    Done
                  </div>
                </div>
              )}
              
              <CardContent className="p-0">
                <div className="grid grid-cols-1 md:grid-cols-[1fr_340px] divide-y md:divide-y-0 md:divide-x divide-border/50">
                  <div className="p-6 md:p-8 space-y-5">
                    <div className="flex items-center gap-3">
                      <Badge variant="outline" className="font-mono bg-primary/10 text-primary border-primary/20" data-testid={`course-sequence-${course.id}`}>
                        COURSE {course.sequence}
                      </Badge>
                      <Badge variant={course.status === 'ACTIVE' ? 'default' : 'secondary'} className="uppercase text-[10px] tracking-wider" data-testid={`course-status-${course.id}`}>
                        {course.status}
                      </Badge>
                    </div>
                    
                    <div>
                      <Link href={`/learning/courses/${course.id}`} className="inline-block" data-testid={`link-course-title-${course.id}`}>
                        <h2 className="text-2xl md:text-3xl font-bold text-foreground group-hover:text-primary transition-colors flex items-center gap-2">
                          {course.title}
                          <ChevronRight className="h-6 w-6 opacity-0 -translate-x-4 group-hover:opacity-100 group-hover:translate-x-0 transition-all text-primary" />
                        </h2>
                      </Link>
                      <p className="text-muted-foreground mt-3 text-sm leading-relaxed max-w-2xl line-clamp-2">
                        {course.description}
                      </p>
                    </div>

                    <div className="flex items-center gap-6 text-xs font-mono text-muted-foreground pt-4 border-t border-border/30">
                      <span className="flex items-center gap-2">
                        <Route className="h-4 w-4 text-primary/70" />
                        {course.modules.length} MODULES
                      </span>
                      <span className="flex items-center gap-2" data-testid={`course-duration-${course.id}`}>
                        <Clock className="h-4 w-4 text-primary/70" />
                        ~{Math.round(totalMinutes / 60)} HOURS
                      </span>
                    </div>
                  </div>

                  <div className="bg-muted/5 p-6 md:p-8 flex flex-col justify-center space-y-8">
                    <div className="space-y-3">
                      <div className="flex justify-between items-end">
                        <span className="text-xs font-mono font-bold tracking-wider text-muted-foreground uppercase">Learning Progress</span>
                        <span className="text-3xl font-bold text-primary font-mono drop-shadow-[0_0_10px_rgba(0,195,255,0.3)]" data-testid={`course-progress-percentage-${course.id}`}>{progress.percentage}%</span>
                      </div>
                      <Progress value={progress.percentage} className="h-2 bg-muted/30" data-testid={`course-progress-bar-${course.id}`} />
                      <div className="flex justify-between text-[10px] text-muted-foreground font-mono mt-2 tracking-wider">
                        <span data-testid={`course-progress-completed-${course.id}`}>{progress.completedCount} COMPLETED</span>
                        <span data-testid={`course-progress-required-${course.id}`}>{progress.requiredCount} REQUIRED</span>
                      </div>
                    </div>

                    <div className="space-y-3 pt-2">
                      <p className="text-[10px] font-mono font-bold tracking-[0.2em] text-muted-foreground uppercase">
                        Next Action
                      </p>
                      {resumeAction ? (
                        <Button asChild className="w-full font-bold uppercase tracking-widest text-xs h-14 shadow-[0_0_20px_rgba(0,195,255,0.15)] hover:shadow-[0_0_30px_rgba(0,195,255,0.3)] transition-all">
                          <Link
                            href={`/learning/lessons/${resumeAction.lessonId}`}
                            onClick={() => trackLearningAction({
                              action: isStarted ? "continue_learning" : "start_course",
                              location: "learning_list_next_action",
                              courseId: course.id,
                               moduleId: resumeAction.moduleId,
                               lessonId: resumeAction.lessonId,
                               activityId: resumeAction.activityId,
                            })}
                            data-testid={`link-course-resume-${course.id}`}
                          >
                            {isStarted ? (
                              <><PlayCircle className="w-5 h-5 mr-2" /> Continue Learning</>
                            ) : (
                              <><PlayCircle className="w-5 h-5 mr-2" /> Start Course</>
                            )}
                          </Link>
                        </Button>
                      ) : (
                        <Button asChild variant="outline" className="w-full font-bold uppercase tracking-widest text-xs h-14 border-primary/30 text-primary hover:bg-primary/10 hover:text-primary">
                          <Link href={`/learning/courses/${course.id}`} data-testid={`link-course-review-${course.id}`}>
                            Review Materials
                          </Link>
                        </Button>
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
