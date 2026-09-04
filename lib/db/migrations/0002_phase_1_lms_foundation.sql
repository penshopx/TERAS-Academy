BEGIN;

-- Additive Phase 1 LMS learning layer. Existing capability tables are not altered.
CREATE TABLE IF NOT EXISTS teras_courses (
  id text PRIMARY KEY,
  program_id text NOT NULL REFERENCES teras_programs(id),
  pathway_id text NOT NULL REFERENCES teras_pathways(id),
  title text NOT NULL,
  description text NOT NULL,
  status text NOT NULL DEFAULT 'DRAFT',
  sequence integer NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL DEFAULT 'system',
  CONSTRAINT teras_courses_pathway_program_fk FOREIGN KEY (pathway_id, program_id)
    REFERENCES teras_pathways(id, program_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS teras_courses_pathway_sequence_unique ON teras_courses(pathway_id, sequence);

CREATE TABLE IF NOT EXISTS teras_course_modules (
  id text PRIMARY KEY,
  course_id text NOT NULL REFERENCES teras_courses(id),
  module_id text NOT NULL REFERENCES teras_modules(id),
  program_id text NOT NULL REFERENCES teras_programs(id),
  pathway_id text NOT NULL REFERENCES teras_pathways(id),
  sequence integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL DEFAULT 'system'
);
CREATE UNIQUE INDEX IF NOT EXISTS teras_course_modules_course_module_unique ON teras_course_modules(course_id, module_id);
CREATE UNIQUE INDEX IF NOT EXISTS teras_course_modules_course_sequence_unique ON teras_course_modules(course_id, sequence);

CREATE TABLE IF NOT EXISTS teras_lessons (
  id text PRIMARY KEY,
  course_module_id text NOT NULL REFERENCES teras_course_modules(id),
  program_id text NOT NULL REFERENCES teras_programs(id),
  pathway_id text NOT NULL REFERENCES teras_pathways(id),
  title text NOT NULL,
  description text NOT NULL,
  sequence integer NOT NULL,
  status text NOT NULL DEFAULT 'DRAFT',
  estimated_duration_minutes integer NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL DEFAULT 'system'
);
CREATE UNIQUE INDEX IF NOT EXISTS teras_lessons_course_module_sequence_unique ON teras_lessons(course_module_id, sequence);

CREATE TABLE IF NOT EXISTS teras_learning_activities (
  id text PRIMARY KEY,
  lesson_id text NOT NULL REFERENCES teras_lessons(id),
  program_id text NOT NULL REFERENCES teras_programs(id),
  pathway_id text NOT NULL REFERENCES teras_pathways(id),
  type text NOT NULL,
  title text NOT NULL,
  description text NOT NULL,
  sequence integer NOT NULL,
  required boolean NOT NULL DEFAULT true,
  estimated_duration_minutes integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'DRAFT',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL DEFAULT 'system'
);
CREATE UNIQUE INDEX IF NOT EXISTS teras_learning_activities_lesson_sequence_unique ON teras_learning_activities(lesson_id, sequence);
CREATE UNIQUE INDEX IF NOT EXISTS teras_learning_activities_id_pathway_unique ON teras_learning_activities(id, pathway_id);

CREATE TABLE IF NOT EXISTS teras_content_resources (
  id text PRIMARY KEY,
  activity_id text NOT NULL REFERENCES teras_learning_activities(id),
  type text NOT NULL,
  title text NOT NULL,
  uri text,
  content text,
  sequence integer NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL DEFAULT 'system'
);
CREATE UNIQUE INDEX IF NOT EXISTS teras_content_resources_activity_sequence_unique ON teras_content_resources(activity_id, sequence);

CREATE TABLE IF NOT EXISTS teras_learning_outcomes (
  id text PRIMARY KEY,
  activity_id text NOT NULL REFERENCES teras_learning_activities(id),
  capability_module_id text REFERENCES teras_modules(id),
  description text NOT NULL,
  verification_method text NOT NULL,
  required boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL DEFAULT 'system'
);
CREATE UNIQUE INDEX IF NOT EXISTS teras_learning_outcomes_activity_description_unique ON teras_learning_outcomes(activity_id, description);

CREATE TABLE IF NOT EXISTS teras_activity_completion_events (
  id text PRIMARY KEY,
  activity_id text NOT NULL REFERENCES teras_learning_activities(id),
  learner_id text NOT NULL REFERENCES teras_people(id),
  enrollment_id text NOT NULL REFERENCES teras_enrollments(id),
  pathway_id text NOT NULL REFERENCES teras_pathways(id),
  status text NOT NULL,
  actor_id text NOT NULL REFERENCES teras_people(id),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL DEFAULT 'system'
);
CREATE INDEX IF NOT EXISTS teras_activity_completion_lookup_idx ON teras_activity_completion_events(activity_id, learner_id, pathway_id, created_at);

CREATE TABLE IF NOT EXISTS teras_outcome_verification_events (
  id text PRIMARY KEY,
  outcome_id text NOT NULL REFERENCES teras_learning_outcomes(id),
  activity_id text NOT NULL REFERENCES teras_learning_activities(id),
  learner_id text NOT NULL REFERENCES teras_people(id),
  enrollment_id text NOT NULL REFERENCES teras_enrollments(id),
  pathway_id text NOT NULL REFERENCES teras_pathways(id),
  verifier_id text NOT NULL REFERENCES teras_people(id),
  result text NOT NULL,
  evidence_id text REFERENCES teras_evidence(id),
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL DEFAULT 'system'
);
CREATE INDEX IF NOT EXISTS teras_outcome_verification_lookup_idx ON teras_outcome_verification_events(outcome_id, learner_id, pathway_id, created_at);

CREATE TABLE IF NOT EXISTS teras_learning_record_links (
  id text PRIMARY KEY,
  learner_id text NOT NULL REFERENCES teras_people(id),
  pathway_id text NOT NULL REFERENCES teras_pathways(id),
  activity_id text NOT NULL REFERENCES teras_learning_activities(id),
  outcome_id text REFERENCES teras_learning_outcomes(id),
  practice_attempt_id text REFERENCES teras_practice_attempts(id),
  evidence_id text REFERENCES teras_evidence(id),
  evidence_review_id text REFERENCES teras_evidence_reviews(id),
  gap_id text REFERENCES teras_gaps(id),
  remediation_plan_id text REFERENCES teras_remediation_plans(id),
  reassessment_attempt_id text REFERENCES teras_assessment_attempts(id),
  relation text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL DEFAULT 'system'
);
CREATE INDEX IF NOT EXISTS teras_learning_record_links_pathway_activity_created_idx ON teras_learning_record_links(pathway_id, activity_id, created_at);

CREATE TABLE IF NOT EXISTS teras_reassessment_links (
  id text PRIMARY KEY,
  learner_id text NOT NULL REFERENCES teras_people(id),
  pathway_id text NOT NULL REFERENCES teras_pathways(id),
  original_gap_id text NOT NULL REFERENCES teras_gaps(id),
  remediation_plan_id text NOT NULL REFERENCES teras_remediation_plans(id),
  practice_attempt_id text NOT NULL REFERENCES teras_practice_attempts(id),
  evidence_id text NOT NULL REFERENCES teras_evidence(id),
  reassessment_attempt_id text NOT NULL REFERENCES teras_assessment_attempts(id),
  previous_assessment_attempt_id text REFERENCES teras_assessment_attempts(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL DEFAULT 'system'
);
CREATE UNIQUE INDEX IF NOT EXISTS teras_reassessment_links_attempt_unique ON teras_reassessment_links(reassessment_attempt_id);

CREATE TABLE IF NOT EXISTS teras_readiness_transfer_events (
  id text PRIMARY KEY,
  learner_id text NOT NULL REFERENCES teras_people(id),
  enrollment_id text NOT NULL REFERENCES teras_enrollments(id),
  program_id text NOT NULL REFERENCES teras_programs(id),
  pathway_id text NOT NULL REFERENCES teras_pathways(id),
  source_context jsonb NOT NULL,
  learning_record_references text[] NOT NULL DEFAULT '{}',
  practice_references text[] NOT NULL DEFAULT '{}',
  evidence_references text[] NOT NULL DEFAULT '{}',
  feedback_references text[] NOT NULL DEFAULT '{}',
  remediation_references text[] NOT NULL DEFAULT '{}',
  reassessment_references text[] NOT NULL DEFAULT '{}',
  triggered_by text NOT NULL REFERENCES teras_people(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL DEFAULT 'system'
);
CREATE INDEX IF NOT EXISTS teras_readiness_transfer_lookup_idx ON teras_readiness_transfer_events(learner_id, pathway_id, created_at);

CREATE TABLE IF NOT EXISTS teras_learning_transition_events (
  id text PRIMARY KEY,
  activity_id text NOT NULL REFERENCES teras_learning_activities(id),
  learner_id text NOT NULL REFERENCES teras_people(id),
  enrollment_id text NOT NULL REFERENCES teras_enrollments(id),
  program_id text NOT NULL REFERENCES teras_programs(id),
  pathway_id text NOT NULL REFERENCES teras_pathways(id),
  from_state text NOT NULL,
  to_state text NOT NULL,
  actor_id text NOT NULL REFERENCES teras_people(id),
  actor_role text NOT NULL,
  entity_reference text NOT NULL,
  reason text NOT NULL,
  idempotency_key text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL DEFAULT 'system'
);
CREATE UNIQUE INDEX IF NOT EXISTS teras_learning_transition_idempotency_unique ON teras_learning_transition_events(idempotency_key);
CREATE INDEX IF NOT EXISTS teras_learning_transition_state_lookup_idx ON teras_learning_transition_events(activity_id, learner_id, pathway_id, created_at);

COMMIT;