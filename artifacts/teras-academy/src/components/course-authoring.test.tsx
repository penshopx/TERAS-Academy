import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { CourseVersion } from "@workspace/api-client-react";
import { PublishedVersionHistory, PublishSuccessMessage } from "./trainer/authoring/validation-panel";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const sources = [
  "trainer/authoring/course-authoring.tsx",
  "trainer/authoring/course-selector.tsx",
  "trainer/authoring/authoring-tree.tsx",
  "trainer/authoring/authoring-editor.tsx",
  "trainer/authoring/validation-panel.tsx",
];

test("Course authoring uses authored course endpoints, NOT learning endpoints", async () => {
  const contents = await Promise.all(
    sources.map(file => readFile(path.join(__dirname, file), "utf8"))
  );
  
  const allContent = contents.join("\n");
  
  // Must use useListAuthoredCourses, not useListLearningCourses
  assert.match(allContent, /useListAuthoredCourses/);
  assert.doesNotMatch(allContent, /useListLearningCourses/);
  
  // Must invalidate properly
  assert.match(allContent, /getListAuthoredCoursesQueryKey\(\)/);
  assert.match(allContent, /getPreviewAuthoredCourseQueryKey\(/);
  
  // Must have required fields and direct upload
  assert.match(allContent, /metadata\.practiceTaskId/);
  assert.match(allContent, /capabilityModuleId/);
  assert.match(allContent, /useRequestManagedResourceUploadUrl/);
  assert.match(allContent, /fetch\(uploadURL, \{/);
  assert.match(allContent, /method: "PUT"/);
  
  // Must have history/audit logic
  assert.match(allContent, /useListAuthoredCourseVersions/);
  assert.match(allContent, /useListCourseAuthoringAudit/);
  
  // Accessibility and test IDs
  assert.match(allContent, /data-testid="tab-history"/);
  assert.match(allContent, /data-testid="button-create-course-dialog"/);
  assert.match(allContent, /data-testid="input-course-title"/);
  assert.match(allContent, /data-testid="select-activity-type"/);
});

test("trainer desk avoids learner-only condition requests", async () => {
  const trainerCode = await readFile(path.join(__dirname, "../pages/trainer.tsx"), "utf8");
  assert.doesNotMatch(trainerCode, /LearnerCondition/);
});

test("Adding COURSE_MODULE requires canonical moduleId payload", async () => {
  const code = await readFile(path.join(__dirname, "trainer/authoring/authoring-tree.tsx"), "utf8");
  assert.match(code, /moduleId: newModuleId\.trim\(\)/);
  assert.match(code, /data-testid="input-new-module-id"/);
  assert.match(code, /DialogTitle>Add Course Module/);
  assert.match(code, /canonical Module ID from the capability pathway catalog/);
});

test("Course create dialog collects all required topological metadata", async () => {
  const code = await readFile(path.join(__dirname, "trainer/authoring/course-selector.tsx"), "utf8");
  assert.match(code, /programId: newProgramId\.trim\(\)/);
  assert.match(code, /pathwayId: newPathwayId\.trim\(\)/);
  assert.match(code, /sequence: newSequence \? Number\(newSequence\) : undefined/);
  assert.match(code, /data-testid="input-new-course-program"/);
  assert.match(code, /data-testid="input-new-course-pathway"/);
  assert.match(code, /data-testid="input-new-course-sequence"/);
  assert.match(code, /data-testid="error-course-create"/);
});

function courseVersion(overrides: Partial<CourseVersion> = {}): CourseVersion {
  return {
    id: "version-1",
    courseId: "course-1",
    version: 3,
    authoringRevision: 17,
    lifecycle: "PUBLISHED",
    publishedAt: "2026-09-04T08:30:00.000Z",
    ...overrides,
  };
}

test("publish success displays the non-zero authoring revision returned by the API", () => {
  const response = courseVersion({ authoringRevision: 17, version: 3 });
  const markup = renderToStaticMarkup(<PublishSuccessMessage version={response} />);

  assert.match(markup, /Authoring revision 17 was published as immutable version 3\./);
});

test("published version history displays the authoring revision returned by the API", () => {
  const response = [courseVersion({ id: "version-current", authoringRevision: 17 })];
  const markup = renderToStaticMarkup(<PublishedVersionHistory versions={response} />);

  assert.match(markup, /data-testid="text-authoring-revision-version-current"/);
  assert.match(markup, /Authoring revision: 17/);
});

test("published version history labels revision zero as a legacy version", () => {
  const response = [courseVersion({ id: "version-legacy", authoringRevision: 0 })];
  const markup = renderToStaticMarkup(<PublishedVersionHistory versions={response} />);

  assert.match(markup, /data-testid="text-authoring-revision-version-legacy"/);
  assert.match(markup, /Authoring revision: Legacy version/);
  assert.doesNotMatch(markup, /Authoring revision: 0/);
});
