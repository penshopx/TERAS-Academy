import { relations } from "drizzle-orm";
import {
  boolean, integer, jsonb, pgTable, primaryKey, text, timestamp,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

const audit = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  createdBy: text("created_by").notNull().default("system"),
};

/** Stable catalogue records. Learner state is kept in the event tables below. */
export const peopleTable = pgTable("teras_people", {
  id: text("id").primaryKey(), name: text("name").notNull(), initials: text("initials").notNull(),
  role: text("role").notNull(), organization: text("organization"),
  ...audit,
});
export const programsTable = pgTable("teras_programs", {
  id: text("id").primaryKey(), domain: text("domain").notNull(), name: text("name").notNull(),
  description: text("description").notNull(), status: text("status").notNull(), ...audit,
});
export const pathwaysTable = pgTable("teras_pathways", {
  id: text("id").primaryKey(), programId: text("program_id").notNull().references(() => programsTable.id),
  name: text("name").notNull(), type: text("type").notNull(), outcome: text("outcome").notNull(), ...audit,
});
export const modulesTable = pgTable("teras_modules", {
  id: text("id").primaryKey(), programId: text("program_id").notNull().references(() => programsTable.id),
  sequence: integer("sequence").notNull(), code: text("code").notNull(), name: text("name").notNull(),
  capability: text("capability").notNull(), evidence: text("evidence").notNull(),
  learningOutcomes: text("learning_outcomes").array().notNull(), theory: text("theory").array().notNull(), ...audit,
});
export const practiceTasksTable = pgTable("teras_practice_tasks", {
  id: text("id").primaryKey(), moduleId: text("module_id").notNull().references(() => modulesTable.id),
  title: text("title").notNull(), description: text("description").notNull(), mode: text("mode").notNull(),
  durationMinutes: integer("duration_minutes").notNull(), output: text("output").notNull(), safetyNote: text("safety_note"), ...audit,
});
export const evidenceRequirementsTable = pgTable("teras_evidence_requirements", {
  id: text("id").primaryKey(), moduleId: text("module_id").notNull().references(() => modulesTable.id),
  code: text("code").notNull(), name: text("name").notNull(), description: text("description").notNull(),
  allowedTypes: text("allowed_types").array().notNull(), ...audit,
});
export const assessmentsTable = pgTable("teras_assessments", {
  id: text("id").primaryKey(), moduleId: text("module_id").notNull().references(() => modulesTable.id),
  name: text("name").notNull(), ...audit,
});
export const assessmentCriteriaTable = pgTable("teras_assessment_criteria", {
  id: text("id").primaryKey(), assessmentId: text("assessment_id").notNull().references(() => assessmentsTable.id),
  code: text("code").notNull(), label: text("label").notNull(), layer: text("layer").notNull(),
  critical: boolean("critical").notNull().default(false), ...audit,
});
export const enrollmentsTable = pgTable("teras_enrollments", {
  id: text("id").primaryKey(), learnerId: text("learner_id").notNull().references(() => peopleTable.id),
  programId: text("program_id").notNull().references(() => programsTable.id),
  pathwayId: text("pathway_id").notNull().references(() => pathwaysTable.id), trainerId: text("trainer_id").references(() => peopleTable.id),
  assessorId: text("assessor_id").references(() => peopleTable.id), ...audit,
});

/** Append-only learner activity and review history. No state row is overwritten. */
export const practiceAttemptsTable = pgTable("teras_practice_attempts", {
  id: text("id").primaryKey(), taskId: text("task_id").notNull().references(() => practiceTasksTable.id),
  learnerId: text("learner_id").notNull().references(() => peopleTable.id), reflection: text("reflection").notNull(),
  outputSummary: text("output_summary").notNull(), status: text("status").notNull(), feedback: text("feedback"), ...audit,
});
export const evidenceTable = pgTable("teras_evidence", {
  id: text("id").primaryKey(), learnerId: text("learner_id").notNull().references(() => peopleTable.id),
  moduleId: text("module_id").notNull().references(() => modulesTable.id), taskId: text("task_id").notNull().references(() => practiceTasksTable.id),
  title: text("title").notNull(), type: text("type").notNull(), description: text("description").notNull(), fileName: text("file_name"), ...audit,
});
export const evidenceReviewsTable = pgTable("teras_evidence_reviews", {
  id: text("id").primaryKey(), evidenceId: text("evidence_id").notNull().references(() => evidenceTable.id),
  reviewerId: text("reviewer_id").references(() => peopleTable.id), status: text("status").notNull(),
  comment: text("comment"), quality: jsonb("quality").$type<{ valid: boolean; relevant: boolean; sufficient: boolean; traceable: boolean }>().notNull(), ...audit,
});
export const assessmentAttemptsTable = pgTable("teras_assessment_attempts", {
  id: text("id").primaryKey(), assessmentId: text("assessment_id").notNull().references(() => assessmentsTable.id),
  learnerId: text("learner_id").notNull().references(() => peopleTable.id), number: integer("number").notNull(),
  assessorId: text("assessor_id").references(() => peopleTable.id), status: text("status").notNull(), decision: text("decision"), ...audit,
});
export const criterionObservationsTable = pgTable("teras_criterion_observations", {
  id: text("id").primaryKey(), attemptId: text("attempt_id").notNull().references(() => assessmentAttemptsTable.id),
  criterionId: text("criterion_id").notNull().references(() => assessmentCriteriaTable.id), score: integer("score").notNull(),
  observation: text("observation"), evidenceId: text("evidence_id").references(() => evidenceTable.id), ...audit,
});
export const gapsTable = pgTable("teras_gaps", {
  id: text("id").primaryKey(), learnerId: text("learner_id").notNull().references(() => peopleTable.id),
  moduleId: text("module_id").references(() => modulesTable.id), capability: text("capability").notNull(), criterion: text("criterion").notNull(),
  severity: text("severity").notNull(), priority: text("priority").notNull(), diagnosis: text("diagnosis").notNull(),
  gate: text("gate").notNull(), recommendedAction: text("recommended_action").notNull(), ...audit,
});
export const gapEventsTable = pgTable("teras_gap_events", {
  id: text("id").primaryKey(), gapId: text("gap_id").notNull().references(() => gapsTable.id), status: text("status").notNull(), ...audit,
});
export const remediationPlansTable = pgTable("teras_remediation_plans", {
  id: text("id").primaryKey(), gapId: text("gap_id").notNull().references(() => gapsTable.id), title: text("title").notNull(),
  description: text("description").notNull(), dueLabel: text("due_label"), ...audit,
});
export const remediationActivitiesTable = pgTable("teras_remediation_activities", {
  id: text("id").primaryKey(), planId: text("plan_id").notNull().references(() => remediationPlansTable.id),
  title: text("title").notNull(), description: text("description").notNull(), type: text("type").notNull(), ...audit,
});
export const remediationEventsTable = pgTable("teras_remediation_events", {
  id: text("id").primaryKey(), activityId: text("activity_id").notNull().references(() => remediationActivitiesTable.id),
  status: text("status").notNull(), ...audit,
});
export const readinessGatesTable = pgTable("teras_readiness_gates", {
  id: text("id").primaryKey(), programId: text("program_id").notNull().references(() => programsTable.id),
  sequence: integer("sequence").notNull(), code: text("code").notNull(), name: text("name").notNull(), requirement: text("requirement").notNull(), ...audit,
});
export const readinessEventsTable = pgTable("teras_readiness_events", {
  id: text("id").primaryKey(), enrollmentId: text("enrollment_id").notNull().references(() => enrollmentsTable.id),
  gateId: text("gate_id").notNull().references(() => readinessGatesTable.id), status: text("status").notNull(),
  score: integer("score").notNull(), blockers: text("blockers").array().notNull().default([]), ...audit,
});

export const programRelations = relations(programsTable, ({ many }) => ({ modules: many(modulesTable), pathways: many(pathwaysTable) }));
export const moduleRelations = relations(modulesTable, ({ many }) => ({ tasks: many(practiceTasksTable), assessments: many(assessmentsTable) }));

const tables = { peopleTable, programsTable, pathwaysTable, modulesTable, practiceTasksTable, evidenceRequirementsTable, assessmentsTable, assessmentCriteriaTable, enrollmentsTable, practiceAttemptsTable, evidenceTable, evidenceReviewsTable, assessmentAttemptsTable, criterionObservationsTable, gapsTable, gapEventsTable, remediationPlansTable, remediationActivitiesTable, remediationEventsTable, readinessGatesTable, readinessEventsTable };
export const insertSchemas = Object.fromEntries(Object.entries(tables).map(([name, table]) => [name, createInsertSchema(table).omit({ createdAt: true })]));
export type Person = typeof peopleTable.$inferSelect;
export type Program = typeof programsTable.$inferSelect;
export type InsertProgram = z.infer<typeof insertSchemas.programsTable>;