import { AsyncLocalStorage } from "node:async_hooks";
import { and, count, eq, gt, max, ne, sql } from "drizzle-orm";
import {
  contentResourcesTable, courseAuthoringAuditTable, courseModulesTable, coursesTable, courseVersionsTable,
  db as rootDb, enrollmentsTable, learningActivitiesTable, learningOutcomesTable, lessonsTable, managedResourceUploadsTable, modulesTable, practiceTasksTable, readinessGatesTable,
} from "@workspace/db";
import { validateResourceUri } from "./resource-uri";
import { ObjectStorageService } from "./objectStorage";

const id = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;
const authoringTransaction = new AsyncLocalStorage<typeof rootDb>();
const db = new Proxy(rootDb, {
  get(_target, property) {
    const target = authoringTransaction.getStore() ?? rootDb;
    const value = Reflect.get(target, property, target);
    return typeof value === "function" ? value.bind(target) : value;
  },
});

async function withCourseAuthoringLock<T>(courseId: string, work: () => Promise<T>) {
  if (authoringTransaction.getStore()) return work();
  return rootDb.transaction(async tx => authoringTransaction.run(tx as unknown as typeof rootDb, async () => {
    // A transaction-scoped advisory lock covers both existing courses and
    // concurrent create attempts, and is shared by every edit/publish path.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${courseId}, 0))`);
    return work();
  }));
}
type Entity = "COURSE" | "COURSE_MODULE" | "LESSON" | "ACTIVITY" | "OUTCOME" | "RESOURCE";
type Issue = { code: string; message: string; entityId: string | null };
type Command = { action: "CREATE" | "UPDATE" | "REORDER" | "DUPLICATE" | "ARCHIVE"; entity: Entity; id?: string; courseId: string; data?: Record<string, unknown> };
type Sequenced = { id: string; sequence: number };
export function orderedSiblingIds(rows: Sequenced[], entityId: string, input: { direction?: unknown; sequence?: unknown }) {
  const ordered = [...rows].sort((a, b) => a.sequence - b.sequence || a.id.localeCompare(b.id));
  const from = ordered.findIndex(row => row.id === entityId);
  if (from < 0) throw new Error("Authoring entity not found in sibling set");
  const direction = input.direction;
  if (direction !== undefined && direction !== "UP" && direction !== "DOWN") throw new Error("direction must be UP or DOWN");
  const requested = input.sequence === undefined ? undefined : integer(input.sequence, "sequence");
  if (direction === undefined && requested === undefined) throw new Error("REORDER requires direction or sequence");
  const target = direction === "UP" ? Math.max(0, from - 1) : direction === "DOWN" ? Math.min(ordered.length - 1, from + 1) : Math.min(ordered.length - 1, Math.max(0, requested! - 1));
  const [moved] = ordered.splice(from, 1); ordered.splice(target, 0, moved);
  return ordered.map(row => row.id);
}
export function allocatedSiblingSequence(rows: Sequenced[], requested?: unknown) {
  if (requested === undefined) return Math.max(0, ...rows.map(row => row.sequence)) + 1;
  return Math.min(rows.length + 1, Math.max(1, integer(requested, "sequence")!));
}
export function assignmentAllows(assignments: Array<{ trainerId: string | null; programId: string; pathwayId: string; status: string }>, trainerId: string, programId: string, pathwayId: string) {
  return assignments.some(row => row.status === "active" && row.trainerId === trainerId && row.programId === programId && row.pathwayId === pathwayId);
}
export async function trainerHasAssignment(trainerId: string, programId: string, pathwayId: string) {
  const [assignment] = await db.select({ id: enrollmentsTable.id }).from(enrollmentsTable).where(and(
    eq(enrollmentsTable.trainerId, trainerId), eq(enrollmentsTable.programId, programId),
    eq(enrollmentsTable.pathwayId, pathwayId), eq(enrollmentsTable.status, "active"),
  )).limit(1);
  return Boolean(assignment);
}
async function openSiblingPosition(entity: Entity, parentId: string, target: number, insert: (tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) => Promise<unknown>) {
  await db.transaction(async tx => {
    if (entity === "COURSE_MODULE") {
      await tx.execute(sql`UPDATE teras_course_modules SET sequence = -sequence WHERE course_id = ${parentId}`);
      await tx.execute(sql`UPDATE teras_course_modules SET sequence = CASE WHEN -sequence >= ${target} THEN -sequence + 1 ELSE -sequence END WHERE course_id = ${parentId}`);
    } else if (entity === "LESSON") {
      await tx.execute(sql`UPDATE teras_lessons SET sequence = -sequence WHERE course_module_id = ${parentId}`);
      await tx.execute(sql`UPDATE teras_lessons SET sequence = CASE WHEN -sequence >= ${target} THEN -sequence + 1 ELSE -sequence END WHERE course_module_id = ${parentId}`);
    } else if (entity === "ACTIVITY") {
      await tx.execute(sql`UPDATE teras_learning_activities SET sequence = -sequence WHERE lesson_id = ${parentId}`);
      await tx.execute(sql`UPDATE teras_learning_activities SET sequence = CASE WHEN -sequence >= ${target} THEN -sequence + 1 ELSE -sequence END WHERE lesson_id = ${parentId}`);
    } else if (entity === "OUTCOME") {
      await tx.execute(sql`UPDATE teras_learning_outcomes SET sequence = -sequence WHERE activity_id = ${parentId}`);
      await tx.execute(sql`UPDATE teras_learning_outcomes SET sequence = CASE WHEN -sequence >= ${target} THEN -sequence + 1 ELSE -sequence END WHERE activity_id = ${parentId}`);
    } else if (entity === "RESOURCE") {
      await tx.execute(sql`UPDATE teras_content_resources SET sequence = -sequence WHERE activity_id = ${parentId}`);
      await tx.execute(sql`UPDATE teras_content_resources SET sequence = CASE WHEN -sequence >= ${target} THEN -sequence + 1 ELSE -sequence END WHERE activity_id = ${parentId}`);
    }
    await insert(tx);
  });
}

const string = (value: unknown, name: string, optional = false) => {
  if (optional && value === undefined) return undefined;
  if (typeof value !== "string" || !value.trim()) throw new Error(`${name} is required`);
  return value.trim();
};
const integer = (value: unknown, name: string, optional = false) => {
  if (optional && value === undefined) return undefined;
  if (!Number.isInteger(value) || (value as number) < 0) throw new Error(`${name} must be a non-negative integer`);
  return value as number;
};
const bool = (value: unknown, name: string, fallback?: boolean) => {
  if (value === undefined && fallback !== undefined) return fallback;
  if (typeof value !== "boolean") throw new Error(`${name} must be a boolean`);
  return value;
};
const object = (value: unknown) => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const storage = new ObjectStorageService();

export async function claimManagedObject(objectPath: string | null, actorId: string) {
  if (!objectPath) return;
  const [grant] = await db.select().from(managedResourceUploadsTable).where(and(
    eq(managedResourceUploadsTable.objectPath, objectPath), eq(managedResourceUploadsTable.trainerId, actorId),
    gt(managedResourceUploadsTable.expiresAt, new Date()),
  )).limit(1);
  if (!grant || grant.claimedAt) throw new Error("objectPath was not issued to this trainer or has expired");
  await storage.verifyUploadedMetadata(objectPath, { size: grant.size, mimeType: grant.mimeType });
  await storage.setPrivateOwner(objectPath, actorId);
  await db.update(managedResourceUploadsTable).set({ claimedAt: new Date() }).where(eq(managedResourceUploadsTable.objectPath, objectPath));
}

async function reorderEntity(aggregate: NonNullable<Awaited<ReturnType<typeof authoredCourse>>>, entity: Entity, entityId: string, data: Record<string, unknown>) {
  let siblings: Sequenced[];
  let update: (tx: Parameters<Parameters<typeof db.transaction>[0]>[0], id: string, sequence: number) => Promise<unknown>;
  if (entity === "COURSE_MODULE") {
    const current = aggregate.links.find(row => row.id === entityId)!; siblings = aggregate.links;
    update = (tx, id, sequence) => tx.update(courseModulesTable).set({ sequence }).where(and(eq(courseModulesTable.id, id), eq(courseModulesTable.courseId, current.courseId)));
  } else if (entity === "LESSON") {
    const current = aggregate.lessons.find(row => row.id === entityId)!; siblings = aggregate.lessons.filter(row => row.courseModuleId === current.courseModuleId);
    update = (tx, id, sequence) => tx.update(lessonsTable).set({ sequence }).where(and(eq(lessonsTable.id, id), eq(lessonsTable.courseModuleId, current.courseModuleId)));
  } else if (entity === "ACTIVITY") {
    const current = aggregate.activities.find(row => row.id === entityId)!; siblings = aggregate.activities.filter(row => row.lessonId === current.lessonId);
    update = (tx, id, sequence) => tx.update(learningActivitiesTable).set({ sequence }).where(and(eq(learningActivitiesTable.id, id), eq(learningActivitiesTable.lessonId, current.lessonId)));
  } else if (entity === "OUTCOME") {
    const current = aggregate.outcomes.find(row => row.id === entityId)!; siblings = aggregate.outcomes.filter(row => row.activityId === current.activityId);
    update = (tx, id, sequence) => tx.update(learningOutcomesTable).set({ sequence }).where(and(eq(learningOutcomesTable.id, id), eq(learningOutcomesTable.activityId, current.activityId)));
  } else if (entity === "RESOURCE") {
    const current = aggregate.resources.find(row => row.id === entityId)!; siblings = aggregate.resources.filter(row => row.activityId === current.activityId);
    update = (tx, id, sequence) => tx.update(contentResourcesTable).set({ sequence }).where(and(eq(contentResourcesTable.id, id), eq(contentResourcesTable.activityId, current.activityId)));
  } else throw new Error("This entity cannot be reordered");
  const idOrder = orderedSiblingIds(siblings, entityId, data);
  await db.transaction(async tx => {
    for (let index = 0; index < idOrder.length; index++) await update(tx, idOrder[index], -(index + 1));
    for (let index = 0; index < idOrder.length; index++) await update(tx, idOrder[index], index + 1);
  });
}

export async function authoredCourse(courseId: string) {
  const [course] = await db.select().from(coursesTable).where(eq(coursesTable.id, courseId)).limit(1);
  if (!course) return null;
  // These queries also run while a publish transaction owns one connection, so
  // keep them sequential instead of issuing concurrent client.query calls.
  const links = await db.select().from(courseModulesTable).where(eq(courseModulesTable.courseId, courseId));
  const lessons = await db.select().from(lessonsTable).where(eq(lessonsTable.pathwayId, course.pathwayId));
  const activities = await db.select().from(learningActivitiesTable).where(eq(learningActivitiesTable.pathwayId, course.pathwayId));
  const outcomes = await db.select().from(learningOutcomesTable);
  const resources = await db.select().from(contentResourcesTable);
  const modules = await db.select().from(modulesTable).where(eq(modulesTable.pathwayId, course.pathwayId));
  const linkIds = new Set(links.map(row => row.id));
  const courseLessons = lessons.filter(row => linkIds.has(row.courseModuleId));
  const lessonIds = new Set(courseLessons.map(row => row.id));
  const courseActivities = activities.filter(row => lessonIds.has(row.lessonId));
  const activityIds = new Set(courseActivities.map(row => row.id));
  return { course, links, lessons: courseLessons, activities: courseActivities, outcomes: outcomes.filter(row => activityIds.has(row.activityId)), resources: resources.filter(row => activityIds.has(row.activityId)), modules };
}

export async function validateCourse(courseId: string) {
  const aggregate = await authoredCourse(courseId);
  if (!aggregate) return null;
  const errors: Issue[] = [], warnings: Issue[] = [];
  const { course, links, lessons, activities, outcomes, resources, modules } = aggregate;
  const moduleById = new Map(modules.map(row => [row.id, row]));
  const linkById = new Map(links.map(row => [row.id, row]));
  const lessonById = new Map(lessons.map(row => [row.id, row]));
  const activityById = new Map(activities.map(row => [row.id, row]));
  const tasks = await db.select().from(practiceTasksTable);
  const gates = await db.select().from(readinessGatesTable).where(eq(readinessGatesTable.pathwayId, course.pathwayId));
  if (!course.title.trim()) errors.push({ code: "COURSE_TITLE_REQUIRED", message: "Course title is required.", entityId: course.id });
  if (!links.length) errors.push({ code: "COURSE_MODULE_REQUIRED", message: "A published course needs at least one module link.", entityId: course.id });
  for (const link of links) {
    const module = moduleById.get(link.moduleId);
    if (!module || module.pathwayId !== course.pathwayId || module.programId !== course.programId)
      errors.push({ code: "MODULE_MAPPING_INVALID", message: "Course module must belong to the course program and pathway.", entityId: link.id });
    if (!lessons.some(row => row.courseModuleId === link.id && row.status !== "ARCHIVED"))
      errors.push({ code: "LESSON_REQUIRED", message: "Each active course module needs a lesson.", entityId: link.id });
  }
  for (const lesson of lessons) {
    if (!linkById.has(lesson.courseModuleId)) errors.push({ code: "LESSON_PARENT_INVALID", message: "Lesson is not linked to this course.", entityId: lesson.id });
    if (lesson.status !== "ARCHIVED" && !activities.some(row => row.lessonId === lesson.id && row.status !== "ARCHIVED"))
      errors.push({ code: "ACTIVITY_REQUIRED", message: "Each active lesson needs an activity.", entityId: lesson.id });
  }
  for (const activity of activities) {
    const lesson = lessonById.get(activity.lessonId);
    const link = lesson && linkById.get(lesson.courseModuleId);
    if (!lesson || !link) errors.push({ code: "ACTIVITY_PARENT_INVALID", message: "Activity is not linked to this course.", entityId: activity.id });
    const activityOutcomes = outcomes.filter(row => row.activityId === activity.id);
    if (activity.required && activity.status !== "ARCHIVED" && !activityOutcomes.some(row => row.required))
      errors.push({ code: "REQUIRED_ACTIVITY_OUTCOME", message: "Required activities need a required learning outcome.", entityId: activity.id });
    const practiceTaskId = typeof activity.metadata.practiceTaskId === "string" ? activity.metadata.practiceTaskId : undefined;
    if (practiceTaskId) {
      const task = tasks.find(row => row.id === practiceTaskId);
      if (!task || task.moduleId !== link?.moduleId) errors.push({ code: "PRACTICE_MAPPING_INVALID", message: "Practice task must map to the activity capability module.", entityId: activity.id });
    }
    if (activity.type === "PRACTICE_PREPARATION" && !practiceTaskId)
      errors.push({ code: "PRACTICE_MAPPING_REQUIRED", message: "Practice preparation needs metadata.practiceTaskId.", entityId: activity.id });
  }
  for (const outcome of outcomes) {
    const activity = activityById.get(outcome.activityId);
    const lesson = activity && lessonById.get(activity.lessonId);
    const link = lesson && linkById.get(lesson.courseModuleId);
    if (!activity || !link) errors.push({ code: "OUTCOME_PARENT_INVALID", message: "Outcome activity is not linked to this course.", entityId: outcome.id });
    if (outcome.capabilityModuleId && outcome.capabilityModuleId !== link?.moduleId)
      errors.push({ code: "OUTCOME_MAPPING_INVALID", message: "Outcome capability module must match its course module.", entityId: outcome.id });
    if (outcome.required && !outcome.capabilityModuleId)
      errors.push({ code: "OUTCOME_MAPPING_REQUIRED", message: "Required outcomes need a capability module mapping.", entityId: outcome.id });
  }
  for (const resource of resources) {
    try { if (resource.uri) validateResourceUri(resource.uri); } catch { errors.push({ code: "RESOURCE_URI_UNSAFE", message: "Resource URI must be an absolute safe HTTP(S) URL.", entityId: resource.id }); }
    if (resource.objectPath && !resource.objectPath.startsWith("/objects/"))
      errors.push({ code: "RESOURCE_OBJECT_PATH_INVALID", message: "Managed files must use an /objects/ objectPath.", entityId: resource.id });
    if (["DOCUMENT", "PDF", "IMAGE", "VIDEO", "AUDIO"].includes(resource.type) && !resource.uri && !resource.objectPath)
      errors.push({ code: "RESOURCE_LOCATION_REQUIRED", message: "Managed media needs objectPath or a safe external URI.", entityId: resource.id });
    if (resource.type === "TEXT" && !resource.content) errors.push({ code: "RESOURCE_TEXT_REQUIRED", message: "Text resources need content.", entityId: resource.id });
  }
  if (!gates.length) warnings.push({ code: "READINESS_GATES_UNMAPPED", message: "No readiness gate is configured for this pathway.", entityId: course.pathwayId });
  return { courseId, valid: errors.length === 0, errors, warnings };
}

export async function coursePreview(courseId: string) {
  const aggregate = await authoredCourse(courseId);
  const validation = await validateCourse(courseId);
  if (!aggregate || !validation) return null;
  const moduleById = new Map(aggregate.modules.map(row => [row.id, row]));
  return {
    course: {
      ...aggregate.course,
      modules: aggregate.links.sort((a, b) => a.sequence - b.sequence).map(link => ({
        id: link.id, moduleId: link.moduleId, moduleCode: moduleById.get(link.moduleId)?.code ?? "UNKNOWN",
        moduleName: moduleById.get(link.moduleId)?.name ?? "Unknown module", sequence: link.sequence,
        lessons: aggregate.lessons.filter(row => row.courseModuleId === link.id).sort((a, b) => a.sequence - b.sequence).map(lesson => ({
          ...lesson, moduleId: link.moduleId,
          activities: aggregate.activities.filter(row => row.lessonId === lesson.id).sort((a, b) => a.sequence - b.sequence).map(activity => ({
            ...activity, currentState: "NOT_STARTED",
            nextAction: { action: "START_ACTIVITY", title: "Start activity", description: "Begin this learning activity.", href: null },
            resources: aggregate.resources.filter(row => row.activityId === activity.id),
            outcomes: aggregate.outcomes.filter(row => row.activityId === activity.id),
          })),
        })),
      })),
    }, validation,
  };
}

async function audit(courseId: string, actorId: string, action: string, details: Record<string, unknown>, versionId?: string) {
  await db.insert(courseAuthoringAuditTable).values({ id: id("course-audit"), courseId, versionId: versionId ?? null, action, actorId, details, createdBy: actorId });
}

async function duplicateCourse(source: NonNullable<Awaited<ReturnType<typeof authoredCourse>>>, actorId: string, title?: string) {
  const courseId = id("course");
  const sequence = Math.max(0, ...(await db.select().from(coursesTable).where(eq(coursesTable.pathwayId, source.course.pathwayId))).map(row => row.sequence)) + 1;
  const linkIds = new Map<string, string>(), lessonIds = new Map<string, string>(), activityIds = new Map<string, string>();
  await db.transaction(async tx => {
    await tx.insert(coursesTable).values({ ...source.course, id: courseId, title: title ?? `${source.course.title} (copy)`, sequence, status: "DRAFT", publishedVersionId: null, createdBy: actorId });
    for (const row of source.links) { const next = id("course-module"); linkIds.set(row.id, next); await tx.insert(courseModulesTable).values({ ...row, id: next, courseId, createdBy: actorId }); }
    for (const row of source.lessons) { const next = id("lesson"); lessonIds.set(row.id, next); await tx.insert(lessonsTable).values({ ...row, id: next, courseModuleId: linkIds.get(row.courseModuleId)!, status: "DRAFT", createdBy: actorId }); }
    for (const row of source.activities) { const next = id("activity"); activityIds.set(row.id, next); await tx.insert(learningActivitiesTable).values({ ...row, id: next, lessonId: lessonIds.get(row.lessonId)!, status: "DRAFT", createdBy: actorId }); }
    for (const row of source.outcomes) await tx.insert(learningOutcomesTable).values({ ...row, id: id("outcome"), activityId: activityIds.get(row.activityId)!, createdBy: actorId });
    for (const row of source.resources) await tx.insert(contentResourcesTable).values({ ...row, id: id("resource"), activityId: activityIds.get(row.activityId)!, createdBy: actorId });
    await tx.insert(courseAuthoringAuditTable).values({ id: id("course-audit"), courseId, action: "DUPLICATE_COURSE", actorId, details: { sourceCourseId: source.course.id }, createdBy: actorId });
  });
  return courseId;
}

async function applyCourseAuthoringLocked(command: Command, actorId: string) {
  const aggregate = await authoredCourse(command.courseId);
  const data = command.data ?? {};
  if (!aggregate && !(command.action === "CREATE" && command.entity === "COURSE")) return { error: "Course not found" as const };
  const existing = command.id;
  let entityId = existing ?? id(command.entity.toLowerCase());
  const status = command.action === "ARCHIVE" ? "ARCHIVED" : "DRAFT";
  try {
    if (command.action === "CREATE" && command.entity === "COURSE") {
      const programId = string(data.programId, "programId")!, pathwayId = string(data.pathwayId, "pathwayId")!;
      const { pathwaysTable } = await import("@workspace/db");
      const [pathway] = await db.select().from(pathwaysTable).where(and(eq(pathwaysTable.id, pathwayId), eq(pathwaysTable.programId, programId))).limit(1);
      if (!pathway) throw new Error("pathwayId must belong to programId");
      await db.insert(coursesTable).values({ id: entityId, programId, pathwayId, title: string(data.title, "title")!, description: string(data.description, "description")!, sequence: integer(data.sequence, "sequence")!, status: "DRAFT", metadata: object(data.metadata), createdBy: actorId });
      await audit(entityId, actorId, "CREATE_COURSE", { data });
      return { id: entityId, entity: command.entity, action: command.action, status: "DRAFT" };
    }
    if (!aggregate) return { error: "Course not found" as const };
    if (existing && command.entity === "COURSE" && existing !== command.courseId) return { error: "Course id does not match courseId" as const };
    // Never allow a naked descendant id to mutate another course sharing a pathway.
    if (existing && command.action !== "CREATE" && command.entity !== "COURSE") {
      const owned = command.entity === "COURSE_MODULE" ? aggregate.links.some(row => row.id === existing)
        : command.entity === "LESSON" ? aggregate.lessons.some(row => row.id === existing)
          : command.entity === "ACTIVITY" ? aggregate.activities.some(row => row.id === existing)
            : command.entity === "OUTCOME" ? aggregate.outcomes.some(row => row.id === existing)
              : aggregate.resources.some(row => row.id === existing);
      if (!owned) return { error: "Authoring entity not found in course" as const };
    }
    if (command.action === "DUPLICATE") {
      if (!existing) throw new Error("id is required for DUPLICATE");
      if (command.entity === "COURSE") {
        if (existing !== command.courseId) throw new Error("courseId must identify the source course");
        entityId = await duplicateCourse(aggregate, actorId, string(data.title, "title", true));
      } else if (command.entity === "RESOURCE") {
        const row = aggregate.resources.find(item => item.id === existing); if (!row) throw new Error("Resource not found in course");
        entityId = id("resource"); const sequence = integer(data.sequence, "sequence", true) ?? Math.max(0, ...aggregate.resources.filter(item => item.activityId === row.activityId).map(item => item.sequence)) + 1;
        await db.insert(contentResourcesTable).values({ ...row, id: entityId, title: string(data.title, "title", true) ?? `${row.title} (copy)`, sequence, createdBy: actorId });
      } else if (command.entity === "OUTCOME") {
        const row = aggregate.outcomes.find(item => item.id === existing); if (!row) throw new Error("Outcome not found in course");
        entityId = id("outcome"); const sequence = Math.max(0, ...aggregate.outcomes.filter(item => item.activityId === row.activityId).map(item => item.sequence)) + 1;
        await db.insert(learningOutcomesTable).values({ ...row, id: entityId, sequence, description: string(data.description, "description", true) ?? `${row.description} (copy)`, createdBy: actorId });
      } else if (command.entity === "ACTIVITY") {
        const row = aggregate.activities.find(item => item.id === existing); if (!row) throw new Error("Activity not found in course");
        const lessonId = string(data.lessonId, "lessonId", true) ?? row.lessonId;
        if (!aggregate.lessons.some(item => item.id === lessonId) && lessonId !== row.lessonId) throw new Error("lessonId must belong to this course");
        entityId = id("activity"); const sequence = integer(data.sequence, "sequence", true) ?? Math.max(0, ...aggregate.activities.filter(item => item.lessonId === row.lessonId).map(item => item.sequence)) + 1;
        await db.insert(learningActivitiesTable).values({ ...row, id: entityId, lessonId, sequence, status: "DRAFT", createdBy: actorId });
        for (const outcome of aggregate.outcomes.filter(item => item.activityId === row.id)) await db.insert(learningOutcomesTable).values({ ...outcome, id: id("outcome"), activityId: entityId, status: "DRAFT", createdBy: actorId });
        for (const resource of aggregate.resources.filter(item => item.activityId === row.id)) await db.insert(contentResourcesTable).values({ ...resource, id: id("resource"), activityId: entityId, status: "DRAFT", createdBy: actorId });
      } else if (command.entity === "LESSON") {
        const row = aggregate.lessons.find(item => item.id === existing); if (!row) throw new Error("Lesson not found in course");
        entityId = id("lesson"); const sequence = integer(data.sequence, "sequence", true) ?? Math.max(0, ...aggregate.lessons.filter(item => item.courseModuleId === row.courseModuleId).map(item => item.sequence)) + 1;
        await db.insert(lessonsTable).values({ ...row, id: entityId, sequence, status: "DRAFT", createdBy: actorId });
        for (const activity of aggregate.activities.filter(item => item.lessonId === row.id)) await applyCourseAuthoring({ action: "DUPLICATE", entity: "ACTIVITY", id: activity.id, courseId: command.courseId, data: { lessonId: entityId } }, actorId);
      } else if (command.entity === "COURSE_MODULE") {
        const row = aggregate.links.find(item => item.id === existing); if (!row) throw new Error("Course module not found in course");
        entityId = id("course-module"); const sequence = integer(data.sequence, "sequence", true) ?? Math.max(0, ...aggregate.links.map(item => item.sequence)) + 1;
        await db.insert(courseModulesTable).values({ ...row, id: entityId, sequence, status: "DRAFT", createdBy: actorId });
        // Explicit copies preserve the hierarchy while retaining immutable learner references.
        for (const lesson of aggregate.lessons.filter(item => item.courseModuleId === row.id)) {
          const lessonId = id("lesson"); await db.insert(lessonsTable).values({ ...lesson, id: lessonId, courseModuleId: entityId, status: "DRAFT", createdBy: actorId });
          for (const activity of aggregate.activities.filter(item => item.lessonId === lesson.id)) {
            const activityId = id("activity"); await db.insert(learningActivitiesTable).values({ ...activity, id: activityId, lessonId, status: "DRAFT", createdBy: actorId });
            for (const outcome of aggregate.outcomes.filter(item => item.activityId === activity.id)) await db.insert(learningOutcomesTable).values({ ...outcome, id: id("outcome"), activityId, status: "DRAFT", createdBy: actorId });
            for (const resource of aggregate.resources.filter(item => item.activityId === activity.id)) await db.insert(contentResourcesTable).values({ ...resource, id: id("resource"), activityId, status: "DRAFT", createdBy: actorId });
          }
        }
      } else throw new Error("Unsupported duplicate entity");
    } else if (command.action === "CREATE") {
      if (command.entity === "COURSE_MODULE") {
        const moduleId = string(data.moduleId, "moduleId")!;
        if (!aggregate.modules.some(row => row.id === moduleId)) throw new Error("moduleId must belong to the course pathway");
        const values = { id: entityId, courseId: command.courseId, moduleId, programId: aggregate.course.programId, pathwayId: aggregate.course.pathwayId, sequence: allocatedSiblingSequence(aggregate.links, data.sequence), createdBy: actorId };
        if (data.sequence !== undefined) await openSiblingPosition("COURSE_MODULE", command.courseId, values.sequence, tx => tx.insert(courseModulesTable).values(values));
        else await db.insert(courseModulesTable).values(values);
      } else if (command.entity === "LESSON") {
        const courseModuleId = string(data.courseModuleId ?? data.parentId, "courseModuleId")!;
        if (!aggregate.links.some(row => row.id === courseModuleId)) throw new Error("courseModuleId must belong to this course");
        const values = { id: entityId, courseModuleId, programId: aggregate.course.programId, pathwayId: aggregate.course.pathwayId, title: string(data.title ?? "Untitled lesson", "title")!, description: string(data.description ?? "", "description", true) ?? "", sequence: allocatedSiblingSequence(aggregate.lessons.filter(row => row.courseModuleId === courseModuleId), data.sequence), status, estimatedDurationMinutes: integer(data.estimatedDurationMinutes ?? 0, "estimatedDurationMinutes")!, metadata: object(data.metadata), createdBy: actorId };
        if (data.sequence !== undefined) await openSiblingPosition("LESSON", courseModuleId, values.sequence, tx => tx.insert(lessonsTable).values(values));
        else await db.insert(lessonsTable).values(values);
      } else if (command.entity === "ACTIVITY") {
        const lessonId = string(data.lessonId ?? data.parentId, "lessonId")!;
        if (!aggregate.lessons.some(row => row.id === lessonId)) throw new Error("lessonId must belong to this course");
        const values = { id: entityId, lessonId, programId: aggregate.course.programId, pathwayId: aggregate.course.pathwayId, type: string(data.type ?? "READING", "type")!, title: string(data.title ?? "Untitled activity", "title")!, description: string(data.description ?? "", "description", true) ?? "", sequence: allocatedSiblingSequence(aggregate.activities.filter(row => row.lessonId === lessonId), data.sequence), required: bool(data.required, "required", true), status, estimatedDurationMinutes: integer(data.estimatedDurationMinutes ?? 0, "estimatedDurationMinutes")!, metadata: object(data.metadata), createdBy: actorId };
        if (data.sequence !== undefined) await openSiblingPosition("ACTIVITY", lessonId, values.sequence, tx => tx.insert(learningActivitiesTable).values(values));
        else await db.insert(learningActivitiesTable).values(values);
      } else if (command.entity === "OUTCOME") {
        const activityId = string(data.activityId ?? data.parentId, "activityId")!;
        if (!aggregate.activities.some(row => row.id === activityId)) throw new Error("activityId must belong to this course");
        const values = { id: entityId, activityId, capabilityModuleId: string(data.capabilityModuleId, "capabilityModuleId", true) ?? null, description: string(data.description ?? "Define the capability outcome", "description")!, verificationMethod: string(data.verificationMethod ?? "Trainer review", "verificationMethod")!, required: bool(data.required, "required", true), sequence: allocatedSiblingSequence(aggregate.outcomes.filter(row => row.activityId === activityId), data.sequence), createdBy: actorId };
        if (data.sequence !== undefined) await openSiblingPosition("OUTCOME", activityId, values.sequence, tx => tx.insert(learningOutcomesTable).values(values));
        else await db.insert(learningOutcomesTable).values(values);
      } else if (command.entity === "RESOURCE") {
        const activityId = string(data.activityId ?? data.parentId, "activityId")!;
        if (!aggregate.activities.some(row => row.id === activityId)) throw new Error("activityId must belong to this course");
        const objectPath = string(data.objectPath, "objectPath", true) ?? null;
        const type = string(data.type ?? "TEXT", "type")!;
        if (type !== "TEXT" && data.content !== undefined && data.content !== null) throw new Error("Managed document, image, and video resources must use objectPath, not content bytes or base64");
        await claimManagedObject(objectPath, actorId);
        const values = { id: entityId, activityId, type, title: string(data.title ?? "Untitled resource", "title")!, uri: string(data.uri, "uri", true) ?? null, objectPath, mimeType: string(data.mimeType, "mimeType", true) ?? null, content: string(data.content, "content", true) ?? null, sequence: allocatedSiblingSequence(aggregate.resources.filter(row => row.activityId === activityId), data.sequence), metadata: object(data.metadata), createdBy: actorId };
        if (data.sequence !== undefined) await openSiblingPosition("RESOURCE", activityId, values.sequence, tx => tx.insert(contentResourcesTable).values(values));
        else await db.insert(contentResourcesTable).values(values);
      }
      else throw new Error("Courses are created through programme administration; use COURSE_MODULE, LESSON, ACTIVITY, OUTCOME, or RESOURCE.");
    } else if (!existing) throw new Error("id is required for this authoring action");
    else if (command.action === "REORDER") {
      await reorderEntity(aggregate, command.entity, existing, data);
    } else if (command.action === "ARCHIVE") {
      if (command.entity === "COURSE") await db.update(coursesTable).set({ status }).where(eq(coursesTable.id, existing));
      else if (command.entity === "COURSE_MODULE") await db.update(courseModulesTable).set({ status }).where(eq(courseModulesTable.id, existing));
      else if (command.entity === "LESSON") await db.update(lessonsTable).set({ status }).where(eq(lessonsTable.id, existing));
      else if (command.entity === "ACTIVITY") await db.update(learningActivitiesTable).set({ status }).where(eq(learningActivitiesTable.id, existing));
      else if (command.entity === "OUTCOME") await db.update(learningOutcomesTable).set({ status }).where(eq(learningOutcomesTable.id, existing));
      else if (command.entity === "RESOURCE") await db.update(contentResourcesTable).set({ status }).where(eq(contentResourcesTable.id, existing));
      else throw new Error("Unsupported archive entity");
    } else {
      if (command.entity === "COURSE") await db.update(coursesTable).set({ title: string(data.title, "title", true), description: string(data.description, "description", true), metadata: data.metadata === undefined ? undefined : object(data.metadata) }).where(eq(coursesTable.id, existing));
      else if (command.entity === "COURSE_MODULE") await db.update(courseModulesTable).set({ moduleId: string(data.moduleId, "moduleId", true), status: data.status === "ARCHIVED" ? "ARCHIVED" : undefined }).where(and(eq(courseModulesTable.id, existing), eq(courseModulesTable.courseId, command.courseId)));
      else if (command.entity === "LESSON") await db.update(lessonsTable).set({ title: string(data.title, "title", true), description: string(data.description, "description", true), metadata: data.metadata === undefined ? undefined : object(data.metadata), status: "DRAFT" }).where(eq(lessonsTable.id, existing));
      else if (command.entity === "ACTIVITY") await db.update(learningActivitiesTable).set({ title: string(data.title, "title", true), description: string(data.description, "description", true), required: data.required === undefined ? undefined : bool(data.required, "required"), metadata: data.metadata === undefined ? undefined : object(data.metadata), status: "DRAFT" }).where(eq(learningActivitiesTable.id, existing));
      else if (command.entity === "OUTCOME") await db.update(learningOutcomesTable).set({ description: string(data.description, "description", true), verificationMethod: string(data.verificationMethod, "verificationMethod", true), required: data.required === undefined ? undefined : bool(data.required, "required") }).where(eq(learningOutcomesTable.id, existing));
      else if (command.entity === "RESOURCE") {
        const objectPath = string(data.objectPath, "objectPath", true);
        if (objectPath !== undefined) await claimManagedObject(objectPath, actorId);
        await db.update(contentResourcesTable).set({ title: string(data.title, "title", true), uri: string(data.uri, "uri", true), objectPath, mimeType: string(data.mimeType, "mimeType", true), content: string(data.content, "content", true), metadata: data.metadata === undefined ? undefined : object(data.metadata) }).where(eq(contentResourcesTable.id, existing));
      }
      else throw new Error("Use CREATE or REORDER for this entity");
    }
  } catch (error) { return { error: error instanceof Error ? error.message : "Authoring command failed" as const }; }
  await audit(command.courseId, actorId, `${command.action}_${command.entity}`, { entityId, data });
  return { id: entityId, entity: command.entity, action: command.action, status: command.action === "ARCHIVE" ? "ARCHIVED" : "DRAFT" };
}

export async function applyCourseAuthoring(command: Command, actorId: string) {
  return withCourseAuthoringLock(command.courseId, () => applyCourseAuthoringLocked(command, actorId));
}

export async function publishCourse(courseId: string, actorId: string) {
  return withCourseAuthoringLock(courseId, async () => {
    const preview = await coursePreview(courseId);
    if (!preview) return { error: "Course not found" as const };
    if (!preview.validation.valid) return { error: "Course validation failed", report: preview.validation };
    const tx = db;
    const [{ value: currentVersion }] = await tx.select({ value: max(courseVersionsTable.version) }).from(courseVersionsTable).where(eq(courseVersionsTable.courseId, courseId));
    const [{ value: authoringRevision }] = await tx.select({ value: count() }).from(courseAuthoringAuditTable).where(and(
      eq(courseAuthoringAuditTable.courseId, courseId),
      ne(courseAuthoringAuditTable.action, "PUBLISH"),
    ));
    const version = (currentVersion ?? 0) + 1, versionId = id("course-version"), publishedAt = new Date();
    await tx.insert(courseVersionsTable).values({ id: versionId, courseId, version, lifecycle: "PUBLISHED", snapshot: { ...preview.course, authoringRevision }, validationReport: preview.validation, publishedAt, publishedBy: actorId });
    await tx.update(coursesTable).set({ status: "PUBLISHED", publishedVersionId: versionId }).where(eq(coursesTable.id, courseId));
    await tx.insert(courseAuthoringAuditTable).values({ id: id("course-audit"), courseId, versionId, action: "PUBLISH", actorId, details: { version, authoringRevision }, createdBy: actorId });
    return { id: versionId, courseId, version, authoringRevision, lifecycle: "PUBLISHED" as const, publishedAt };
  });
}

export async function listAuthoredCourses() {
  const courses = await db.select().from(coursesTable);
  return Promise.all(courses.sort((a, b) => a.sequence - b.sequence).map(async course => (await coursePreview(course.id))?.course));
}
export async function courseVersions(courseId: string) {
  return (await db.select().from(courseVersionsTable).where(eq(courseVersionsTable.courseId, courseId)))
    .sort((a, b) => b.version - a.version)
    .map(({ id, courseId: versionCourseId, version, lifecycle, snapshot, publishedAt }) => ({
      id,
      courseId: versionCourseId,
      version,
      authoringRevision: typeof snapshot.authoringRevision === "number" ? snapshot.authoringRevision : 0,
      lifecycle: lifecycle as "PUBLISHED",
      publishedAt,
    }));
}
export async function courseAudit(courseId: string) {
  return (await db.select().from(courseAuthoringAuditTable).where(eq(courseAuthoringAuditTable.courseId, courseId)))
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .map(({ id, courseId: auditCourseId, versionId, action, actorId, details, createdAt }) => ({ id, courseId: auditCourseId, versionId, action, actorId, details, createdAt }));
}