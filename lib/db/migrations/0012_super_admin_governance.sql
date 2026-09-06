BEGIN;

-- Expand only the normalized privilege vocabulary. Existing role assignments
-- remain untouched and this script is safe to rehearse on an upgraded install.
ALTER TABLE teras_person_roles DROP CONSTRAINT IF EXISTS teras_person_roles_role_check;
ALTER TABLE teras_person_roles ADD CONSTRAINT teras_person_roles_role_check
  CHECK (role IN ('super_admin', 'admin', 'trainer', 'assessor', 'learner'));

CREATE TABLE IF NOT EXISTS teras_admin_access_requests (
  id text PRIMARY KEY,
  requester_person_id text NOT NULL REFERENCES teras_people(id) ON DELETE CASCADE,
  target_person_id text NOT NULL REFERENCES teras_people(id) ON DELETE CASCADE,
  requested_role text NOT NULL CHECK (requested_role IN ('admin', 'super_admin')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reason text,
  reviewed_by_person_id text REFERENCES teras_people(id),
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL DEFAULT 'system'
);
-- Early versions of this upgrade recorded only the requesting administrator.
-- Retain those requests safely by treating their requester as their target.
ALTER TABLE teras_admin_access_requests ADD COLUMN IF NOT EXISTS target_person_id text;
UPDATE teras_admin_access_requests
  SET target_person_id = requester_person_id
  WHERE target_person_id IS NULL;
ALTER TABLE teras_admin_access_requests ALTER COLUMN target_person_id SET NOT NULL;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'teras_admin_access_requests_target_person_id_fkey') THEN
    ALTER TABLE teras_admin_access_requests ADD CONSTRAINT teras_admin_access_requests_target_person_id_fkey
      FOREIGN KEY (target_person_id) REFERENCES teras_people(id) ON DELETE CASCADE;
  END IF;
END $$;
DROP INDEX IF EXISTS teras_admin_access_requests_pending_unique;
CREATE UNIQUE INDEX IF NOT EXISTS teras_admin_access_requests_pending_unique
  ON teras_admin_access_requests(target_person_id, requested_role)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS teras_admin_access_requests_status_created_idx
  ON teras_admin_access_requests(status, created_at DESC);

COMMIT;