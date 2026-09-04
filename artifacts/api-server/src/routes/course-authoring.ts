import { Router, type IRouter } from "express";
import type { Response } from "express";
import {
  ApplyCourseAuthoringCommandBody, ApplyCourseAuthoringCommandResponse,
  ListAuthoredCoursesResponse, ListAuthoredCourseVersionsParams, ListAuthoredCourseVersionsResponse,
  ListCourseAuthoringAuditParams, ListCourseAuthoringAuditResponse,
  PreviewAuthoredCourseParams, PreviewAuthoredCourseResponse,
  PublishAuthoredCourseParams, PublishAuthoredCourseResponse,
  ValidateAuthoredCourseParams, ValidateAuthoredCourseResponse,
} from "@workspace/api-zod";
import { authorizeWorkspaceRole } from "../lib/authorization";
import { applyCourseAuthoring, authoredCourse, courseAudit, coursePreview, courseVersions, listAuthoredCourses, publishCourse, trainerHasAssignment, validateCourse } from "../lib/course-authoring";
import { db, enrollmentsTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";

const router: IRouter = Router();
async function hasCourseScope(courseId: string, trainerId: string) {
  const aggregate = await authoredCourse(courseId);
  if (!aggregate) return "missing" as const;
  return await trainerHasAssignment(trainerId, aggregate.course.programId, aggregate.course.pathwayId) ? "allowed" as const : "forbidden" as const;
}
async function requireCourseScope(courseId: string, trainerId: string, res: Response) {
  const result = await hasCourseScope(courseId, trainerId);
  if (result === "allowed") return true;
  res.status(result === "missing" ? 404 : 403).json({ error: result === "missing" ? "Course not found" : "You are not assigned to this course pathway" });
  return false;
}

router.get("/trainer/authoring/courses", async (req, res): Promise<void> => {
  const trainerId = await authorizeWorkspaceRole(req, res, "trainer");
  if (!trainerId) return;
  const assignments = await db.select().from(enrollmentsTable).where(and(eq(enrollmentsTable.trainerId, trainerId), eq(enrollmentsTable.status, "active")));
  const scopes = new Set(assignments.map(row => `${row.programId}:${row.pathwayId}`));
  const courses = (await listAuthoredCourses()).filter((course): course is Exclude<typeof course, undefined> => course !== undefined && scopes.has(`${course.programId}:${course.pathwayId}`));
  res.json(ListAuthoredCoursesResponse.parse(courses));
});

router.post("/trainer/authoring/commands", async (req, res): Promise<void> => {
  const trainerId = await authorizeWorkspaceRole(req, res, "trainer");
  if (!trainerId) return;
  const parsed = ApplyCourseAuthoringCommandBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const requestedPathway = typeof parsed.data.data?.pathwayId === "string" ? parsed.data.data.pathwayId : undefined;
  if (parsed.data.action === "CREATE" && parsed.data.entity === "COURSE") {
    const requestedProgram = typeof parsed.data.data?.programId === "string" ? parsed.data.data.programId : "";
    if (!requestedPathway || !await trainerHasAssignment(trainerId, requestedProgram, requestedPathway)) { res.status(403).json({ error: "You are not assigned to this course pathway" }); return; }
  } else if (!await requireCourseScope(parsed.data.courseId, trainerId, res)) return;
  const result = await applyCourseAuthoring(parsed.data, trainerId);
  if ("error" in result && result.error) { res.status(result.error.includes("not found") ? 404 : 409).json({ error: result.error }); return; }
  req.log.info({ trainerId, courseId: parsed.data.courseId, entity: result.entity, action: result.action }, "Course authoring command applied");
  res.status(parsed.data.action === "CREATE" || parsed.data.action === "DUPLICATE" ? 201 : 200).json(ApplyCourseAuthoringCommandResponse.parse(result));
});

router.get("/trainer/authoring/courses/:courseId/preview", async (req, res): Promise<void> => {
  const trainerId = await authorizeWorkspaceRole(req, res, "trainer");
  if (!trainerId) return;
  const parsed = PreviewAuthoredCourseParams.safeParse(req.params);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  if (!await requireCourseScope(parsed.data.courseId, trainerId, res)) return;
  const preview = await coursePreview(parsed.data.courseId);
  if (!preview) { res.status(404).json({ error: "Course not found" }); return; }
  res.json(PreviewAuthoredCourseResponse.parse(preview));
});

router.get("/trainer/authoring/courses/:courseId/validation", async (req, res): Promise<void> => {
  const trainerId = await authorizeWorkspaceRole(req, res, "trainer");
  if (!trainerId) return;
  const parsed = ValidateAuthoredCourseParams.safeParse(req.params);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  if (!await requireCourseScope(parsed.data.courseId, trainerId, res)) return;
  const report = await validateCourse(parsed.data.courseId);
  if (!report) { res.status(404).json({ error: "Course not found" }); return; }
  res.json(ValidateAuthoredCourseResponse.parse(report));
});

router.post("/trainer/authoring/courses/:courseId/publish", async (req, res): Promise<void> => {
  const trainerId = await authorizeWorkspaceRole(req, res, "trainer");
  if (!trainerId) return;
  const parsed = PublishAuthoredCourseParams.safeParse(req.params);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  if (!await requireCourseScope(parsed.data.courseId, trainerId, res)) return;
  const result = await publishCourse(parsed.data.courseId, trainerId);
  if ("error" in result) {
    res.status(result.error === "Course not found" ? 404 : 409).json({ error: result.error, ...("report" in result ? { report: result.report } : {}) });
    return;
  }
  req.log.info({ trainerId, courseId: result.courseId, version: result.version }, "Immutable course version published");
  res.status(201).json(PublishAuthoredCourseResponse.parse(result));
});

router.get("/trainer/authoring/courses/:courseId/versions", async (req, res): Promise<void> => {
  const trainerId = await authorizeWorkspaceRole(req, res, "trainer"); if (!trainerId) return;
  const parsed = ListAuthoredCourseVersionsParams.safeParse(req.params);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  if (!await requireCourseScope(parsed.data.courseId, trainerId, res)) return;
  res.json(ListAuthoredCourseVersionsResponse.parse(await courseVersions(parsed.data.courseId)));
});

router.get("/trainer/authoring/courses/:courseId/audit", async (req, res): Promise<void> => {
  const trainerId = await authorizeWorkspaceRole(req, res, "trainer"); if (!trainerId) return;
  const parsed = ListCourseAuthoringAuditParams.safeParse(req.params);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  if (!await requireCourseScope(parsed.data.courseId, trainerId, res)) return;
  res.json(ListCourseAuthoringAuditResponse.parse(await courseAudit(parsed.data.courseId)));
});

export default router;