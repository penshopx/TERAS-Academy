import { useListLearningCourses } from "@workspace/api-client-react";
import { isLearningCompleted } from "@/lib/learning-progress";
import { useParams, Link } from "wouter";
import { Activity, BookOpen, Clock, CheckCircle2, Circle, ChevronLeft } from "lucide-react";
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
      <div className="space-y-8 animate-in fade-in">
        <div className="space-y-4">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-10 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </div>
        <div className="space-y-4">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      </div>
    );
  }

  if (error || !courses) {
    return (
      <div className="flex h-full flex-col items-center justify-center text-center p-8 bg-destructive/10 rounded-xl">
        <Activity className="h-12 w-12 text-destructive mb-4" />
        <h2 className="text-xl font-bold text-destructive">Failed to Load Course</h2>
      </div>
    );
  }

  if (!course) {
    return (
      <div className="flex h-full flex-col items-center justify-center text-center p-12 bg-card/50 rounded-xl border border-border/50">
        <BookOpen className="h-12 w-12 text-muted-foreground mb-4" />
        <h2 className="text-xl font-bold text-foreground">Course Not Found</h2>
        <Link href="/learning" className="mt-4">
          <Button variant="outline">Return to Learning</Button>
        </Link>
      </div>
    );
  }

  // The first incomplete lesson is the learner's suggested location. All lessons
  // remain available because prerequisite enforcement is owned by the server.
  let foundIncomplete = false;

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-12">
      <div>
        <Link href="/learning" className="inline-flex items-center text-sm font-mono text-muted-foreground hover:text-primary transition-colors mb-6">
          <ChevronLeft className="h-4 w-4 mr-1" /> BACK TO LEARNING
        </Link>
        <div className="flex items-center gap-3 mb-3">
          <Badge variant="outline" className="font-mono bg-primary/10 text-primary border-primary/20">
            COURSE {course.sequence}
          </Badge>
          <Badge variant="secondary" className="uppercase text-[10px] tracking-wider">
            {course.status}
          </Badge>
        </div>
        <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight text-foreground">
          {course.title}
        </h1>
        <p className="text-muted-foreground mt-4 text-lg leading-relaxed max-w-3xl">
          {course.description}
        </p>
      </div>

      <div className="space-y-8 mt-10">
        {course.modules.map((module) => (
          <div key={module.id} className="relative">
            <div className="sticky top-0 z-10 bg-background/95 backdrop-blur py-4 border-b border-border/50 mb-4 flex items-center justify-between">
              <div>
                <p className="font-mono text-xs font-bold tracking-widest text-primary mb-1">
                  MODULE {module.sequence} • {module.moduleCode}
                </p>
                <h3 className="text-xl font-bold text-foreground">{module.moduleName}</h3>
              </div>
            </div>

            <div className="space-y-3 pl-2 md:pl-4">
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
                      group flex flex-col md:flex-row md:items-center gap-4 p-5 rounded-xl border transition-all duration-300
                      bg-card border-border/50 hover:border-primary/40
                      ${isCurrent ? 'ring-1 ring-primary/50 shadow-[0_0_15px_rgba(0,195,255,0.1)]' : ''}
                    `}
                  >
                    <div className="shrink-0 flex items-center justify-center w-10 h-10">
                      {lessonComplete ? (
                        <CheckCircle2 className="w-7 h-7 text-emerald-500" />
                      ) : (
                        <Circle className="w-6 h-6 text-primary/50" />
                      )}
                    </div>
                    
                    <div className="flex-1">
                      <p className="font-mono text-[10px] tracking-widest text-muted-foreground uppercase mb-1">
                        Lesson {lesson.sequence}
                      </p>
                      <h4 className="text-lg font-bold text-foreground mb-1 group-hover:text-primary transition-colors">
                        {lesson.title}
                      </h4>
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {lesson.description}
                      </p>
                    </div>

                    <div className="shrink-0 flex items-center gap-6 mt-4 md:mt-0">
                      <div className="flex flex-col items-end text-right">
                        <span className="text-xs font-mono font-medium text-muted-foreground flex items-center gap-1.5">
                          <Clock className="w-3 h-3" /> {lesson.estimatedDurationMinutes} MIN
                        </span>
                        <span className="text-[10px] font-mono text-muted-foreground/70 uppercase mt-1">
                          {completed.length} / {required.length} Activities
                        </span>
                      </div>
                      
                      <Link href={`/learning/lessons/${lesson.id}`}>
                        <Button 
                          variant={isCurrent ? "default" : "secondary"} 
                          className={`font-bold uppercase tracking-widest text-xs h-10 px-6 ${isCurrent ? 'shadow-[0_0_15px_rgba(0,195,255,0.3)]' : ''}`}
                        >
                          {lessonComplete ? 'Review' : isCurrent ? 'Continue' : 'View'}
                        </Button>
                      </Link>
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
