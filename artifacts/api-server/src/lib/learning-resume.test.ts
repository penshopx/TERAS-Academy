import assert from "node:assert/strict";
import test from "node:test";
import { resolveLearningResumeAction } from "./learning-resume";

const course = {
  id: "course-1",
  modules: [{
    id: "module-1",
    lessons: [
      {
        id: "lesson-1",
        activities: [
          { id: "activity-1", required: true, currentState: "NOT_STARTED" as const },
          { id: "activity-2", required: true, currentState: "IN_PROGRESS" as const },
        ],
      },
      {
        id: "lesson-2",
        activities: [
          { id: "activity-3", required: true, currentState: "IN_PROGRESS" as const },
        ],
      },
    ],
  }],
};

test("resumes the most recently active incomplete lesson", () => {
  const result = resolveLearningResumeAction(course, new Map([
    ["activity-2", { createdAt: new Date("2026-01-01T00:00:00Z"), eventId: "event-1" }],
    ["activity-3", { createdAt: new Date("2026-01-02T00:00:00Z"), eventId: "event-2" }],
  ]));

  assert.deepEqual(result, {
    courseId: "course-1",
    moduleId: "module-1",
    lessonId: "lesson-2",
    activityId: "activity-3",
  });
});

test("falls back to the first required incomplete activity for a new learner", () => {
  const freshCourse = structuredClone(course);
  freshCourse.modules[0].lessons[0].activities[1].currentState = "NOT_STARTED";
  freshCourse.modules[0].lessons[1].activities[0].currentState = "NOT_STARTED";

  assert.equal(
    resolveLearningResumeAction(freshCourse, new Map())?.activityId,
    "activity-1",
  );
});

test("returns no resume action after every required activity is complete", () => {
  const completedCourse = {
    ...course,
    modules: course.modules.map(module => ({
      ...module,
      lessons: module.lessons.map(lesson => ({
        ...lesson,
        activities: lesson.activities.map(activity => ({
          ...activity,
          currentState: "LEARNING_COMPLETED" as const,
        })),
      })),
    })),
  };

  assert.equal(resolveLearningResumeAction(completedCourse, new Map()), undefined);
});