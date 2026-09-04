import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const learningSources = [
  "../pages/learning-list.tsx",
  "../pages/learning-course.tsx",
  "../pages/learning-lesson.tsx",
];

test("learning pages keep a clear learning-only information architecture", async () => {
  const [list, course, lesson] = await Promise.all(
    learningSources.map(path => readFile(new URL(path, import.meta.url), "utf8")),
  );
  const content = [list, course, lesson].join("\n");

  assert.match(list, /My Learning/);
  assert.match(list, /Continue Learning/);
  assert.match(list, /Learning Progress/);
  assert.match(list, /Next Action/);
  assert.match(course, /MODULE \{module\.sequence\}/);
  assert.match(course, /Lesson \{lesson\.sequence\}/);
  assert.match(lesson, /activity-list/);
  assert.match(course, /<h1[^>]*data-testid="course-title"/);
  assert.match(course, /<h2[^>]*data-testid=\{`module-name-/);
  assert.match(course, /<h3[^>]*data-testid=\{`lesson-title-/);
  assert.match(lesson, /<h1[^>]*data-testid="lesson-title"/);
  assert.match(lesson, /<h2[^>]*data-testid=\{`activity-title-/);
  assert.match(list, /data-testid=\{`link-course-resume-/);
  assert.match(course, /data-testid=\{`link-lesson-/);
  assert.match(lesson, /data-testid=\{`btn-start-activity-/);
  assert.match(lesson, /data-testid=\{`btn-mark-complete-/);

  for (const forbidden of [
    "Requires outcome verification",
    "Outcome verified",
    "Awaiting verification",
    "Capability readiness",
    "Open evidence",
    "Open practice",
    "View readiness",
    "activity.nextAction",
  ]) {
    assert.doesNotMatch(content, new RegExp(forbidden.replace(".", "\\."), "i"));
  }
});