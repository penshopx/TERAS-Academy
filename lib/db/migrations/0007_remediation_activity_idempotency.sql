ALTER TABLE teras_remediation_events
  ADD COLUMN IF NOT EXISTS idempotency_key text,
  ADD COLUMN IF NOT EXISTS idempotency_fingerprint text;

CREATE UNIQUE INDEX IF NOT EXISTS teras_remediation_events_idempotency_unique
  ON teras_remediation_events (idempotency_key);