import { LearningCourse, LearningState } from "@workspace/api-client-react";

export function isLearningCompleted(state: LearningState): boolean {
  return state !== 'NOT_STARTED' && state !== 'IN_PROGRESS';
}

export function isOutcomeVerified(state: LearningState): boolean {
  return !['NOT_STARTED', 'IN_PROGRESS', 'LEARNING_COMPLETED'].includes(state);
}

export function computeCourseProgress(course: LearningCourse) {
  let requiredCount = 0;
  let completedCount = 0;
  let firstIncompleteAction: { courseId: string; moduleId: string; lessonId: string; activityId: string } | null = null;

  for (const module of course.modules) {
    for (const lesson of module.lessons) {
      for (const activity of lesson.activities) {
        if (activity.required) {
          requiredCount++;
          if (isLearningCompleted(activity.currentState)) {
            completedCount++;
          } else if (!firstIncompleteAction) {
            firstIncompleteAction = {
              courseId: course.id,
              moduleId: module.id,
              lessonId: lesson.id,
              activityId: activity.id,
            };
          }
        }
      }
    }
  }

  const percentage = requiredCount === 0 ? 0 : Math.round((completedCount / requiredCount) * 100);
  return {
    requiredCount,
    completedCount,
    percentage,
    firstIncompleteAction
  };
}
