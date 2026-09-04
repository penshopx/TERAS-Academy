import assert from "node:assert/strict";
import { ApplyCourseAuthoringCommandBody, RequestManagedResourceUploadUrlBody } from "@workspace/api-zod";
import { allocatedSiblingSequence, assignmentAllows, orderedSiblingIds } from "./lib/course-authoring";
import { learnerCourseAvailable } from "./routes/learning";

// Fast contract coverage complements database integration tests: every UI action
// is represented by the generated contract and unsafe upload metadata is refused
// before a presigned URL can be issued.
for (const action of ["CREATE", "UPDATE", "REORDER", "DUPLICATE", "ARCHIVE"] as const) {
  for (const entity of ["COURSE", "COURSE_MODULE", "LESSON", "ACTIVITY", "OUTCOME", "RESOURCE"] as const) {
    assert.equal(ApplyCourseAuthoringCommandBody.safeParse({ action, entity, courseId: "course-1", id: "entity-1" }).success, true);
  }
}
assert.equal(RequestManagedResourceUploadUrlBody.safeParse({ name: "lesson.pdf", size: 1024, contentType: "application/pdf" }).success, true);
assert.equal(RequestManagedResourceUploadUrlBody.safeParse({ name: "../unsafe.pdf", size: 1024, contentType: "application/pdf" }).success, false);
assert.equal(RequestManagedResourceUploadUrlBody.safeParse({ name: "movie.exe", size: 1024, contentType: "application/octet-stream" }).success, false);
assert.equal(RequestManagedResourceUploadUrlBody.safeParse({ name: "large.mp4", size: 104857601, contentType: "video/mp4" }).success, false);

const siblings = [
  { id: "first", sequence: 1 },
  { id: "second", sequence: 2 },
  { id: "third", sequence: 3 },
];
assert.deepEqual(
  orderedSiblingIds(siblings, "second", { direction: "UP" }),
  ["second", "first", "third"],
  "UP swaps with the previous sibling",
);
assert.deepEqual(
  orderedSiblingIds(siblings, "second", { direction: "DOWN" }),
  ["first", "third", "second"],
  "DOWN swaps with the next sibling",
);
assert.deepEqual(
  orderedSiblingIds(siblings, "third", { sequence: 1 }),
  ["third", "first", "second"],
  "numeric sequence moves and normalizes the complete sibling set",
);
assert.throws(
  () => orderedSiblingIds(siblings, "cross-course", { direction: "UP" }),
  /not found in sibling set/,
);
assert.throws(
  () => orderedSiblingIds(siblings, "first", { direction: "SIDEWAYS" }),
  /UP or DOWN/,
);

assert.equal(
  learnerCourseAvailable({ status: "DRAFT", publishedVersionId: "version-1" }),
  true,
  "a mutable draft remains learner-visible through its immutable published version",
);
assert.equal(
  learnerCourseAvailable({ status: "ARCHIVED", publishedVersionId: "version-1" }),
  false,
  "intentional course archive removes learner availability",
);
assert.equal(
  learnerCourseAvailable({ status: "PUBLISHED", publishedVersionId: null }),
  false,
  "mutable status alone cannot expose an unpublished course",
);

const created: Array<{ id: string; sequence: number }> = [];
for (const id of ["one", "two", "three"]) {
  created.push({ id, sequence: allocatedSiblingSequence(created) });
}
assert.deepEqual(created.map(row => row.sequence), [1, 2, 3], "omitted sequences append without collisions");
assert.equal(allocatedSiblingSequence(created, 2), 2, "explicit insertion position is retained");

const assignments = [
  { trainerId: "trainer-a", programId: "program-a", pathwayId: "path-a", status: "active" },
  { trainerId: "trainer-a", programId: "program-b", pathwayId: "path-b", status: "active" },
  { trainerId: "trainer-b", programId: "program-c", pathwayId: "path-c", status: "inactive" },
];
assert.equal(assignmentAllows(assignments, "trainer-a", "program-a", "path-a"), true);
assert.equal(assignmentAllows(assignments, "trainer-a", "program-b", "path-b"), true, "multiple active assignments are supported");
assert.equal(assignmentAllows(assignments, "trainer-a", "program-c", "path-c"), false, "unrelated pathways are denied");
assert.equal(assignmentAllows(assignments, "trainer-b", "program-c", "path-c"), false, "inactive assignments are denied");