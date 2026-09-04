import {
  boolean,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import {
  assessmentAttemptsTable,
  enrollmentsTable,
  evidenceReviewsTable,
  evidenceTable,
  gapsTable,
  modulesTable,
  pathwaysTable,
  peopleTable,
  practiceAttemptsTable,
  programsTable,
  remediationPlansTable,
} from "./teras";

const catalogueAudit = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  createdBy: text("created_by").notNull().default("system"),
};

const eventAudit = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  createdBy: text("created_by").notNull().default("system"),
};

export const coursesTable = pgTable("teras_courses", {
  id: text("id").primaryKey(),
  programId: text("program_id").notNull().references(() => programsTable.id),
  pathwayId: text("pathway_id").notNull().references(() => pathwaysTable.id),
  title: text("title").notNull(),
  description: text("description").notNull(),
  status: text("status").notNull().default("DRAFT"),
  sequence: integer("sequence").notNull(),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  ...catalogueAudit,
}, table => [
  foreignKey({
    columns: [table.pathwayId, table.programId],
    foreignColumns: [pathwaysTable.id, pathwaysTable.programId],
    name: "teras_courses_pathway_program_fk",
  }),
  uniqueIndex("teras_courses_pathway_sequence_unique").on(table.pathwayId, table.sequence),
]);

/** Additive link: the capability module remains the canonical module record. */
export const courseModulesTable = pgTable("teras_course_modules", {
  id: text("id").primaryKey(),
  courseId: text("course_id").notNull().references(() => coursesTable.id),
  moduleId: text("module_id").notNull().references(() => modulesTable.id),
  programId: text("program_id").notNull().references(() => programsTable.id),
  pathwayId: text("pathway_id").notNull().references(() => pathwaysTable.id),
  sequence: integer("sequence").notNull(),
  ...catalogueAudit,
}, table => [
  uniqueIndex("teras_course_modules_course_module_unique").on(table.courseId, table.moduleId),
  uniqueIndex("teras_course_modules_course_sequence_unique").on(table.courseId, table.sequence),
]);

export const lessonsTable = pgTable("teras_lessons", {
  id: text("id").primaryKey(),
  courseModuleId: text("course_module_id").notNull().references(() => courseModulesTable.id),
  programId: text("program_id").notNull().references(() => programsTable.id),
  pathwayId: text("pathway_id").notNull().references(() => pathwaysTable.id),
  title: text("title").notNull(),
  description: text("description").notNull(),
  sequence: integer("sequence").notNull(),
  status: text("status").notNull().default("DRAFT"),
  estimatedDurationMinutes: integer("estimated_duration_minutes").notNull().default(0),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  ...catalogueAudit,
}, table => [
  uniqueIndex("teras_lessons_course_module_sequence_unique").on(table.courseModuleId, table.sequence),
]);

export const learningActivitiesTable = pgTable("teras_learning_activities", {
  id: text("id").primaryKey(),
  lessonId: text("lesson_id").notNull().references(() => lessonsTable.id),
  programId: text("program_id").notNull().references(() => programsTable.id),
  pathwayId: text("pathway_id").notNull().references(() => pathwaysTable.id),
  type: text("type").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  sequence: integer("sequence").notNull(),
  required: boolean("required").notNull().default(true),
  estimatedDurationMinutes: integer("estimated_duration_minutes").notNull().default(0),
  status: text("status").notNull().default("DRAFT"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  ...catalogueAudit,
}, table => [
  uniqueIndex("teras_learning_activities_lesson_sequence_unique").on(table.lessonId, table.sequence),
  uniqueIndex("teras_learning_activities_id_pathway_unique").on(table.id, table.pathwayId),
]);

export const contentResourcesTable = pgTable("teras_content_resources", {
  id: text("id").primaryKey(),
  activityId: text("activity_id").notNull().references(() => learningActivitiesTable.id),
  type: text("type").notNull(),
  title: text("title").notNull(),
  uri: text("uri"),
  content: text("content"),
  sequence: integer("sequence").notNull(),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  ...catalogueAudit,
}, table => [
  uniqueIndex("teras_content_resources_activity_sequence_unique").on(table.activityId, table.sequence),
]);

export const learningOutcomesTable = pgTable("teras_learning_outcomes", {
  id: text("id").primaryKey(),
  activityId: text("activity_id").notNull().references(() => learningActivitiesTable.id),
  capabilityModuleId: text("capability_module_id").references(() => modulesTable.id),
  description: text("description").notNull(),
  verificationMethod: text("verification_method").notNull(),
  required: boolean("required").notNull().default(true),
  ...catalogueAudit,
}, table => [
  uniqueIndex("teras_learning_outcomes_activity_description_unique").on(table.activityId, table.description),
]);

export const activityCompletionEventsTable = pgTable("teras_activity_completion_events", {
  id: text("id").primaryKey(),
  activityId: text("activity_id").notNull().references(() => learningActivitiesTable.id),
  learnerId: text("learner_id").notNull().references(() => peopleTable.id),
  enrollmentId: text("enrollment_id").notNull().references(() => enrollmentsTable.id),
  pathwayId: text("pathway_id").notNull().references(() => pathwaysTable.id),
  status: text("status").notNull(),
  actorId: text("actor_id").notNull().references(() => peopleTable.id),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  ...eventAudit,
}, table => [
  index("teras_activity_completion_lookup_idx").on(table.activityId, table.learnerId, table.pathwayId, table.createdAt),
]);

export const outcomeVerificationEventsTable = pgTable("teras_outcome_verification_events", {
  id: text("id").primaryKey(),
  outcomeId: text("outcome_id").notNull().references(() => learningOutcomesTable.id),
  activityId: text("activity_id").notNull().references(() => learningActivitiesTable.id),
  learnerId: text("learner_id").notNull().references(() => peopleTable.id),
  enrollmentId: text("enrollment_id").notNull().references(() => enrollmentsTable.id),
  pathwayId: text("pathway_id").notNull().references(() => pathwaysTable.id),
  verifierId: text("verifier_id").notNull().references(() => peopleTable.id),
  result: text("result").notNull(),
  evidenceId: text("evidence_id").references(() => evidenceTable.id),
  reason: text("reason").notNull(),
  ...eventAudit,
}, table => [
  index("teras_outcome_verification_lookup_idx").on(table.outcomeId, table.learnerId, table.pathwayId, table.createdAt),
]);

/** Causal linkage only; existing domain tables remain the source of truth. */
export const learningRecordLinksTable = pgTable("teras_learning_record_links", {
  id: text("id").primaryKey(),
  learnerId: text("learner_id").notNull().references(() => peopleTable.id),
  pathwayId: text("pathway_id").notNull().references(() => pathwaysTable.id),
  activityId: text("activity_id").notNull().references(() => learningActivitiesTable.id),
  outcomeId: text("outcome_id").references(() => learningOutcomesTable.id),
  practiceAttemptId: text("practice_attempt_id").references(() => practiceAttemptsTable.id),
  evidenceId: text("evidence_id").references(() => evidenceTable.id),
  evidenceReviewId: text("evidence_review_id").references(() => evidenceReviewsTable.id),
  gapId: text("gap_id").references(() => gapsTable.id),
  remediationPlanId: text("remediation_plan_id").references(() => remediationPlansTable.id),
  reassessmentAttemptId: text("reassessment_attempt_id").references(() => assessmentAttemptsTable.id),
  relation: text("relation").notNull(),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  ...eventAudit,
}, table => [
  index("teras_learning_record_links_pathway_activity_created_idx").on(table.pathwayId, table.activityId, table.createdAt),
]);

export const reassessmentLinksTable = pgTable("teras_reassessment_links", {
  id: text("id").primaryKey(),
  learnerId: text("learner_id").notNull().references(() => peopleTable.id),
  pathwayId: text("pathway_id").notNull().references(() => pathwaysTable.id),
  originalGapId: text("original_gap_id").notNull().references(() => gapsTable.id),
  remediationPlanId: text("remediation_plan_id").notNull().references(() => remediationPlansTable.id),
  practiceAttemptId: text("practice_attempt_id").notNull().references(() => practiceAttemptsTable.id),
  evidenceId: text("evidence_id").notNull().references(() => evidenceTable.id),
  reassessmentAttemptId: text("reassessment_attempt_id").notNull().references(() => assessmentAttemptsTable.id),
  previousAssessmentAttemptId: text("previous_assessment_attempt_id").references(() => assessmentAttemptsTable.id),
  ...eventAudit,
}, table => [
  uniqueIndex("teras_reassessment_links_attempt_unique").on(table.reassessmentAttemptId),
]);

export const readinessTransferEventsTable = pgTable("teras_readiness_transfer_events", {
  id: text("id").primaryKey(),
  learnerId: text("learner_id").notNull().references(() => peopleTable.id),
  enrollmentId: text("enrollment_id").notNull().references(() => enrollmentsTable.id),
  programId: text("program_id").notNull().references(() => programsTable.id),
  pathwayId: text("pathway_id").notNull().references(() => pathwaysTable.id),
  sourceContext: jsonb("source_context").$type<Record<string, unknown>>().notNull(),
  learningRecordReferences: text("learning_record_references").array().notNull().default([]),
  practiceReferences: text("practice_references").array().notNull().default([]),
  evidenceReferences: text("evidence_references").array().notNull().default([]),
  feedbackReferences: text("feedback_references").array().notNull().default([]),
  remediationReferences: text("remediation_references").array().notNull().default([]),
  reassessmentReferences: text("reassessment_references").array().notNull().default([]),
  triggeredBy: text("triggered_by").notNull().references(() => peopleTable.id),
  ...eventAudit,
}, table => [
  index("teras_readiness_transfer_lookup_idx").on(table.learnerId, table.pathwayId, table.createdAt),
]);

export const learningTransitionEventsTable = pgTable("teras_learning_transition_events", {
  id: text("id").primaryKey(),
  activityId: text("activity_id").notNull().references(() => learningActivitiesTable.id),
  learnerId: text("learner_id").notNull().references(() => peopleTable.id),
  enrollmentId: text("enrollment_id").notNull().references(() => enrollmentsTable.id),
  programId: text("program_id").notNull().references(() => programsTable.id),
  pathwayId: text("pathway_id").notNull().references(() => pathwaysTable.id),
  fromState: text("from_state").notNull(),
  toState: text("to_state").notNull(),
  actorId: text("actor_id").notNull().references(() => peopleTable.id),
  actorRole: text("actor_role").notNull(),
  entityReference: text("entity_reference").notNull(),
  reason: text("reason").notNull(),
  idempotencyKey: text("idempotency_key").notNull(),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  ...eventAudit,
}, table => [
  uniqueIndex("teras_learning_transition_idempotency_unique").on(table.idempotencyKey),
  index("teras_learning_transition_state_lookup_idx").on(table.activityId, table.learnerId, table.pathwayId, table.createdAt),
]);

const lmsTables = {
  coursesTable,
  courseModulesTable,
  lessonsTable,
  learningActivitiesTable,
  contentResourcesTable,
  learningOutcomesTable,
  activityCompletionEventsTable,
  outcomeVerificationEventsTable,
  learningRecordLinksTable,
  reassessmentLinksTable,
  readinessTransferEventsTable,
  learningTransitionEventsTable,
};

export const lmsInsertSchemas = Object.fromEntries(
  Object.entries(lmsTables).map(([name, table]) => [
    name,
    createInsertSchema(table).omit({ createdAt: true }),
  ]),
);

export type Course = typeof coursesTable.$inferSelect;
export type LearningActivity = typeof learningActivitiesTable.$inferSelect;
export type LearningTransitionEvent = typeof learningTransitionEventsTable.$inferSelect;
export type InsertCourse = z.infer<typeof lmsInsertSchemas.coursesTable>;