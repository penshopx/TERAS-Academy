import { useListLearningCourses, useGetLearnerDashboard, useTransitionLearningState, LearningActivity, LearningState, getListLearningCoursesQueryKey } from "@workspace/api-client-react";
import { isLearningCompleted, isOutcomeVerified } from "@/lib/learning-progress";
import { useParams, Link } from "wouter";
import { Activity as ActivityIcon, CheckCircle2, ChevronLeft, PlayCircle, FileText, Video, Headphones, MessagesSquare, FileArchive, ArrowRight, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

export default function LearningLessonDetail() {
  const { lessonId } = useParams();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const { data: courses, isLoading: loadingCourses, error: coursesError } = useListLearningCourses();
  const { data: dashboard, isLoading: loadingDashboard } = useGetLearnerDashboard();
  const transitionMutation = useTransitionLearningState();

  const [activeActivityId, setActiveActivityId] = useState<string | null>(null);
  const idempotencyKeys = useRef(new Map<string, string>());

  const context = useMemo(() => {
    if (!courses) return null;
    for (const course of courses) {
      for (const module of course.modules) {
        for (const lesson of module.lessons) {
          if (lesson.id === lessonId) {
            return { course, module, lesson };
          }
        }
      }
    }
    return null;
  }, [courses, lessonId]);

  if (loadingCourses || loadingDashboard) {
    return (
      <div className="space-y-8 animate-in fade-in max-w-4xl mx-auto">
        <div className="space-y-4">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-6 w-3/4" />
        </div>
        <div className="space-y-6 mt-12">
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      </div>
    );
  }

  if (coursesError || !courses || !dashboard) {
    return (
      <div className="flex h-full flex-col items-center justify-center text-center p-8 bg-destructive/10 rounded-xl">
        <ActivityIcon className="h-12 w-12 text-destructive mb-4" />
        <h2 className="text-xl font-bold text-destructive">Failed to Load Lesson</h2>
      </div>
    );
  }

  if (!context) {
    return (
      <div className="flex h-full flex-col items-center justify-center text-center p-12 bg-card/50 rounded-xl border border-border/50">
        <FileArchive className="h-12 w-12 text-muted-foreground mb-4" />
        <h2 className="text-xl font-bold text-foreground">Lesson Not Found</h2>
        <Link href="/learning" className="mt-4">
          <Button variant="outline">Return to Learning</Button>
        </Link>
      </div>
    );
  }

  const { course, module, lesson } = context;
  const learnerId = dashboard.learner.id;

  const handleTransition = (activity: LearningActivity, targetState: LearningState) => {
    setActiveActivityId(activity.id);
    
    const reason = targetState === 'IN_PROGRESS' ? 'Learner started activity' : 'Learner marked complete';
    
    const actionKey = `${activity.id}:${activity.currentState}:${targetState}`;
    const idempotencyKey = idempotencyKeys.current.get(actionKey) ?? crypto.randomUUID();
    idempotencyKeys.current.set(actionKey, idempotencyKey);

    transitionMutation.mutate({
      data: {
        currentState: activity.currentState,
        targetState: targetState,
        learnerId,
        pathwayId: course.pathwayId,
        programId: course.programId,
        activityId: activity.id,
        entityReference: activity.id,
        reason,
        idempotencyKey
      }
    }, {
      onSuccess: async () => {
        idempotencyKeys.current.delete(actionKey);
        await queryClient.invalidateQueries({ queryKey: getListLearningCoursesQueryKey() });
        setActiveActivityId(null);
        toast({
          title: targetState === 'IN_PROGRESS' ? 'Activity Started' : 'Activity Completed',
          description: targetState === 'IN_PROGRESS' ? 'You can now access the materials.' : 'Your progress has been saved.',
        });
      },
      onError: (err) => {
        setActiveActivityId(null);
        toast({
          title: 'Update Failed',
          description: 'Could not update your progress. Please try again.',
          variant: 'destructive'
        });
        console.error(err);
      }
    });
  };

  const getActivityIcon = (type: string) => {
    switch(type) {
      case 'VIDEO': return <Video className="w-5 h-5" />;
      case 'AUDIO': return <Headphones className="w-5 h-5" />;
      case 'DISCUSSION': return <MessagesSquare className="w-5 h-5" />;
      default: return <FileText className="w-5 h-5" />;
    }
  };

  return (
    <div className="max-w-4xl mx-auto pb-24 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <Link href={`/learning/courses/${course.id}`} className="inline-flex items-center text-sm font-mono text-muted-foreground hover:text-primary transition-colors mb-8">
        <ChevronLeft className="h-4 w-4 mr-1" /> BACK TO COURSE
      </Link>
      
      <div className="mb-10">
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <Badge variant="outline" className="font-mono bg-primary/5 text-primary border-primary/20">
            M{module.sequence} • L{lesson.sequence}
          </Badge>
          <Badge variant="secondary" className="uppercase text-[10px] tracking-wider font-mono">
            {lesson.estimatedDurationMinutes} MIN
          </Badge>
        </div>
        <h1 className="text-3xl md:text-5xl font-extrabold tracking-tight text-foreground mb-4">
          {lesson.title}
        </h1>
        <p className="text-muted-foreground text-lg leading-relaxed">
          {lesson.description}
        </p>
        <div className="mt-6 grid gap-3 border-y border-border/50 py-4 text-sm sm:grid-cols-3">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Learning progress</p>
            <p className="mt-1 font-semibold text-foreground">Activity completion</p>
          </div>
          <div>
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Learning achievement</p>
            <p className="mt-1 font-semibold text-foreground">Requires outcome verification</p>
          </div>
          <div>
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Capability readiness</p>
            <p className="mt-1 font-semibold text-foreground">Evaluated separately</p>
          </div>
        </div>
      </div>

      {lesson.activities.length === 0 ? (
        <div className="rounded-xl border border-border/50 bg-card/50 p-10 text-center">
          <FileArchive className="mx-auto h-10 w-10 text-muted-foreground" />
          <h2 className="mt-4 text-lg font-bold text-foreground">No activities published</h2>
          <p className="mt-2 text-sm text-muted-foreground">This lesson does not have learning activities yet.</p>
        </div>
      ) : (
      <div className="space-y-6 relative before:absolute before:inset-0 before:ml-[27px] before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-border/10 before:via-border/50 before:to-border/10">
        {lesson.activities.map((activity, index) => {
          const isCompleted = isLearningCompleted(activity.currentState);
          const isVerified = isOutcomeVerified(activity.currentState);
          const isInProgress = activity.currentState === 'IN_PROGRESS';
          const isNotStarted = activity.currentState === 'NOT_STARTED';
          const isLoading = transitionMutation.isPending && activeActivityId === activity.id;

          return (
            <div key={activity.id} className="relative flex items-start md:justify-between group">
              {/* Timeline dot */}
              <div className="absolute left-0 md:left-1/2 md:-translate-x-1/2 flex items-center justify-center w-14 h-14 bg-background z-10">
                <div className={`
                  flex items-center justify-center w-10 h-10 rounded-full border-2 transition-all duration-300
                  ${isVerified ? 'bg-emerald-500/10 border-emerald-500 text-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.2)]' : ''}
                  ${isCompleted && !isVerified ? 'bg-primary/10 border-primary text-primary shadow-[0_0_15px_rgba(0,195,255,0.2)]' : ''}
                  ${isInProgress ? 'bg-background border-primary text-primary ring-4 ring-primary/20' : ''}
                  ${isNotStarted ? 'bg-muted/30 border-muted-foreground/30 text-muted-foreground' : ''}
                `}>
                  {(isCompleted || isVerified) ? <CheckCircle2 className="w-5 h-5" /> : <span className="font-mono text-sm font-bold">{index + 1}</span>}
                </div>
              </div>

              {/* Activity Card */}
              <div className={`
                w-full pl-20 md:w-[calc(50%-2.5rem)] md:pl-0 
                ${index % 2 === 0 ? 'md:pr-10 md:text-right md:ml-0' : 'md:pl-10 md:mr-0 md:ml-auto'}
              `}>
                <div className={`
                  p-6 rounded-2xl border transition-all duration-300
                  ${isVerified ? 'bg-emerald-500/5 border-emerald-500/20' : ''}
                  ${isCompleted && !isVerified ? 'bg-primary/5 border-primary/20' : ''}
                  ${isInProgress ? 'bg-card border-primary/50 shadow-[0_5px_30px_-15px_rgba(0,195,255,0.3)]' : ''}
                  ${isNotStarted ? 'bg-card/50 border-border/50 hover:bg-card hover:border-border' : ''}
                `}>
                  <div className={`flex items-center gap-3 mb-3 ${index % 2 === 0 ? 'md:justify-end' : ''}`}>
                    <span className={`flex items-center justify-center w-8 h-8 rounded-lg ${
                      isCompleted ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'
                    }`}>
                      {getActivityIcon(activity.type)}
                    </span>
                    <Badge variant="outline" className="font-mono bg-background">
                      {activity.type}
                    </Badge>
                    {!activity.required && (
                      <Badge variant="secondary" className="font-mono text-[10px] bg-muted/50">OPTIONAL</Badge>
                    )}
                  </div>

                  <h3 className="text-xl font-bold text-foreground mb-2">{activity.title}</h3>
                  <p className="text-sm text-muted-foreground mb-6 line-clamp-3 md:line-clamp-none">
                    {activity.description}
                  </p>

                  {/* Resources */}
                  {(isInProgress || isCompleted) && activity.resources && activity.resources.length > 0 && (
                    <div className="mb-6 space-y-2 text-left">
                      <p className="text-xs font-mono font-bold tracking-widest text-muted-foreground uppercase mb-3">Materials</p>
                      {activity.resources.map(res => (
                        <a 
                          key={res.id} 
                          href={res.uri || "#"} 
                          target="_blank" 
                          rel="noreferrer"
                          className="flex items-center gap-3 p-3 rounded-lg border border-border/50 bg-background/50 hover:bg-muted/50 hover:border-border transition-colors group/link"
                        >
                          <FileText className="w-4 h-4 text-primary/70 group-hover/link:text-primary" />
                          <span className="text-sm font-medium flex-1 truncate">{res.title}</span>
                          <ExternalLink className="w-3.5 h-3.5 text-muted-foreground opacity-50 group-hover/link:opacity-100" />
                        </a>
                      ))}
                    </div>
                  )}

                  {/* Action Button */}
                  <div className={`flex ${index % 2 === 0 ? 'md:justify-end' : ''}`}>
                    {isCompleted ? (
                      <div className="space-y-3 rounded-lg border border-border/50 bg-background/60 px-4 py-3 text-left">
                        <div className="flex items-center gap-2 text-xs font-bold text-primary">
                          <CheckCircle2 className="w-4 h-4" /> LEARNING COMPLETE
                        </div>
                        <div className={`text-[10px] font-mono font-bold tracking-wider ${isVerified ? 'text-emerald-400' : 'text-amber-400'}`}>
                          OUTCOME {isVerified ? 'VERIFIED' : 'AWAITING VERIFICATION'}
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-foreground">{activity.nextAction.title}</p>
                          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{activity.nextAction.description}</p>
                        </div>
                        {activity.nextAction.href && (
                          <Link href={activity.nextAction.href}>
                            <Button size="sm" variant="secondary" className="mt-1 w-full font-mono text-[10px] font-bold uppercase tracking-wider">
                              {activity.nextAction.action === "SUBMIT_EVIDENCE" ? "Open evidence" : activity.nextAction.action === "VIEW_READINESS" ? "View readiness" : "Open practice"}
                              <ArrowRight className="ml-2 h-3.5 w-3.5" />
                            </Button>
                          </Link>
                        )}
                      </div>
                    ) : isInProgress ? (
                      <Button 
                        onClick={() => handleTransition(activity, 'LEARNING_COMPLETED')}
                        disabled={transitionMutation.isPending}
                        className="w-full md:w-auto font-bold uppercase tracking-widest text-xs h-12 px-8 shadow-[0_0_20px_rgba(0,195,255,0.2)] hover:shadow-[0_0_30px_rgba(0,195,255,0.4)] transition-all"
                      >
                        {isLoading ? <ActivityIcon className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
                        Mark Complete
                      </Button>
                    ) : (
                      <Button 
                        onClick={() => handleTransition(activity, 'IN_PROGRESS')}
                        disabled={transitionMutation.isPending}
                        variant="secondary"
                        className="w-full md:w-auto font-bold uppercase tracking-widest text-xs h-12 px-8 group-hover:bg-primary group-hover:text-primary-foreground transition-colors"
                      >
                        {isLoading ? <ActivityIcon className="w-4 h-4 mr-2 animate-spin" /> : <PlayCircle className="w-4 h-4 mr-2" />}
                        Start Activity
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      )}
    </div>
  );
}
