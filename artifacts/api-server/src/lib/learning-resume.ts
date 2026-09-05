import type { LearningState } from "./learning-transition";

type ResumeCourse = {
  id: string;
  modules: Array<{
    id: string;
    lessons: Array<{
      id: string;
      activities: Array<{
        id: string;
        required: boolean;
        currentState: LearningState;
      }>;
    }>;
  }>;
};

type StateMetadata = {
  createdAt: Date;
  eventId: string;
};

export type LearningResumeAction = {
  courseId: string;
  moduleId: string;
  lessonId: string;
  activityId: string;
};

const isIncomplete = (state: LearningState) =>
  state === "NOT_STARTED" || state === "IN_PROGRESS";

export function resolveLearningResumeAction(
  course: ResumeCourse,
  stateMetadata: ReadonlyMap<string, StateMetadata>,
): LearningResumeAction | undefined {
  let firstRequiredIncomplete: LearningResumeAction | undefined;
  let latestInProgress:
    | { action: LearningResumeAction; createdAt: Date; eventId: string }
    | undefined;

  for (const module of course.modules) {
    for (const lesson of module.lessons) {
      for (const activity of lesson.activities) {
        const action = {
          courseId: course.id,
          moduleId: module.id,
          lessonId: lesson.id,
          activityId: activity.id,
        };

        if (activity.required && isIncomplete(activity.currentState) && !firstRequiredIncomplete) {
          firstRequiredIncomplete = action;
        }

        if (activity.currentState !== "IN_PROGRESS") continue;
        const metadata = stateMetadata.get(activity.id);
        if (!metadata) continue;
        if (
          !latestInProgress ||
          latestInProgress.createdAt < metadata.createdAt ||
          (latestInProgress.createdAt.getTime() === metadata.createdAt.getTime() &&
            latestInProgress.eventId < metadata.eventId)
        ) {
          latestInProgress = { action, ...metadata };
        }
      }
    }
  }

  return latestInProgress?.action ?? firstRequiredIncomplete;
}