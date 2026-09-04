import crypto from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import {
  activityCompletionEventsTable,
  assessmentAttemptsTable,
  assessmentsTable,
  courseModulesTable,
  db,
  evidenceReviewsTable,
  evidenceTable,
  gapsTable,
  learningActivitiesTable,
  learningOutcomesTable,
  learningRecordLinksTable,
  learningTransitionEventsTable,
  lessonsTable,
  outcomeVerificationEventsTable,
  practiceAttemptsTable,
  practiceTasksTable,
  readinessTransferEventsTable,
  reassessmentLinksTable,
  remediationPlansTable,
} from "@workspace/db";
import type { LearningActor } from "./authorization";
import { learnerContext, readiness } from "./teras";

export const LEARNING_STATES = [
  "NOT_STARTED",
  "IN_PROGRESS",
  "LEARNING_COMPLETED",
  "OUTCOME_VERIFIED",
  "PRACTICE_REQUIRED",
  "PRACTICE_IN_PROGRESS",
  "EVIDENCE_SUBMITTED",
  "UNDER_REVIEW",
  "REVISION_REQUIRED",
  "REMEDIATION",
  "REASSESSMENT",
  "READY",
  "NOT_READY",
] as const;

export type LearningState = (typeof LEARNING_STATES)[number];

export type LearningTransitionReason =
  | "INVALID_TRANSITION"
  | "STALE_CURRENT_STATE"
  | "UNAUTHORIZED_ACTOR"
  | "LEARNER_MISMATCH"
  | "PATHWAY_MISMATCH"
  | "PROGRAM_MISMATCH"
  | "PREREQUISITE_NOT_MET"
  | "EVIDENCE_REQUIRED"
  | "REVIEW_REQUIRED"
  | "REASSESSMENT_REQUIRED"
  | "SAFETY_BLOCKED"
  | "CAUSAL_REFERENCE_INVALID";

export type LearningTransitionReferences = {
  outcomeId?: string;
  practiceAttemptId?: string;
  evidenceId?: string;
  evidenceReviewId?: string;
  gapId?: string;
  remediationPlanId?: string;
  reassessmentAttemptId?: string;
  previousAssessmentAttemptId?: string;
};

export type LearningTransitionCommand = {
  currentState: LearningState;
  targetState: LearningState;
  learnerId: string;
  pathwayId: string;
  programId: string;
  activityId: string;
  entityReference: string;
  reason: string;
  idempotencyKey: string;
  idempotencyFingerprint?: string;
  references?: LearningTransitionReferences;
};

export type LearningTransitionSuccess = {
  status: "SUCCESS";
  eventId: string;
  activityId: string;
  learnerId: string;
  pathwayId: string;
  fromState: LearningState;
  toState: LearningState;
  idempotent: boolean;
  recordedAt: Date;
};

export type LearningTransitionRejection = {
  status: "REJECTED";
  reason: LearningTransitionReason;
  message: string;
  currentState: LearningState;
};

export type LearningTransitionResult =
  | { ok: true; statusCode: 200 | 201; value: LearningTransitionSuccess }
  | { ok: false; statusCode: 403 | 404 | 409; value: LearningTransitionRejection };

export type LearningTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type LearningNextAction = {
  action: "START_ACTIVITY" | "COMPLETE_ACTIVITY" | "WAIT_FOR_VERIFICATION" | "WAIT_FOR_PRACTICE" | "START_PRACTICE" | "SUBMIT_EVIDENCE" | "WAIT_FOR_REVIEW" | "FOLLOW_FEEDBACK" | "VIEW_READINESS";
  title: string;
  description: string;
  href: string | null;
};

const validTargets: Record<LearningState, readonly LearningState[]> = {
  NOT_STARTED: ["IN_PROGRESS"],
  IN_PROGRESS: ["LEARNING_COMPLETED"],
  LEARNING_COMPLETED: ["OUTCOME_VERIFIED"],
  OUTCOME_VERIFIED: ["PRACTICE_REQUIRED"],
  PRACTICE_REQUIRED: ["PRACTICE_IN_PROGRESS"],
  PRACTICE_IN_PROGRESS: ["EVIDENCE_SUBMITTED"],
  EVIDENCE_SUBMITTED: ["UNDER_REVIEW"],
  UNDER_REVIEW: ["REVISION_REQUIRED", "REASSESSMENT"],
  REVISION_REQUIRED: ["REMEDIATION"],
  REMEDIATION: ["PRACTICE_IN_PROGRESS"],
  REASSESSMENT: ["READY", "NOT_READY"],
  READY: [],
  NOT_READY: [],
};

const actorTargets: Record<LearningActor["role"], ReadonlySet<LearningState>> = {
  learner: new Set(["IN_PROGRESS", "LEARNING_COMPLETED", "PRACTICE_IN_PROGRESS", "EVIDENCE_SUBMITTED"]),
  trainer: new Set(["OUTCOME_VERIFIED", "PRACTICE_REQUIRED", "UNDER_REVIEW", "REVISION_REQUIRED", "REMEDIATION", "REASSESSMENT"]),
  assessor: new Set(["UNDER_REVIEW", "REASSESSMENT", "READY", "NOT_READY"]),
};

export function learningNextAction(
  state: LearningState,
  context: { activityId: string; taskId?: string; practiceAttemptId?: string },
): LearningNextAction {
  switch (state) {
    case "NOT_STARTED":
      return { action: "START_ACTIVITY", title: "Start this activity", description: "Begin the learning activity and its materials.", href: null };
    case "IN_PROGRESS":
      return { action: "COMPLETE_ACTIVITY", title: "Complete this activity", description: "Record learning completion when you have finished the materials.", href: null };
    case "LEARNING_COMPLETED":
      return { action: "WAIT_FOR_VERIFICATION", title: "Await outcome verification", description: "Learning is complete. A trainer must verify the learning outcome before practice is assigned.", href: null };
    case "OUTCOME_VERIFIED":
      return { action: "WAIT_FOR_PRACTICE", title: "Await practice assignment", description: "The outcome is verified. A trainer must open the linked practice requirement.", href: null };
    case "PRACTICE_REQUIRED":
    case "REMEDIATION":
      return {
        action: "START_PRACTICE",
        title: state === "REMEDIATION" ? "Continue remediation practice" : "Continue to practice",
        description: "Create a new pathway-scoped practice attempt. Previous attempts remain in the record.",
        href: context.taskId ? `/practice?taskId=${encodeURIComponent(context.taskId)}&activityId=${encodeURIComponent(context.activityId)}` : "/practice",
      };
    case "PRACTICE_IN_PROGRESS":
      return {
        action: "SUBMIT_EVIDENCE",
        title: "Submit linked evidence",
        description: "Add evidence for this practice attempt. Submission does not mean the outcome is verified or ready.",
        href: context.taskId
          ? `/evidence?taskId=${encodeURIComponent(context.taskId)}&activityId=${encodeURIComponent(context.activityId)}${context.practiceAttemptId ? `&practiceAttemptId=${encodeURIComponent(context.practiceAttemptId)}` : ""}`
          : "/evidence",
      };
    case "EVIDENCE_SUBMITTED":
    case "UNDER_REVIEW":
      return { action: "WAIT_FOR_REVIEW", title: "Evidence under review", description: "Your evidence is recorded and awaits an authorized review.", href: "/evidence" };
    case "REVISION_REQUIRED":
      return { action: "FOLLOW_FEEDBACK", title: "Review feedback", description: "Review the evidence feedback before the trainer opens remediation.", href: "/evidence" };
    case "REASSESSMENT":
    case "READY":
    case "NOT_READY":
      return { action: "VIEW_READINESS", title: "View capability readiness", description: "Readiness remains controlled by assessment, evidence, safety blockers, and authorized decisions.", href: "/readiness" };
  }
}

export function isValidLearningTransition(currentState: LearningState, targetState: LearningState): boolean {
  return validTargets[currentState].includes(targetState);
}

function reject(
  reason: LearningTransitionReason,
  message: string,
  currentState: LearningState,
  statusCode: 403 | 404 | 409 = 409,
): LearningTransitionResult {
  return { ok: false, statusCode, value: { status: "REJECTED", reason, message, currentState } };
}

function successFromEvent(
  event: typeof learningTransitionEventsTable.$inferSelect,
  idempotent: boolean,
): LearningTransitionSuccess {
  return {
    status: "SUCCESS",
    eventId: event.id,
    activityId: event.activityId,
    learnerId: event.learnerId,
    pathwayId: event.pathwayId,
    fromState: event.fromState as LearningState,
    toState: event.toState as LearningState,
    idempotent,
    recordedAt: event.createdAt,
  };
}

export async function transitionLearningState(
  command: LearningTransitionCommand,
  actor: LearningActor,
  transaction?: LearningTransaction,
): Promise<LearningTransitionResult> {
  const context = await learnerContext(actor.role === "learner" ? actor.id : command.learnerId);
  if (command.learnerId !== context.learner.id || (actor.role === "learner" && actor.id !== command.learnerId)) {
    return reject("LEARNER_MISMATCH", "The authenticated actor does not own this learner record.", command.currentState, 403);
  }
  if (
    (actor.role === "trainer" && actor.id !== context.enrollment.trainerId) ||
    (actor.role === "assessor" && actor.id !== context.enrollment.assessorId)
  ) {
    return reject("UNAUTHORIZED_ACTOR", "The authenticated staff member is not assigned to this learner enrollment.", command.currentState, 403);
  }
  if (command.programId !== context.program.id) {
    return reject("PROGRAM_MISMATCH", "The learning record is outside the active program.", command.currentState, 403);
  }
  if (command.pathwayId !== context.pathway.id) {
    return reject("PATHWAY_MISMATCH", "The learning record is outside the active pathway.", command.currentState, 403);
  }
  if (!actorTargets[actor.role].has(command.targetState)) {
    return reject("UNAUTHORIZED_ACTOR", `${actor.role} cannot create ${command.targetState} transitions.`, command.currentState, 403);
  }
  if (!isValidLearningTransition(command.currentState, command.targetState)) {
    return reject("INVALID_TRANSITION", `${command.currentState} cannot transition directly to ${command.targetState}.`, command.currentState);
  }

  const readinessSnapshot = command.targetState === "READY" ? await readiness(context) : null;

  const execute = async (tx: LearningTransaction): Promise<LearningTransitionResult> => {
    const lockKey = `${command.learnerId}:${command.pathwayId}:${command.activityId}`;
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${lockKey}))`);

    const [duplicate] = await tx
      .select()
      .from(learningTransitionEventsTable)
      .where(eq(learningTransitionEventsTable.idempotencyKey, command.idempotencyKey))
      .limit(1);
    if (duplicate) {
      const duplicateMetadata = duplicate.metadata as { idempotencyFingerprint?: string } | null;
      const sameCommand =
        duplicate.activityId === command.activityId &&
        duplicate.learnerId === command.learnerId &&
        duplicate.pathwayId === command.pathwayId &&
        duplicate.fromState === command.currentState &&
        duplicate.toState === command.targetState &&
        duplicateMetadata?.idempotencyFingerprint === command.idempotencyFingerprint;
      if (!sameCommand) {
        return reject("CAUSAL_REFERENCE_INVALID", "The idempotency key was already used for another transition.", command.currentState);
      }
      return { ok: true, statusCode: 200, value: successFromEvent(duplicate, true) };
    }

    const [activity] = await tx
      .select()
      .from(learningActivitiesTable)
      .where(eq(learningActivitiesTable.id, command.activityId))
      .limit(1);
    if (!activity) return reject("CAUSAL_REFERENCE_INVALID", "Learning activity was not found.", command.currentState, 404);
    if (activity.pathwayId !== command.pathwayId) {
      return reject("PATHWAY_MISMATCH", "Learning activity belongs to another pathway.", command.currentState, 403);
    }
    if (activity.programId !== command.programId) {
      return reject("PROGRAM_MISMATCH", "Learning activity belongs to another program.", command.currentState, 403);
    }

    const [latestEvent] = await tx
      .select()
      .from(learningTransitionEventsTable)
      .where(and(
        eq(learningTransitionEventsTable.activityId, command.activityId),
        eq(learningTransitionEventsTable.learnerId, command.learnerId),
        eq(learningTransitionEventsTable.pathwayId, command.pathwayId),
      ))
      .orderBy(desc(learningTransitionEventsTable.createdAt), desc(learningTransitionEventsTable.id))
      .limit(1);
    const storedState = (latestEvent?.toState ?? "NOT_STARTED") as LearningState;
    if (storedState !== command.currentState) {
      return reject("STALE_CURRENT_STATE", `Stored state is ${storedState}, not ${command.currentState}.`, storedState);
    }

    const [lesson] = await tx.select().from(lessonsTable).where(eq(lessonsTable.id, activity.lessonId)).limit(1);
    const [courseModule] = lesson
      ? await tx.select().from(courseModulesTable).where(eq(courseModulesTable.id, lesson.courseModuleId)).limit(1)
      : [];
    if (!lesson || !courseModule || lesson.pathwayId !== command.pathwayId || courseModule.pathwayId !== command.pathwayId) {
      return reject("PATHWAY_MISMATCH", "The learning hierarchy is not valid for this pathway.", storedState, 403);
    }

    const references = command.references ?? {};
    let outcome: typeof learningOutcomesTable.$inferSelect | undefined;
    let practiceAttempt: typeof practiceAttemptsTable.$inferSelect | undefined;
    let evidence: typeof evidenceTable.$inferSelect | undefined;
    let evidenceReview: typeof evidenceReviewsTable.$inferSelect | undefined;
    let gap: typeof gapsTable.$inferSelect | undefined;
    let remediationPlan: typeof remediationPlansTable.$inferSelect | undefined;
    let reassessmentAttempt: typeof assessmentAttemptsTable.$inferSelect | undefined;

    if (references.outcomeId) {
      [outcome] = await tx.select().from(learningOutcomesTable).where(eq(learningOutcomesTable.id, references.outcomeId)).limit(1);
      if (!outcome || outcome.activityId !== activity.id) {
        return reject("CAUSAL_REFERENCE_INVALID", "Outcome does not belong to the learning activity.", storedState);
      }
    }
    if (references.practiceAttemptId) {
      [practiceAttempt] = await tx.select().from(practiceAttemptsTable).where(eq(practiceAttemptsTable.id, references.practiceAttemptId)).limit(1);
      if (!practiceAttempt || practiceAttempt.learnerId !== command.learnerId || practiceAttempt.pathwayId !== command.pathwayId) {
        return reject("CAUSAL_REFERENCE_INVALID", "Practice attempt does not belong to this learner and pathway.", storedState);
      }
      const [practiceTask] = await tx.select().from(practiceTasksTable).where(eq(practiceTasksTable.id, practiceAttempt.taskId)).limit(1);
      if (!practiceTask || practiceTask.moduleId !== courseModule.moduleId) {
        return reject("CAUSAL_REFERENCE_INVALID", "Practice attempt is not linked to the learning module.", storedState);
      }
    }
    if (references.evidenceId) {
      [evidence] = await tx.select().from(evidenceTable).where(eq(evidenceTable.id, references.evidenceId)).limit(1);
      if (!evidence || evidence.learnerId !== command.learnerId || evidence.pathwayId !== command.pathwayId || evidence.moduleId !== courseModule.moduleId) {
        return reject("CAUSAL_REFERENCE_INVALID", "Evidence is not linked to this learner, pathway, and module.", storedState);
      }
    }
    if (references.evidenceReviewId) {
      [evidenceReview] = await tx.select().from(evidenceReviewsTable).where(eq(evidenceReviewsTable.id, references.evidenceReviewId)).limit(1);
      if (!evidenceReview || !evidence || evidenceReview.evidenceId !== evidence.id) {
        return reject("CAUSAL_REFERENCE_INVALID", "Evidence review does not match the referenced evidence.", storedState);
      }
    }
    if (references.gapId) {
      [gap] = await tx.select().from(gapsTable).where(eq(gapsTable.id, references.gapId)).limit(1);
      if (!gap || gap.learnerId !== command.learnerId || gap.pathwayId !== command.pathwayId || gap.moduleId !== courseModule.moduleId) {
        return reject("CAUSAL_REFERENCE_INVALID", "Gap is not linked to this learner, pathway, and module.", storedState);
      }
    }
    if (references.remediationPlanId) {
      [remediationPlan] = await tx.select().from(remediationPlansTable).where(eq(remediationPlansTable.id, references.remediationPlanId)).limit(1);
      if (!remediationPlan || !gap || remediationPlan.gapId !== gap.id) {
        return reject("CAUSAL_REFERENCE_INVALID", "Remediation plan does not match the referenced gap.", storedState);
      }
    }
    if (references.reassessmentAttemptId) {
      [reassessmentAttempt] = await tx.select().from(assessmentAttemptsTable).where(eq(assessmentAttemptsTable.id, references.reassessmentAttemptId)).limit(1);
      if (!reassessmentAttempt || reassessmentAttempt.learnerId !== command.learnerId || reassessmentAttempt.pathwayId !== command.pathwayId) {
        return reject("CAUSAL_REFERENCE_INVALID", "Reassessment does not belong to this learner and pathway.", storedState);
      }
      const [assessment] = await tx.select().from(assessmentsTable).where(eq(assessmentsTable.id, reassessmentAttempt.assessmentId)).limit(1);
      if (!assessment || assessment.moduleId !== courseModule.moduleId) {
        return reject("CAUSAL_REFERENCE_INVALID", "Reassessment is not linked to the learning module.", storedState);
      }
    }

    if (command.targetState === "OUTCOME_VERIFIED" && !outcome) {
      return reject("PREREQUISITE_NOT_MET", "Outcome verification requires an outcome from this activity.", storedState);
    }
    if (command.targetState === "PRACTICE_REQUIRED") {
      const [practiceTask] = await tx.select().from(practiceTasksTable).where(eq(practiceTasksTable.moduleId, courseModule.moduleId)).limit(1);
      if (!practiceTask) return reject("PREREQUISITE_NOT_MET", "No existing practice requirement is linked to this module.", storedState);
    }
    if (command.targetState === "PRACTICE_IN_PROGRESS" && !practiceAttempt) {
      return reject("PREREQUISITE_NOT_MET", "A pathway-scoped practice attempt is required.", storedState);
    }
    if (["EVIDENCE_SUBMITTED", "UNDER_REVIEW"].includes(command.targetState) && !evidence) {
      return reject("EVIDENCE_REQUIRED", "Pathway-scoped evidence is required.", storedState);
    }
    if (command.targetState === "REVISION_REQUIRED" && evidenceReview?.status !== "Needs revision") {
      return reject("REVIEW_REQUIRED", "A Needs revision review event is required.", storedState);
    }
    if (command.targetState === "REMEDIATION" && (!gap || !remediationPlan)) {
      return reject("PREREQUISITE_NOT_MET", "A linked gap and remediation plan are required.", storedState);
    }
    if (command.targetState === "REASSESSMENT") {
      if (!gap || !remediationPlan || !practiceAttempt || !evidence || !evidenceReview || !reassessmentAttempt) {
        return reject("REASSESSMENT_REQUIRED", "Reassessment requires the complete causal remediation chain.", storedState);
      }
    }
    if (["READY", "NOT_READY"].includes(command.targetState) && !reassessmentAttempt) {
      return reject("REASSESSMENT_REQUIRED", "A pathway-scoped reassessment attempt is required.", storedState);
    }
    if (
      command.targetState === "READY" &&
      (!readinessSnapshot || readinessSnapshot.status === "Blocked" || readinessSnapshot.score < 100 || readinessSnapshot.blockers.length > 0)
    ) {
      return reject("SAFETY_BLOCKED", "The existing readiness engine has not cleared this learner for the next stage.", storedState);
    }

    const eventId = `learning-transition-${crypto.randomUUID()}`;
    const [event] = await tx.insert(learningTransitionEventsTable).values({
      id: eventId,
      activityId: activity.id,
      learnerId: command.learnerId,
      enrollmentId: context.enrollment.id,
      programId: command.programId,
      pathwayId: command.pathwayId,
      fromState: command.currentState,
      toState: command.targetState,
      actorId: actor.id,
      actorRole: actor.role,
      entityReference: command.entityReference,
      reason: command.reason,
      idempotencyKey: command.idempotencyKey,
      metadata: { references, idempotencyFingerprint: command.idempotencyFingerprint },
      createdBy: actor.id,
    }).returning();
    if (!event) throw new Error("Learning transition event insert returned no row");

    if (command.targetState === "IN_PROGRESS" || command.targetState === "LEARNING_COMPLETED") {
      await tx.insert(activityCompletionEventsTable).values({
        id: `activity-completion-${crypto.randomUUID()}`,
        activityId: activity.id,
        learnerId: command.learnerId,
        enrollmentId: context.enrollment.id,
        pathwayId: command.pathwayId,
        status: command.targetState === "IN_PROGRESS" ? "STARTED" : "COMPLETED",
        actorId: actor.id,
        metadata: { transitionEventId: event.id },
        createdBy: actor.id,
      });
    }
    if (command.targetState === "OUTCOME_VERIFIED" && outcome) {
      await tx.insert(outcomeVerificationEventsTable).values({
        id: `outcome-verification-${crypto.randomUUID()}`,
        outcomeId: outcome.id,
        activityId: activity.id,
        learnerId: command.learnerId,
        enrollmentId: context.enrollment.id,
        pathwayId: command.pathwayId,
        verifierId: actor.id,
        result: "VERIFIED",
        evidenceId: evidence?.id,
        reason: command.reason,
        createdBy: actor.id,
      });
    }

    if (Object.values(references).some(Boolean)) {
      await tx.insert(learningRecordLinksTable).values({
        id: `learning-record-link-${crypto.randomUUID()}`,
        learnerId: command.learnerId,
        pathwayId: command.pathwayId,
        activityId: activity.id,
        outcomeId: outcome?.id,
        practiceAttemptId: practiceAttempt?.id,
        evidenceId: evidence?.id,
        evidenceReviewId: evidenceReview?.id,
        gapId: gap?.id,
        remediationPlanId: remediationPlan?.id,
        reassessmentAttemptId: reassessmentAttempt?.id,
        relation: command.targetState,
        metadata: { transitionEventId: event.id },
        createdBy: actor.id,
      });
    }

    if (command.targetState === "REASSESSMENT" && gap && remediationPlan && practiceAttempt && evidence && reassessmentAttempt) {
      await tx.insert(reassessmentLinksTable).values({
        id: `reassessment-link-${crypto.randomUUID()}`,
        learnerId: command.learnerId,
        pathwayId: command.pathwayId,
        originalGapId: gap.id,
        remediationPlanId: remediationPlan.id,
        practiceAttemptId: practiceAttempt.id,
        evidenceId: evidence.id,
        reassessmentAttemptId: reassessmentAttempt.id,
        previousAssessmentAttemptId: references.previousAssessmentAttemptId,
        createdBy: actor.id,
      }).onConflictDoNothing();
    }

    if ((command.targetState === "READY" || command.targetState === "NOT_READY") && reassessmentAttempt) {
      const links = await tx.select().from(learningRecordLinksTable).where(and(
        eq(learningRecordLinksTable.learnerId, command.learnerId),
        eq(learningRecordLinksTable.pathwayId, command.pathwayId),
        eq(learningRecordLinksTable.activityId, activity.id),
      ));
      await tx.insert(readinessTransferEventsTable).values({
        id: `readiness-transfer-${crypto.randomUUID()}`,
        learnerId: command.learnerId,
        enrollmentId: context.enrollment.id,
        programId: command.programId,
        pathwayId: command.pathwayId,
        sourceContext: {
          transitionEventId: event.id,
          activityId: activity.id,
          targetState: command.targetState,
          readinessStatus: readinessSnapshot?.status ?? "Not ready",
        },
        learningRecordReferences: links.map(link => link.id),
        practiceReferences: links.flatMap(link => link.practiceAttemptId ? [link.practiceAttemptId] : []),
        evidenceReferences: links.flatMap(link => link.evidenceId ? [link.evidenceId] : []),
        feedbackReferences: links.flatMap(link => link.evidenceReviewId ? [link.evidenceReviewId] : []),
        remediationReferences: links.flatMap(link => link.remediationPlanId ? [link.remediationPlanId] : []),
        reassessmentReferences: [reassessmentAttempt.id],
        triggeredBy: actor.id,
        createdBy: actor.id,
      });
    }

    return { ok: true, statusCode: 201, value: successFromEvent(event, false) };
  };

  return transaction ? execute(transaction) : db.transaction(execute);
}