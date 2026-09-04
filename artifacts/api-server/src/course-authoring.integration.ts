import assert from "node:assert/strict";
import {
  contentResourcesTable, courseAuthoringAuditTable, courseModulesTable, coursesTable,
  courseVersionsTable, db, enrollmentsTable, learningActivitiesTable, learningOutcomesTable,
  lessonsTable, managedResourceUploadsTable, modulesTable, pathwaysTable, peopleTable,
  personRolesTable, programsTable, readinessGatesTable,
} from "@workspace/db";
import { asc, eq, sql } from "drizzle-orm";
import { createIntegrationTestApp } from "./integration-test-app";
import { ObjectStorageService } from "./lib/objectStorage";

const suffix = crypto.randomUUID();
const ids = {
  trainerA: `author-trainer-a-${suffix}`, trainerB: `author-trainer-b-${suffix}`,
  learnerA: `author-learner-a-${suffix}`, learnerB: `author-learner-b-${suffix}`,
  programA: `author-program-a-${suffix}`, programB: `author-program-b-${suffix}`,
  pathwayA: `author-path-a-${suffix}`, pathwayB: `author-path-b-${suffix}`,
  moduleA: `author-module-a-${suffix}`, moduleB: `author-module-b-${suffix}`,
  courseA: `author-course-a-${suffix}`, courseB: `author-course-b-${suffix}`,
  enrollmentA: `author-enrollment-a-${suffix}`, enrollmentB: `author-enrollment-b-${suffix}`,
};
const objectPath = `/objects/uploads/${crypto.randomUUID()}`;
let storedOwner: string | null = null;

ObjectStorageService.prototype.getObjectEntityUploadURL = async () =>
  `https://storage.googleapis.com/test-bucket/private/uploads/${objectPath.split("/").at(-1)}`;
ObjectStorageService.prototype.normalizeObjectEntityPath = () => objectPath;
ObjectStorageService.prototype.verifyUploadedMetadata = async (_path, expected) => {
  assert.deepEqual(expected, { size: 12, mimeType: "application/pdf" });
};
ObjectStorageService.prototype.setPrivateOwner = async (_path, owner) => { storedOwner = owner; };
ObjectStorageService.prototype.ownerCanRead = async (_path, owner) => storedOwner === owner;
ObjectStorageService.prototype.getObjectEntityFile = async () => ({}) as never;
ObjectStorageService.prototype.downloadObject = async () =>
  new Response("protected test file", { headers: { "content-type": "application/pdf" } });

async function seed() {
  await db.insert(peopleTable).values([
    { id: ids.trainerA, name: "Trainer A", initials: "TA", email: `${ids.trainerA}@test.invalid`, role: "trainer", clerkUserId: `clerk-${ids.trainerA}` },
    { id: ids.trainerB, name: "Trainer B", initials: "TB", email: `${ids.trainerB}@test.invalid`, role: "trainer", clerkUserId: `clerk-${ids.trainerB}` },
    { id: ids.learnerA, name: "Learner A", initials: "LA", email: `${ids.learnerA}@test.invalid`, role: "learner" },
    { id: ids.learnerB, name: "Learner B", initials: "LB", email: `${ids.learnerB}@test.invalid`, role: "learner" },
  ]);
  await db.insert(personRolesTable).values([
    { personId: ids.trainerA, role: "trainer" }, { personId: ids.trainerB, role: "trainer" },
  ]);
  await db.insert(programsTable).values([
    { id: ids.programA, domain: "A", name: "Program A", description: "A", status: "active" },
    { id: ids.programB, domain: "B", name: "Program B", description: "B", status: "active" },
  ]);
  await db.insert(pathwaysTable).values([
    { id: ids.pathwayA, programId: ids.programA, name: "Path A", type: "Standard", outcome: "A" },
    { id: ids.pathwayB, programId: ids.programB, name: "Path B", type: "Standard", outcome: "B" },
  ]);
  await db.insert(modulesTable).values([
    { id: ids.moduleA, programId: ids.programA, pathwayId: ids.pathwayA, sequence: 1, code: "A1", name: "Module A", capability: "A", evidence: "A", learningOutcomes: [], theory: [] },
    { id: ids.moduleB, programId: ids.programB, pathwayId: ids.pathwayB, sequence: 1, code: "B1", name: "Module B", capability: "B", evidence: "B", learningOutcomes: [], theory: [] },
  ]);
  await db.insert(enrollmentsTable).values([
    { id: ids.enrollmentA, learnerId: ids.learnerA, programId: ids.programA, pathwayId: ids.pathwayA, trainerId: ids.trainerA },
    { id: ids.enrollmentB, learnerId: ids.learnerB, programId: ids.programB, pathwayId: ids.pathwayB, trainerId: ids.trainerB },
  ]);
  await db.insert(readinessGatesTable).values([
    { id: `gate-a-${suffix}`, programId: ids.programA, pathwayId: ids.pathwayA, sequence: 1, code: "A", name: "A", requirement: "A" },
    { id: `gate-b-${suffix}`, programId: ids.programB, pathwayId: ids.pathwayB, sequence: 1, code: "B", name: "B", requirement: "B" },
  ]);
}

async function run() {
  await seed();
  let active = "A";
  const app = createIntegrationTestApp(() => ({
    userId: `clerk-${active === "A" ? ids.trainerA : ids.trainerB}`, role: "trainer",
  }));
  const server = await new Promise<ReturnType<typeof app.listen>>(resolve => {
    const listener = app.listen(0, () => resolve(listener));
  });
  const address = server.address();
  assert(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}/api`;
  const request = (path: string, body?: unknown, method = body === undefined ? "GET" : "POST") =>
    fetch(`${base}${path}`, { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const command = async (body: Record<string, unknown>, expected = 201) => {
    const response = await request("/trainer/authoring/commands", body);
    const payload = await response.json() as Record<string, unknown>;
    assert.equal(response.status, expected, JSON.stringify(payload));
    return payload;
  };
  try {
    await command({ action: "CREATE", entity: "COURSE", id: ids.courseA, courseId: ids.courseA, data: { programId: ids.programA, pathwayId: ids.pathwayA, title: "Course A", description: "Draft A", sequence: 1 } });
    active = "B";
    await command({ action: "CREATE", entity: "COURSE", id: ids.courseB, courseId: ids.courseB, data: { programId: ids.programB, pathwayId: ids.pathwayB, title: "Course B", description: "Draft B", sequence: 1 } });

    let response = await request("/trainer/authoring/courses");
    let payload = await response.json() as Array<{ id: string }>;
    assert.deepEqual(payload.map(row => row.id), [ids.courseB], "list must be pathway-scoped");
    for (const path of [
      `/trainer/authoring/courses/${ids.courseA}/preview`,
      `/trainer/authoring/courses/${ids.courseA}/versions`,
      `/trainer/authoring/courses/${ids.courseA}/audit`,
    ]) {
      response = await request(path);
      assert.equal(response.status, 403, `${path} must reject cross-pathway access`);
    }
    response = await request(`/trainer/authoring/courses/${ids.courseA}/publish`, {});
    assert.equal(response.status, 403, "publish must reject cross-pathway access");
    response = await request("/trainer/authoring/commands", { action: "UPDATE", entity: "COURSE", id: ids.courseA, courseId: ids.courseA, data: { title: "stolen" } });
    assert.equal(response.status, 403, "commands must reject cross-pathway access");

    active = "A";
    const link = await command({ action: "CREATE", entity: "COURSE_MODULE", courseId: ids.courseA, data: { moduleId: ids.moduleA } });
    const lessonOne = await command({ action: "CREATE", entity: "LESSON", courseId: ids.courseA, data: { courseModuleId: link.id, title: "Lesson one", description: "First lesson" } });
    const lessonTwo = await command({ action: "CREATE", entity: "LESSON", courseId: ids.courseA, data: { courseModuleId: link.id, title: "Lesson two", description: "Second lesson" } });
    const activity = await command({ action: "CREATE", entity: "ACTIVITY", courseId: ids.courseA, data: { lessonId: lessonOne.id, title: "Activity", description: "Required reading", type: "READING" } });
    await command({ action: "CREATE", entity: "OUTCOME", courseId: ids.courseA, data: { activityId: activity.id, capabilityModuleId: ids.moduleA, description: "Outcome", verificationMethod: "Review" } });
    await command({ action: "CREATE", entity: "RESOURCE", courseId: ids.courseA, data: { activityId: activity.id, type: "TEXT", title: "Text", content: "Safe text" } });

    await command({ action: "REORDER", entity: "LESSON", id: lessonTwo.id, courseId: ids.courseA, data: { direction: "UP" } }, 200);
    let lessons = await db.select().from(lessonsTable).orderBy(asc(lessonsTable.sequence));
    assert.deepEqual(lessons.map(row => row.id), [lessonTwo.id, lessonOne.id], "reorder must be atomic and normalized");

    const duplicate = await command({ action: "DUPLICATE", entity: "LESSON", id: lessonOne.id, courseId: ids.courseA, data: { title: "Lesson copy" } });
    await command({ action: "ARCHIVE", entity: "LESSON", id: duplicate.id, courseId: ids.courseA }, 200);
    await command({ action: "ARCHIVE", entity: "LESSON", id: lessonTwo.id, courseId: ids.courseA }, 200);

    response = await request("/storage/uploads/request-url", { name: "guide.pdf", size: 12, contentType: "application/pdf" });
    assert.equal(response.status, 200, await response.text());
    active = "B";
    response = await request("/trainer/authoring/commands", { action: "CREATE", entity: "RESOURCE", courseId: ids.courseA, data: { activityId: activity.id, type: "PDF", title: "Stolen", objectPath, mimeType: "application/pdf" } });
    assert.equal(response.status, 403, "managed file command must reject another pathway");
    active = "A";
    await command({ action: "CREATE", entity: "RESOURCE", courseId: ids.courseA, data: { activityId: activity.id, type: "PDF", title: "Guide", objectPath, mimeType: "application/pdf" } });
    assert.equal(storedOwner, ids.trainerA, "upload claim must assign private ownership");
    response = await request(`/storage${objectPath}`);
    assert.equal(response.status, 404, "draft managed resources must not be served");

    await db.execute(sql`CREATE FUNCTION reject_authoring_publish() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'forced publish rollback'; END $$`);
    await db.execute(sql`CREATE TRIGGER reject_authoring_publish BEFORE INSERT ON teras_course_authoring_audit FOR EACH ROW WHEN (NEW.action = 'PUBLISH') EXECUTE FUNCTION reject_authoring_publish()`);
    response = await request(`/trainer/authoring/courses/${ids.courseA}/publish`, {});
    assert.equal(response.status, 500, "forced audit failure must fail publish");
    assert.equal((await db.select().from(courseVersionsTable)).length, 0, "failed publish must roll back version");
    assert.equal((await db.select().from(coursesTable).where(eq(coursesTable.id, ids.courseA)))[0].status, "DRAFT", "failed publish must roll back course status");
    await db.execute(sql`DROP TRIGGER reject_authoring_publish ON teras_course_authoring_audit`);

    response = await request(`/trainer/authoring/courses/${ids.courseA}/publish`, {});
    assert.equal(response.status, 201, await response.text());
    const firstVersion = (await db.select().from(courseVersionsTable))[0];
    const firstSnapshot = firstVersion.snapshot;
    response = await request(`/storage${objectPath}`);
    assert.equal(response.status, 200, "owner must receive a published protected resource");
    assert.equal(await response.text(), "protected test file");
    active = "B";
    response = await request(`/storage${objectPath}`);
    assert.equal(response.status, 403, "other trainer must not read protected resource");
    active = "A";

    await command({ action: "UPDATE", entity: "LESSON", id: lessonOne.id, courseId: ids.courseA, data: { title: "Edited after publish" } }, 200);
    assert.deepEqual((await db.select().from(courseVersionsTable).where(eq(courseVersionsTable.id, firstVersion.id)))[0].snapshot, firstSnapshot, "editing after publish must not mutate snapshot");

    await db.execute(sql`CREATE FUNCTION delay_authoring_edit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_sleep(0.2); RETURN NEW; END $$`);
    await db.execute(sql`CREATE TRIGGER delay_authoring_edit BEFORE UPDATE ON teras_lessons FOR EACH ROW WHEN (NEW.title = 'Edit racing publish') EXECUTE FUNCTION delay_authoring_edit()`);
    const racingEdit = command({ action: "UPDATE", entity: "LESSON", id: lessonOne.id, courseId: ids.courseA, data: { title: "Edit racing publish" } }, 200);
    await new Promise(resolve => setTimeout(resolve, 40));
    const racingPublishResponse = await request(`/trainer/authoring/courses/${ids.courseA}/publish`, {});
    await racingEdit;
    const racingPublish = await racingPublishResponse.json() as { id: string; authoringRevision: number };
    assert.equal(racingPublishResponse.status, 201, JSON.stringify(racingPublish));
    const racingVersion = (await db.select().from(courseVersionsTable).where(eq(courseVersionsTable.id, racingPublish.id)))[0];
    assert.equal(
      (racingVersion.snapshot as { modules: Array<{ lessons: Array<{ title: string }> }> }).modules[0].lessons.some(lesson => lesson.title === "Edit racing publish"),
      true,
      "publish waiting behind an edit must snapshot that completed authoring revision",
    );
    assert.equal((racingVersion.snapshot as { authoringRevision: number }).authoringRevision, racingPublish.authoringRevision, "published snapshot must identify the authoring revision reported to the trainer");
    await db.execute(sql`DROP TRIGGER delay_authoring_edit ON teras_lessons`);

    const legacyResourceId = `legacy-resource-${suffix}`;
    await db.execute(sql`CREATE FUNCTION delay_legacy_resource_edit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_sleep(0.2); RETURN NEW; END $$`);
    await db.execute(sql`CREATE TRIGGER delay_legacy_resource_edit BEFORE INSERT ON teras_content_resources FOR EACH ROW EXECUTE FUNCTION delay_legacy_resource_edit()`);
    active = "B";
    response = await request("/learning/resources", { id: `forbidden-resource-${suffix}`, activityId: activity.id, type: "TEXT", title: "Forbidden", content: "Forbidden", sequence: 99 });
    assert.equal(response.status, 403, "legacy resource creation must enforce owning course scope");
    active = "A";
    const legacyResourceEdit = request("/learning/resources", { id: legacyResourceId, activityId: activity.id, type: "TEXT", title: "Legacy route resource", content: "Serialized", sequence: 99 });
    await new Promise(resolve => setTimeout(resolve, 40));
    const legacyPublishResponse = await request(`/trainer/authoring/courses/${ids.courseA}/publish`, {});
    assert.equal((await legacyResourceEdit).status, 201, "legacy resource route must create through the locked authoring path");
    const legacyPublish = await legacyPublishResponse.json() as { id: string };
    assert.equal(legacyPublishResponse.status, 201, JSON.stringify(legacyPublish));
    const legacyVersion = (await db.select().from(courseVersionsTable).where(eq(courseVersionsTable.id, legacyPublish.id)))[0];
    assert.equal(JSON.stringify(legacyVersion.snapshot).includes(legacyResourceId), true, "publish must wait for resource writes through the legacy endpoint");
    await db.execute(sql`DROP TRIGGER delay_legacy_resource_edit ON teras_content_resources`);

    const parallelPublishes = await Promise.all([
      request(`/trainer/authoring/courses/${ids.courseA}/publish`, {}),
      request(`/trainer/authoring/courses/${ids.courseA}/publish`, {}),
    ]);
    const parallelPayloads = await Promise.all(parallelPublishes.map(async publishResponse => {
      const publishPayload = await publishResponse.json() as { id?: string; version?: number; error?: string };
      assert.equal(publishResponse.status, 201, JSON.stringify(publishPayload));
      return publishPayload;
    }));
    assert.deepEqual(parallelPayloads.map(row => row.version).sort(), [4, 5], "parallel publishes must receive sequential versions");
    const versions = await (await request(`/trainer/authoring/courses/${ids.courseA}/versions`)).json() as Array<{ id: string; version: number }>;
    assert.deepEqual(versions.map(row => row.version), [5, 4, 3, 2, 1]);
    assert.equal(new Set(versions.map(row => row.version)).size, versions.length, "published versions must remain unique");
    const publishedCourse = (await db.select().from(coursesTable).where(eq(coursesTable.id, ids.courseA)))[0];
    assert.equal(
      publishedCourse.publishedVersionId,
      versions.find(row => row.version === 5)?.id,
      "course must point at the latest serialized publish",
    );
    const audit = await (await request(`/trainer/authoring/courses/${ids.courseA}/audit`)).json() as Array<{ action: string }>;
    assert(audit.some(row => row.action === "PUBLISH") && audit.some(row => row.action === "REORDER_LESSON"));

    await command({ action: "ARCHIVE", entity: "COURSE", id: ids.courseA, courseId: ids.courseA }, 200);
    response = await request(`/storage${objectPath}`);
    assert.equal(response.status, 404, "archived course must stop protected serving");
    assert.equal((await db.select().from(managedResourceUploadsTable).where(eq(managedResourceUploadsTable.objectPath, objectPath)))[0].claimedAt instanceof Date, true);
    assert.equal((await db.select().from(contentResourcesTable).where(eq(contentResourcesTable.objectPath, objectPath))).length, 1);
    assert.equal((await db.select().from(courseAuthoringAuditTable).where(eq(courseAuthoringAuditTable.courseId, ids.courseA))).length > 0, true);
    assert.equal((await db.select().from(courseModulesTable).where(eq(courseModulesTable.courseId, ids.courseA))).length, 1);
    assert.equal((await db.select().from(learningActivitiesTable).where(eq(learningActivitiesTable.id, String(activity.id)))).length, 1);
    assert.equal((await db.select().from(learningOutcomesTable)).length > 0, true);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
}

await run();