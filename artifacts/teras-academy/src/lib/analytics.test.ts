import assert from "node:assert/strict";
import test from "node:test";
import { trackLearningAction } from "./analytics";

type TestUmami = {
  track(name: string, data?: Record<string, string | number | boolean>): void;
};

function setTestWindow(umami?: TestUmami): void {
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { umami },
  });
}

function clearTestWindow(): void {
  Reflect.deleteProperty(globalThis, "window");
}

test.afterEach(clearTestWindow);

test("dispatches the anonymous learning action contract to the injected tracker", () => {
  const calls: Array<{
    name: string;
    data?: Record<string, string | number | boolean>;
  }> = [];

  setTestWindow({
    track(name, data) {
      calls.push({ name, data });
    },
  });

  trackLearningAction({
    action: "continue_learning",
    location: "learning_list_next_action",
    courseId: "course-1",
    moduleId: "module-2",
    lessonId: "lesson-3",
    activityId: "activity-4",
  });

  assert.deepStrictEqual(calls, [{
    name: "learning_action",
    data: {
      action: "continue_learning",
      location: "learning_list_next_action",
      course_id: "course-1",
      module_id: "module-2",
      lesson_id: "lesson-3",
      activity_id: "activity-4",
    },
  }]);
});

test("remains a safe no-op when the injected tracker is unavailable", () => {
  setTestWindow();

  assert.doesNotThrow(() => {
    trackLearningAction({
      action: "open_lesson",
      location: "course_lesson_list",
      courseId: "course-1",
      lessonId: "lesson-3",
    });
  });
});

test("does not interrupt learning when the injected tracker throws", () => {
  setTestWindow({
    track() {
      throw new Error("tracker unavailable");
    },
  });

  assert.doesNotThrow(() => {
    trackLearningAction({
      action: "complete_activity",
      location: "lesson_activity",
      courseId: "course-1",
      moduleId: "module-2",
      lessonId: "lesson-3",
      activityId: "activity-4",
    });
  });
});