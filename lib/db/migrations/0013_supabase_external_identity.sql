BEGIN;

-- Keep clerk_user_id intact for historical auditability. New authentication
-- resolves only this provider-neutral pair, preventing cross-provider subject
-- collisions while allowing a deliberate operator migration per person.
ALTER TABLE teras_people ADD COLUMN IF NOT EXISTS auth_provider text;
ALTER TABLE teras_people ADD COLUMN IF NOT EXISTS auth_subject text;
UPDATE teras_people
  SET auth_provider = 'clerk', auth_subject = clerk_user_id
  WHERE clerk_user_id IS NOT NULL
    AND (auth_provider IS NULL OR auth_subject IS NULL);
CREATE UNIQUE INDEX IF NOT EXISTS teras_people_external_auth_identity_unique
  ON teras_people(auth_provider, auth_subject)
  WHERE auth_provider IS NOT NULL AND auth_subject IS NOT NULL;

-- Preserve existing Clerk audit values and record future provider-neutral
-- actors without rewriting immutable historical events.
ALTER TABLE teras_admin_audit_events ADD COLUMN IF NOT EXISTS actor_auth_provider text;
ALTER TABLE teras_admin_audit_events ADD COLUMN IF NOT EXISTS actor_auth_subject text;
UPDATE teras_admin_audit_events
  SET actor_auth_provider = 'clerk', actor_auth_subject = actor_clerk_user_id
  WHERE actor_auth_provider IS NULL OR actor_auth_subject IS NULL;

COMMIT;