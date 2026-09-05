import { Router, type IRouter } from "express";
import { and, eq, ne } from "drizzle-orm";
import {
  contentResourcesTable,
  courseModulesTable,
  courseVersionsTable,
  coursesTable,
  db,
  learningActivitiesTable,
  learningRecordLinksTable,
  learningOutcomesTable,
  learningTransitionEventsTable,
  lessonsTable,
  modulesTable,
  practiceTasksTable,
} from "@workspace/db";
import {
  CreateLearningResourceBody,
  CreateLearningResourceResponse,
  ListLearningCoursesResponse,
  TransitionLearningStateBody,
  TransitionLearningStateResponse,
} from "@workspace/api-zod";
import { authorizeLearner, authorizeLearningActor, authorizeWorkspaceRole } from "../lib/authorization";
import {
  transitionLearningState,
  learningNextAction,
  type LearningState,
  type LearningTransitionCommand,
} from "../lib/learning-transition";
import { learnerContext } from "../lib/teras";
import { RESOURCE_URI_ERROR, validateResourceUri } from "../lib/resource-uri";
import { applyCourseAuthoring, trainerHasAssignment } from "../lib/course-authoring";
import { resolveLearningResumeAction } from "../lib/learning-resume";

const router: IRouter = Router();
export const learnerCourseAvailable = (course: { status: string; publishedVersionId: string | null }) =>
  course.status !== "ARCHIVED" && Boolean(course.publishedVersionId);

router.get("/learning/courses", async (req, res): Promise<void> => {
  const learnerId = await authorizeLearner(req, res);
  if (!learnerId) return;
  const context = await learnerContext(learnerId);

  const [courses, courseModules, modules, lessons, activities, resources, outcomes, transitions, practiceTasks, recordLinks, versions] = await Promise.all([
    db.select().from(coursesTable).where(and(eq(coursesTable.pathwayId, context.pathway.id), ne(coursesTable.status, "ARCHIVED"))),
    db.select().from(courseModulesTable).where(eq(courseModulesTable.pathwayId, context.pathway.id)),
    db.select().from(modulesTable).where(eq(modulesTable.pathwayId, context.pathway.id)),
    db.select().from(lessonsTable).where(eq(lessonsTable.pathwayId, context.pathway.id)),
    db.select().from(learningActivitiesTable).where(eq(learningActivitiesTable.pathwayId, context.pathway.id)),
    db.select().from(contentResourcesTable),
    db.select().from(learningOutcomesTable),
    db.select().from(learningTransitionEventsTable).where(and(
      eq(learningTransitionEventsTable.learnerId, learnerId),
      eq(learningTransitionEventsTable.pathwayId, context.pathway.id),
    )),
    db.select().from(practiceTasksTable),
    db.select().from(learningRecordLinksTable).where(and(
      eq(learningRecordLinksTable.learnerId, learnerId),
      eq(learningRecordLinksTable.pathwayId, context.pathway.id),
    )),
    db.select().from(courseVersionsTable),
  ]);

  const moduleById = new Map(modules.map(module => [module.id, module]));
  const latestState = new Map<string, { state: LearningState; createdAt: Date; eventId: string }>();
  for (const event of transitions) {
    const current = latestState.get(event.activityId);
    if (
      !current ||
      current.createdAt < event.createdAt ||
      (current.createdAt.getTime() === event.createdAt.getTime() && current.eventId < event.id)
    ) {
      latestState.set(event.activityId, {
        state: event.toState as LearningState,
        createdAt: event.createdAt,
        eventId: event.id,
      });
    }
  }

  const response = courses.filter(learnerCourseAvailable)
    .sort((a, b) => a.sequence - b.sequence)
    .map(course => ({
      id: course.id,
      programId: course.programId,
      pathwayId: course.pathwayId,
      title: course.title,
      description: course.description,
      status: course.status,
      sequence: course.sequence,
      modules: courseModules
        .filter(link => link.courseId === course.id)
        .sort((a, b) => a.sequence - b.sequence)
        .map(link => {
          const module = moduleById.get(link.moduleId);
          if (!module) throw new Error(`Course module ${link.id} references missing module ${link.moduleId}`);
          return {
            id: link.id,
            moduleId: module.id,
            moduleCode: module.code,
            moduleName: module.name,
            sequence: link.sequence,
            lessons: lessons
              .filter(lesson => lesson.courseModuleId === link.id)
              .sort((a, b) => a.sequence - b.sequence)
              .map(lesson => ({
                id: lesson.id,
                moduleId: module.id,
                title: lesson.title,
                description: lesson.description,
                sequence: lesson.sequence,
                status: lesson.status,
                estimatedDurationMinutes: lesson.estimatedDurationMinutes,
                activities: activities
                  .filter(activity => activity.lessonId === lesson.id)
                  .sort((a, b) => a.sequence - b.sequence)
                  .map(activity => {
                    const currentState = latestState.get(activity.id)?.state ?? "NOT_STARTED";
                    const task = practiceTasks.find(item => item.moduleId === module.id);
                    const latestLink = recordLinks
                      .filter(item => item.activityId === activity.id && item.practiceAttemptId)
                      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
                    return ({
                    id: activity.id,
                    lessonId: activity.lessonId,
                    pathwayId: activity.pathwayId,
                    type: activity.type,
                    title: activity.title,
                    description: activity.description,
                    sequence: activity.sequence,
                    required: activity.required,
                    estimatedDurationMinutes: activity.estimatedDurationMinutes,
                    status: activity.status,
                    currentState,
                    nextAction: learningNextAction(currentState, { activityId: activity.id, taskId: task?.id, practiceAttemptId: latestLink?.practiceAttemptId ?? undefined }),
                    resources: resources
                      .filter(resource => resource.activityId === activity.id)
                      .sort((a, b) => a.sequence - b.sequence)
                      .map(resource => ({
                        id: resource.id,
                        type: resource.type,
                        title: resource.title,
                        uri: resource.uri,
                        objectPath: resource.objectPath,
                        mimeType: resource.mimeType,
                        content: resource.content,
                        sequence: resource.sequence,
                      })),
                    outcomes: outcomes
                      .filter(outcome => outcome.activityId === activity.id)
                      .map(outcome => ({
                        id: outcome.id,
                        activityId: outcome.activityId,
                        capabilityModuleId: outcome.capabilityModuleId,
                        description: outcome.description,
                        verificationMethod: outcome.verificationMethod,
                        required: outcome.required,
                        sequence: outcome.sequence,
                      })),
                    });
                  }),
              })),
          };
        }),
    }));

  // Learners are served the immutable version captured at publish time, never
  // mutable draft rows. Transition state remains live and is keyed by stable
  // activity IDs, preserving progress across subsequent authoring edits.
  const versionById = new Map(versions.map(version => [version.id, version]));
  const publishedResponse = response.map((mutableCourse) => {
    const snapshot = mutableCourse.id && courses.find(course => course.id === mutableCourse.id)?.publishedVersionId
      ? versionById.get(courses.find(course => course.id === mutableCourse.id)!.publishedVersionId!)?.snapshot
      : undefined;
    if (!snapshot || typeof snapshot !== "object") return mutableCourse;
    const course = structuredClone(snapshot) as typeof mutableCourse;
    for (const module of course.modules) for (const lesson of module.lessons) for (const activity of lesson.activities) {
      const currentState = latestState.get(activity.id)?.state ?? "NOT_STARTED";
      activity.currentState = currentState;
      const task = practiceTasks.find(item => item.moduleId === module.moduleId);
      const latestLink = recordLinks.filter(item => item.activityId === activity.id && item.practiceAttemptId)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
      activity.nextAction = learningNextAction(currentState, { activityId: activity.id, taskId: task?.id, practiceAttemptId: latestLink?.practiceAttemptId ?? undefined });
    }
    return course;
  });
  const coursesWithResume = publishedResponse.map(course => ({
    ...course,
    resumeAction: resolveLearningResumeAction(course, latestState),
  }));
  res.json(ListLearningCoursesResponse.parse(coursesWithResume));
});

router.post("/learning/resources", async (req, res): Promise<void> => {
  const trainerId = await authorizeWorkspaceRole(req, res, "trainer");
  if (!trainerId) return;

  const requestedUri =
    typeof req.body === "object" && req.body !== null && "uri" in req.body
      ? (req.body as { uri?: unknown }).uri
      : undefined;
  if (typeof requestedUri === "string") {
    try {
      validateResourceUri(requestedUri);
    } catch {
      req.log.warn({ trainerId }, "Unsafe learning resource URI rejected");
      res.status(400).json({ error: RESOURCE_URI_ERROR });
      return;
    }
  }

  const parsed = CreateLearningResourceBody.safeParse(req.body);
  if (!parsed.success) {
    req.log.warn({ errors: parsed.error.message, trainerId }, "Invalid learning resource request");
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [activity] = await db
    .select({
      id: learningActivitiesTable.id,
      courseId: coursesTable.id,
      programId: coursesTable.programId,
      pathwayId: coursesTable.pathwayId,
    })
    .from(learningActivitiesTable)
    .innerJoin(lessonsTable, eq(lessonsTable.id, learningActivitiesTable.lessonId))
    .innerJoin(courseModulesTable, eq(courseModulesTable.id, lessonsTable.courseModuleId))
    .innerJoin(coursesTable, eq(coursesTable.id, courseModulesTable.courseId))
    .where(eq(learningActivitiesTable.id, parsed.data.activityId))
    .limit(1);
  if (!activity) {
    res.status(404).json({ error: "Learning activity not found" });
    return;
  }
  if (!await trainerHasAssignment(trainerId, activity.programId, activity.pathwayId)) {
    res.status(403).json({ error: "You are not assigned to this course pathway" });
    return;
  }

  const result = await applyCourseAuthoring({
    action: "CREATE",
    entity: "RESOURCE",
    id: parsed.data.id,
    courseId: activity.courseId,
    data: {
      ...parsed.data,
      uri: parsed.data.uri ?? undefined,
      objectPath: parsed.data.objectPath ?? undefined,
      mimeType: parsed.data.mimeType ?? undefined,
      content: parsed.data.content ?? undefined,
    },
  }, trainerId);
  if ("error" in result) {
    res.status(409).json({ error: result.error });
    return;
  }
  const [resource] = await db.select().from(contentResourcesTable).where(eq(contentResourcesTable.id, result.id)).limit(1);
  if (!resource) {
    res.status(500).json({ error: "Created learning resource could not be loaded" });
    return;
  }

  req.log.info(
    { resourceId: resource.id, activityId: resource.activityId, trainerId },
    "Learning resource created",
  );
  res.status(201).json(CreateLearningResourceResponse.parse(resource));
});

router.post("/learning/transitions", async (req, res): Promise<void> => {
  const actor = await authorizeLearningActor(req, res);
  if (!actor) return;
  const parsed = TransitionLearningStateBody.safeParse(req.body);
  if (!parsed.success) {
    req.log.warn({ errors: parsed.error.message }, "Invalid learning transition request");
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const result = await transitionLearningState(parsed.data as LearningTransitionCommand, actor);
  if (!result.ok) {
    req.log.warn(
      { reason: result.value.reason, activityId: parsed.data.activityId, actorRole: actor.role },
      "Learning transition rejected",
    );
    res.status(result.statusCode).json(result.value);
    return;
  }

  req.log.info(
    {
      eventId: result.value.eventId,
      activityId: result.value.activityId,
      fromState: result.value.fromState,
      toState: result.value.toState,
      actorRole: actor.role,
      idempotent: result.value.idempotent,
    },
    "Learning transition recorded",
  );
  res.status(result.statusCode).json(TransitionLearningStateResponse.parse(result.value));
});

export default router;