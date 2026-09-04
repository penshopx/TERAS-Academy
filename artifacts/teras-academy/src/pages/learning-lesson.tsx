import { useListLearningCourses, useGetLearnerDashboard, useTransitionLearningState, LearningActivity, LearningState, getListLearningCoursesQueryKey } from "@workspace/api-client-react";
import { isLearningCompleted } from "@/lib/learning-progress";
import { useParams, Link } from "wouter";
import { Activity as ActivityIcon, CheckCircle2, ChevronLeft, PlayCircle, FileText, Video, Headphones, MessagesSquare, FileArchive, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import React, { useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { trackLearningAction, trackResourceOpened } from "@/lib/analytics";

type LearningResourceLinkProps = {
  activityId: string;
  resource: {
    id: string;
    title: string;
    type: string;
    uri?: string | null;
  };
};

export function LearningResourceLink({ activityId, resource }: LearningResourceLinkProps) {
  if (!resource.uri?.trim()) {
    return (
      <div
        className="flex items-center gap-4 p-4 rounded-xl border border-border/50 bg-muted/20 text-muted-foreground"
        data-testid={`activity-resource-unavailable-${resource.id}`}
      >
        <div className="w-8 h-8 rounded-lg bg-muted/50 flex items-center justify-center">
          <FileText className="w-4 h-4" />
        </div>
        <span className="text-sm font-semibold flex-1 truncate">{resource.title}</span>
        <span className="text-xs font-medium">Material not available yet</span>
      </div>
    );
  }

  return (
    <a
      href={resource.uri}
      onClick={() => trackResourceOpened({
        activityId,
        resourceId: resource.id,
        resourceType: resource.type,
      })}
      target="_blank"
      rel="noreferrer"
      className="flex items-center gap-4 p-4 rounded-xl border border-border/50 bg-background/50 hover:bg-muted/30 hover:border-primary/30 transition-all group/link"
      data-testid={`activity-resource-link-${resource.id}`}
    >
      <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary group-hover/link:bg-primary group-hover/link:text-black transition-colors">
        <ExternalLink className="w-4 h-4" />
      </div>
      <span className="text-sm font-semibold flex-1 truncate">{resource.title}</span>
    </a>
  );
}

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
      <div className="space-y-8 animate-in fade-in max-w-4xl mx-auto" data-testid="lesson-loading">
        <div className="space-y-4 border-b border-border/50 pb-8">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-12 w-3/4" />
          <Skeleton className="h-6 w-1/2" />
        </div>
        <div className="space-y-8 mt-12">
          <Skeleton className="h-48 w-full rounded-2xl" />
          <Skeleton className="h-48 w-full rounded-2xl" />
        </div>
      </div>
    );
  }

  if (coursesError || !courses || !dashboard) {
    return (
      <div className="flex h-[50vh] flex-col items-center justify-center text-center p-8 bg-destructive/10 rounded-xl border border-destructive/20 max-w-4xl mx-auto" data-testid="lesson-error">
        <ActivityIcon className="h-12 w-12 text-destructive mb-4" />
        <h2 className="text-xl font-bold text-destructive">Failed to Load Lesson</h2>
      </div>
    );
  }

  if (!context) {
    return (
      <div className="flex h-[50vh] flex-col items-center justify-center text-center p-12 bg-card/50 rounded-xl border border-border/50 max-w-4xl mx-auto" data-testid="lesson-not-found">
        <FileArchive className="h-12 w-12 text-muted-foreground mb-4" />
        <h2 className="text-xl font-bold text-foreground">Lesson Not Found</h2>
        <Button asChild variant="outline" className="mt-6 font-mono text-xs uppercase tracking-wider">
          <Link href="/learning" data-testid="link-back-to-learning">Return to Learning</Link>
        </Button>
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
        trackLearningAction({
          action: targetState === "IN_PROGRESS" ? "start_activity" : "complete_activity",
          location: "lesson_activity",
          courseId: course.id,
          moduleId: module.id,
          lessonId: lesson.id,
          activityId: activity.id,
        });
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

  // Find first incomplete activity
  let foundIncomplete = false;

  return (
    <div className="max-w-4xl mx-auto pb-24 animate-in fade-in slide-in-from-bottom-4 duration-500" data-testid="lesson-detail-page">
      <Link href={`/learning/courses/${course.id}`} className="inline-flex items-center text-xs font-mono font-bold tracking-wider text-muted-foreground hover:text-primary transition-colors mb-8" data-testid="link-back-to-course">
        <ChevronLeft className="h-4 w-4 mr-1" /> BACK TO COURSE
      </Link>

      <div className="mb-12 pb-8 border-b border-border/50">
        <div className="flex flex-wrap items-center gap-3 mb-5">
          <Badge variant="outline" className="font-mono bg-primary/10 text-primary border-primary/20 px-3 py-1" data-testid="lesson-module-badge">
            M{module.sequence} • L{lesson.sequence}
          </Badge>
          <Badge variant="secondary" className="uppercase text-[10px] tracking-widest font-mono px-3 py-1 bg-muted/50" data-testid="lesson-duration-badge">
            {lesson.estimatedDurationMinutes} MIN
          </Badge>
        </div>
        <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-foreground mb-6" data-testid="lesson-title">
          {lesson.title}
        </h1>
        <p className="text-muted-foreground text-lg leading-relaxed" data-testid="lesson-description">
          {lesson.description}
        </p>
      </div>

      {lesson.activities.length === 0 ? (
        <div className="rounded-2xl border border-border/50 bg-card/30 p-12 text-center" data-testid="lesson-empty">
          <FileArchive className="mx-auto h-12 w-12 text-muted-foreground/50 mb-6" />
          <h2 className="text-2xl font-bold text-foreground">No Activities Yet</h2>
          <p className="mt-3 text-muted-foreground">This lesson's learning materials have not been published.</p>
        </div>
      ) : (
      <div className="space-y-6 relative before:absolute before:inset-0 before:ml-[27px] md:before:ml-[39px] before:h-full before:w-px before:bg-gradient-to-b before:from-border/10 before:via-border/50 before:to-transparent" data-testid="activity-list">
        {lesson.activities.map((activity, index) => {
          const isCompleted = isLearningCompleted(activity.currentState);
          const isInProgress = activity.currentState === 'IN_PROGRESS';
          const isNotStarted = activity.currentState === 'NOT_STARTED';
          const isLoading = transitionMutation.isPending && activeActivityId === activity.id;

          const isCurrent = !isCompleted && !foundIncomplete;
          if (isCurrent && activity.required) foundIncomplete = true;

          return (
            <div key={activity.id} className="relative flex items-start gap-4 md:gap-8 group" data-testid={`activity-${activity.id}`}>
              {/* Timeline dot */}
              <div className="relative z-10 flex-shrink-0 mt-1" data-testid={`activity-dot-${activity.id}`}>
                <div className={`
                  flex items-center justify-center w-14 h-14 md:w-20 md:h-20 rounded-full border-4 transition-all duration-500 bg-background
                  ${isCompleted ? 'border-primary text-primary shadow-[0_0_20px_rgba(0,195,255,0.3)]' : ''}
                  ${isInProgress ? 'border-primary/50 text-primary' : ''}
                  ${isNotStarted ? 'border-border text-muted-foreground/50' : ''}
                `}>
                  {isCompleted ? (
                    <CheckCircle2 className="w-6 h-6 md:w-8 md:h-8" />
                  ) : isInProgress ? (
                    <ActivityIcon className="w-5 h-5 md:w-6 md:h-6 animate-pulse" />
                  ) : (
                    <span className="font-mono text-sm md:text-lg font-bold">{index + 1}</span>
                  )}
                </div>
              </div>

              {/* Activity Card */}
              <div className="flex-1 min-w-0 py-1">
                <div className={`
                  p-6 md:p-8 rounded-2xl border transition-all duration-300
                  ${isCompleted ? 'bg-primary/5 border-primary/20' : ''}
                  ${isInProgress ? 'bg-card border-primary/50 shadow-[0_5px_30px_-15px_rgba(0,195,255,0.3)]' : ''}
                  ${isNotStarted ? 'bg-card/30 border-border/50 hover:bg-card hover:border-border' : ''}
                `}>
                  <div className="flex flex-wrap items-center gap-3 mb-4">
                    <span className={`flex items-center justify-center w-10 h-10 rounded-xl ${
                      isCompleted ? 'bg-primary/20 text-primary' : isInProgress ? 'bg-primary/10 text-primary' : 'bg-muted/50 text-muted-foreground'
                    }`}>
                      {getActivityIcon(activity.type)}
                    </span>
                    <Badge variant="outline" className="font-mono bg-background border-border/50 text-xs px-3 py-1" data-testid={`activity-type-${activity.id}`}>
                      {activity.type}
                    </Badge>
                    {!activity.required && (
                      <Badge variant="secondary" className="font-mono text-[10px] tracking-widest bg-muted/30 text-muted-foreground" data-testid={`activity-optional-${activity.id}`}>OPTIONAL</Badge>
                    )}
                    <span className="ml-auto text-xs font-mono font-medium text-muted-foreground flex items-center gap-1.5" data-testid={`activity-duration-${activity.id}`}>
                      {activity.estimatedDurationMinutes} MIN
                    </span>
                  </div>

                  <h2 className="text-2xl font-bold text-foreground mb-3" data-testid={`activity-title-${activity.id}`}>{activity.title}</h2>
                  <p className="text-muted-foreground mb-8 leading-relaxed text-sm md:text-base" data-testid={`activity-description-${activity.id}`}>
                    {activity.description}
                  </p>

                  {/* Resources */}
                  {(isInProgress || isCompleted) && activity.resources && activity.resources.length > 0 && (
                    <div className="mb-8 space-y-3" data-testid={`activity-resources-${activity.id}`}>
                      <p className="text-[10px] font-mono font-bold tracking-[0.2em] text-muted-foreground uppercase flex items-center gap-2">
                        <FileText className="w-3 h-3" /> Learning Materials
                      </p>
                      <div className="grid gap-2">
                        {activity.resources.map(res => (
                          <LearningResourceLink
                            key={res.id}
                            activityId={activity.id}
                            resource={res}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Action Button */}
                  <div className="flex pt-2">
                    {isCompleted ? (
                      <div className="w-full flex items-center justify-between p-4 rounded-xl border border-primary/20 bg-primary/5" data-testid={`activity-completed-state-${activity.id}`}>
                        <div className="flex items-center gap-3">
                          <CheckCircle2 className="w-5 h-5 text-primary" />
                          <span className="font-mono text-sm font-bold text-primary tracking-wide">LEARNING COMPLETED</span>
                        </div>
                      </div>
                    ) : isInProgress ? (
                      <Button 
                        onClick={() => handleTransition(activity, 'LEARNING_COMPLETED')}
                        disabled={transitionMutation.isPending}
                        className="w-full md:w-auto font-bold uppercase tracking-widest text-xs h-14 px-10 shadow-[0_0_20px_rgba(0,195,255,0.2)] hover:shadow-[0_0_30px_rgba(0,195,255,0.4)] transition-all"
                        data-testid={`btn-mark-complete-${activity.id}`}
                      >
                        {isLoading ? <ActivityIcon className="w-5 h-5 mr-3 animate-spin" /> : <CheckCircle2 className="w-5 h-5 mr-3" />}
                        Mark as Completed
                      </Button>
                    ) : (
                      <Button 
                        onClick={() => handleTransition(activity, 'IN_PROGRESS')}
                        disabled={transitionMutation.isPending}
                        variant={isCurrent ? "default" : "secondary"}
                        className="w-full md:w-auto font-bold uppercase tracking-widest text-xs h-14 px-10 transition-all"
                        data-testid={`btn-start-activity-${activity.id}`}
                      >
                        {isLoading ? (
                          <ActivityIcon className="w-5 h-5 mr-3 animate-spin" />
                        ) : (
                          <PlayCircle className="w-5 h-5 mr-3" />
                        )}
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

      {/* Return to Course Button when lesson is complete */}
      {lesson.activities.length > 0 && lesson.activities.filter(a => a.required && !isLearningCompleted(a.currentState)).length === 0 && (
        <div className="mt-16 flex justify-center animate-in fade-in slide-in-from-bottom-8 duration-700">
          <Button asChild variant="outline" className="font-mono text-sm font-bold uppercase tracking-widest h-14 px-10 border-primary/30 text-primary hover:bg-primary hover:text-black transition-all">
            <Link href={`/learning/courses/${course.id}`} data-testid="link-lesson-finished-return">
              <ChevronLeft className="w-5 h-5 mr-2" /> Return to Course
            </Link>
          </Button>
        </div>
      )}
    </div>
  );
}
