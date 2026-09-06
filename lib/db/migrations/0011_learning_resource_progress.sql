BEGIN;

-- Presentation position is deliberately separate from append-only learning
-- transitions. Existing canonical completion and readiness lifecycle rows are
-- neither changed nor derived from this table.
CREATE TABLE IF NOT EXISTS teras_learning_resource_progress (
  id text PRIMARY KEY,
  learner_id text NOT NULL REFERENCES teras_people(id),
  enrollment_id text NOT NULL REFERENCES teras_enrollments(id),
  pathway_id text NOT NULL REFERENCES teras_pathways(id),
  activity_id text NOT NULL REFERENCES teras_learning_activities(id),
  resource_id text NOT NULL REFERENCES teras_content_resources(id),
  position integer NOT NULL DEFAULT 0 CHECK (position >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL DEFAULT 'system'
);
CREATE UNIQUE INDEX IF NOT EXISTS teras_learning_resource_progress_scope_unique
  ON teras_learning_resource_progress(learner_id, enrollment_id, activity_id, resource_id);
CREATE INDEX IF NOT EXISTS teras_learning_resource_progress_lookup_idx
  ON teras_learning_resource_progress(learner_id, enrollment_id, activity_id, resource_id);

COMMIT;