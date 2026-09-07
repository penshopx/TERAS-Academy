import { Readable } from "stream";
import { and, eq } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  RequestManagedResourceUploadUrlBody, RequestManagedResourceUploadUrlResponse,
} from "@workspace/api-zod";
import { contentResourcesTable, courseModulesTable, coursesTable, courseVersionsTable, db, learningActivitiesTable, lessonsTable, managedResourceUploadsTable } from "@workspace/db";
import { authorizeLearningActor, authorizeWorkspaceRole } from "../lib/authorization";
import { learnerContext } from "../lib/teras";
import { trainerHasAssignment } from "../lib/course-authoring";
import { ObjectNotFoundError, ObjectStorageService } from "../lib/objectStorage";

const router: IRouter = Router();
const storage = new ObjectStorageService();

router.post("/storage/uploads/request-url", async (req, res): Promise<void> => {
  const trainerId = await authorizeWorkspaceRole(req, res, "trainer");
  if (!trainerId) return;
  const parsed = RequestManagedResourceUploadUrlBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  try {
    const uploadURL = await storage.getObjectEntityUploadURL();
    const objectPath = storage.normalizeObjectEntityPath(uploadURL);
    await db.insert(managedResourceUploadsTable).values({
      objectPath, trainerId, name: parsed.data.name, size: parsed.data.size, mimeType: parsed.data.contentType,
      expiresAt: new Date(Date.now() + 900_000), createdBy: trainerId,
    });
    req.log.info({ trainerId, objectPath, contentType: parsed.data.contentType, size: parsed.data.size }, "Managed resource upload URL issued");
    res.json(RequestManagedResourceUploadUrlResponse.parse({ uploadURL, objectPath, metadata: parsed.data }));
  } catch (error) {
    req.log.error({ err: error, trainerId }, "Managed resource upload URL failed");
    res.status(500).json({ error: "Unable to issue managed resource upload URL" });
  }
});

router.get("/storage/objects/*path", async (req, res): Promise<void> => {
  // authorizeLearningActor verifies a Supabase bearer token in production;
  // the only alternate identity path is the server-injected integration harness.
  const actor = await authorizeLearningActor(req, res);
  if (!actor) return;
  const raw = req.params.path;
  const path = Array.isArray(raw) ? raw.join("/") : raw;
  const objectPath = `/objects/${path}`;
  try {
    let [resource] = await db.select({ activityPathwayId: learningActivitiesTable.pathwayId, programId: coursesTable.programId, courseStatus: coursesTable.status })
      .from(contentResourcesTable)
      .innerJoin(learningActivitiesTable, eq(contentResourcesTable.activityId, learningActivitiesTable.id))
      .innerJoin(lessonsTable, eq(learningActivitiesTable.lessonId, lessonsTable.id))
      .innerJoin(courseModulesTable, eq(lessonsTable.courseModuleId, courseModulesTable.id))
      .innerJoin(coursesTable, eq(courseModulesTable.courseId, coursesTable.id))
      .where(and(eq(contentResourcesTable.objectPath, objectPath), eq(coursesTable.status, "PUBLISHED")))
      .limit(1);
    if (!resource) {
      const [publishedCourses, versions] = await Promise.all([db.select().from(coursesTable), db.select().from(courseVersionsTable)]);
      const versionById = new Map(versions.map(row => [row.id, row]));
      const ownerCourse = publishedCourses.find(course => {
        if (course.status === "ARCHIVED" || !course.publishedVersionId) return false;
        const snapshot = versionById.get(course.publishedVersionId)?.snapshot as { modules?: Array<{ lessons?: Array<{ activities?: Array<{ resources?: Array<{ objectPath?: string | null }> }> }> }> } | undefined;
        return snapshot?.modules?.some(module => module.lessons?.some(lesson => lesson.activities?.some(activity => activity.resources?.some(item => item.objectPath === objectPath))));
      });
      if (ownerCourse) resource = { activityPathwayId: ownerCourse.pathwayId, programId: ownerCourse.programId, courseStatus: ownerCourse.status };
    }
    if (!resource) { res.status(404).json({ error: "Managed resource not found" }); return; }
    const allowed = actor.role === "learner"
      ? (await learnerContext(actor.id)).pathway.id === resource.activityPathwayId
      : await trainerHasAssignment(actor.id, resource.programId, resource.activityPathwayId)
        && await storage.ownerCanRead(objectPath, actor.id);
    if (!allowed) { res.status(403).json({ error: "You are not authorized to access this managed resource" }); return; }
    const response = await storage.downloadObject(await storage.getObjectEntityFile(objectPath));
    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));
    if (response.body) Readable.fromWeb(response.body as ReadableStream<Uint8Array>).pipe(res);
    else res.end();
  } catch (error) {
    if (error instanceof ObjectNotFoundError) { res.status(404).json({ error: "Managed resource not found" }); return; }
    req.log.error({ err: error, actorId: actor.id }, "Managed resource serving failed");
    res.status(500).json({ error: "Unable to serve managed resource" });
  }
});

export default router;