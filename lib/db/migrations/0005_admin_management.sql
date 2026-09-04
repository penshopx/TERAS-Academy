BEGIN;

ALTER TABLE teras_people ADD COLUMN IF NOT EXISTS clerk_user_id text;
ALTER TABLE teras_people ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';
CREATE UNIQUE INDEX IF NOT EXISTS teras_people_clerk_user_id_unique
  ON teras_people(clerk_user_id) WHERE clerk_user_id IS NOT NULL;
ALTER TABLE teras_pathways ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';
ALTER TABLE teras_enrollments ADD COLUMN IF NOT EXISTS cohort_id text;
ALTER TABLE teras_enrollments ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';

-- Old records predate normalized lifecycle values.  Preserve only recognized
-- values and make their representation deterministic before policy queries.
UPDATE teras_people SET status = lower(trim(status))
  WHERE lower(trim(status)) IN ('active', 'inactive') AND status <> lower(trim(status));
UPDATE teras_people SET status = 'active'
  WHERE status IS NULL OR lower(trim(status)) NOT IN ('active', 'inactive');

CREATE TABLE IF NOT EXISTS teras_person_roles (
  person_id text NOT NULL REFERENCES teras_people(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('admin', 'trainer', 'assessor', 'learner')),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL DEFAULT 'system',
  PRIMARY KEY (person_id, role)
);
-- Compatibility backfill is intentionally restricted to the supported role
-- vocabulary: job-title values must never accidentally become privileges.
INSERT INTO teras_person_roles (person_id, role, created_by)
SELECT id, lower(trim(role)), 'migration-0005-backfill'
FROM teras_people
WHERE lower(trim(role)) IN ('admin', 'trainer', 'assessor', 'learner')
ON CONFLICT (person_id, role) DO NOTHING;

-- Bootstrap only explicitly configured Clerk identities which already have a
-- local active person record.  The custom setting is supplied by post-merge;
-- an absent/empty setting grants nobody administrative authority.
INSERT INTO teras_person_roles (person_id, role, created_by)
SELECT p.id, 'admin', 'migration-0005-bootstrap'
FROM teras_people p
JOIN unnest(string_to_array(coalesce(current_setting('teras.admin_clerk_user_ids', true), ''), ',')) configured(id)
  ON p.clerk_user_id = trim(configured.id)
WHERE p.status = 'active' AND trim(configured.id) <> ''
ON CONFLICT (person_id, role) DO NOTHING;
CREATE TABLE IF NOT EXISTS teras_cohorts (
  id text PRIMARY KEY,
  program_id text NOT NULL REFERENCES teras_programs(id),
  name text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  starts_on timestamptz,
  ends_on timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL DEFAULT 'system',
  UNIQUE (program_id, name)
);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'teras_enrollments_cohort_id_fk') THEN
    ALTER TABLE teras_enrollments ADD CONSTRAINT teras_enrollments_cohort_id_fk
      FOREIGN KEY (cohort_id) REFERENCES teras_cohorts(id);
  END IF;
END $$;
CREATE TABLE IF NOT EXISTS teras_admin_audit_events (
  id text PRIMARY KEY,
  actor_person_id text REFERENCES teras_people(id),
  actor_clerk_user_id text NOT NULL,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  before jsonb,
  after jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL DEFAULT 'system'
);
CREATE INDEX IF NOT EXISTS teras_admin_audit_events_entity_idx
  ON teras_admin_audit_events(entity_type, entity_id, created_at DESC);

COMMIT;