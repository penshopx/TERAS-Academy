import { useListLearningCourses } from "@workspace/api-client-react";
import { isLearningCompleted } from "@/lib/learning-progress";
import { useParams, Link } from "wouter";
import { Activity, Clock, CheckCircle2, Circle, ChevronLeft, ChevronRight, LayoutList } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useMemo } from "react";

export default function LearningCourseDetail() {
  const { courseId } = useParams();
  const { data: courses, isLoading, error } = useListLearningCourses();

  const course = useMemo(() => {
    return courses?.find((c) => c.id === courseId);
  }, [courses, courseId]);

  if (isLoading) {
    return (
      <div className="space-y-8 animate-in fade-in max-w-5xl mx-auto" data-testid="course-detail-loading">
        <div className="space-y-4">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-10 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </div>
        <div className="space-y-6 mt-12">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      </div>
    );
  }

  if (error || !courses) {
    return (
      <div className="flex h-[50vh] flex-col items-center justify-center text-center p-8 bg-destructive/10 rounded-xl max-w-5xl mx-auto border border-destructive/20" data-testid="course-detail-error">
        <Activity className="h-12 w-12 text-destructive mb-4" />
        <h2 className="text-xl font-bold text-destructive">Failed to Load Course</h2>
      </div>
    );
  }

  if (!course) {
    return (
      <div className="flex h-[50vh] flex-col items-center justify-center text-center p-12 bg-card/50 rounded-xl border border-border/50 max-w-5xl mx-auto" data-testid="course-not-found">
        <LayoutList className="h-12 w-12 text-muted-foreground mb-4" />
        <h2 className="text-xl font-bold text-foreground">Course Not Found</h2>
        <Button asChild variant="outline" className="mt-6 font-mono text-xs uppercase tracking-wider">
          <Link href="/learning" data-testid="link-back-to-learning">Return to Learning</Link>
        </Button>
      </div>
    );
  }

  let foundIncomplete = false;

  return (
    <div className="space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-16 max-w-5xl mx-auto" data-testid="course-detail-page">
      <div className="border-b border-border/50 pb-8">
        <Link href="/learning" className="inline-flex items-center text-xs font-mono font-bold tracking-wider text-muted-foreground hover:text-primary transition-colors mb-8" data-testid="link-back-to-learning">
          <ChevronLeft className="h-4 w-4 mr-1" /> BACK TO LEARNING
        </Link>
        <div className="flex items-center gap-3 mb-4">
          <Badge variant="outline" className="font-mono bg-primary/10 text-primary border-primary/20 px-3 py-1" data-testid="course-sequence-badge">
            COURSE {course.sequence}
          </Badge>
          <Badge variant="secondary" className="uppercase text-[10px] tracking-widest px-3 py-1 bg-muted/50 text-muted-foreground" data-testid="course-status-badge">
            {course.status}
          </Badge>
        </div>
        <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-foreground" data-testid="course-title">
          {course.title}
        </h1>
        <p className="text-muted-foreground mt-6 text-lg leading-relaxed max-w-3xl" data-testid="course-description">
          {course.description}
        </p>
      </div>

      <div className="space-y-12" data-testid="course-modules-list">
        {course.modules.map((module) => (
          <div key={module.id} className="relative" data-testid={`module-${module.id}`}>
            <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-md py-4 border-b border-border mb-6 flex items-center justify-between">
              <div>
                <p className="font-mono text-[10px] font-bold tracking-[0.2em] text-primary mb-2 flex items-center gap-2" data-testid={`module-code-${module.id}`}>
                  <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse"></span>
                  MODULE {module.sequence} • {module.moduleCode}
                </p>
                <h2 className="text-2xl font-bold text-foreground tracking-tight" data-testid={`module-name-${module.id}`}>{module.moduleName}</h2>
              </div>
            </div>

            <div className="space-y-4 pl-2 md:pl-6 relative">
              <div className="absolute left-[27px] top-4 bottom-4 w-px bg-border/40 hidden md:block"></div>
              {module.lessons.map((lesson) => {
                const required = lesson.activities.filter(a => a.required);
                const completed = required.filter(a => isLearningCompleted(a.currentState));
                const lessonComplete = required.length > 0 && completed.length === required.length;
                const isCurrent = !lessonComplete && !foundIncomplete;
                if (isCurrent) foundIncomplete = true;

                return (
                  <div 
                    key={lesson.id} 
                    className={`
                      group flex flex-col md:flex-row md:items-stretch gap-0 rounded-xl border transition-all duration-300 overflow-hidden relative z-10
                      ${isCurrent ? 'bg-card border-primary/50 shadow-[0_5px_30px_-15px_rgba(0,195,255,0.3)] ring-1 ring-primary/20' : 'bg-card/30 border-border/50 hover:bg-card hover:border-border'}
                    `}
                    data-testid={`lesson-${lesson.id}`}
                  >
                    <div className={`
                      shrink-0 flex items-center justify-center p-4 md:w-16 border-b md:border-b-0 md:border-r transition-colors
                      ${isCurrent ? 'bg-primary/5 border-primary/20' : 'bg-muted/10 border-border/50'}
                    `}>
                      {lessonComplete ? (
                        <CheckCircle2 className="w-6 h-6 text-primary drop-shadow-[0_0_8px_rgba(0,195,255,0.5)]" data-testid={`lesson-complete-icon-${lesson.id}`} />
                      ) : isCurrent ? (
                        <Circle className="w-6 h-6 text-primary animate-pulse" data-testid={`lesson-current-icon-${lesson.id}`} />
                      ) : (
                        <Circle className="w-6 h-6 text-muted-foreground/30" data-testid={`lesson-incomplete-icon-${lesson.id}`} />
                      )}
                    </div>
                    
                    <div className="flex-1 p-5 md:p-6 flex flex-col justify-center">
                      <div className="flex items-center gap-2 mb-2">
                        <p className="font-mono text-[10px] font-bold tracking-widest text-muted-foreground uppercase" data-testid={`lesson-sequence-${lesson.id}`}>
                          Lesson {lesson.sequence}
                        </p>
                        {isCurrent && (
                          <span className="font-mono text-[9px] font-bold bg-primary/20 text-primary px-2 py-0.5 rounded uppercase tracking-wider">UP NEXT</span>
                        )}
                      </div>
                      <h3 className="text-xl font-bold text-foreground mb-2 group-hover:text-primary transition-colors" data-testid={`lesson-title-${lesson.id}`}>
                        {lesson.title}
                      </h3>
                      <p className="text-sm text-muted-foreground line-clamp-2 leading-relaxed" data-testid={`lesson-description-${lesson.id}`}>
                        {lesson.description}
                      </p>
                    </div>

                    <div className="shrink-0 flex flex-row md:flex-col items-center justify-between md:justify-center gap-4 p-5 md:p-6 bg-muted/5 border-t md:border-t-0 md:border-l border-border/50 md:w-48">
                      <div className="flex flex-col md:items-end text-left md:text-right">
                        <span className="text-xs font-mono font-bold text-muted-foreground flex items-center gap-1.5" data-testid={`lesson-duration-${lesson.id}`}>
                          <Clock className="w-3.5 h-3.5" /> {lesson.estimatedDurationMinutes} MIN
                        </span>
                        <span className="text-[10px] font-mono text-muted-foreground/70 uppercase mt-1.5 tracking-wider" data-testid={`lesson-progress-${lesson.id}`}>
                          {completed.length} / {required.length} Activities
                        </span>
                      </div>
                      
                      <Button
                        asChild
                          variant={isCurrent ? "default" : "secondary"} 
                          className={`w-full font-bold uppercase tracking-widest text-[10px] h-9 px-6 transition-all ${isCurrent ? 'shadow-[0_0_15px_rgba(0,195,255,0.3)] hover:shadow-[0_0_20px_rgba(0,195,255,0.4)]' : 'hover:bg-primary/10 hover:text-primary'}`}
                      >
                        <Link href={`/learning/lessons/${lesson.id}`} data-testid={`link-lesson-${lesson.id}`}>
                          {lessonComplete ? 'Review' : isCurrent ? 'Continue' : 'View'}
                          <ChevronRight className="w-3.5 h-3.5 ml-1.5" />
                        </Link>
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
