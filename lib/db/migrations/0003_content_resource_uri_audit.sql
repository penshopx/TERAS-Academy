BEGIN;

-- Preserve unsafe legacy URI values and their disposition before quarantining.
CREATE TABLE IF NOT EXISTS teras_content_resource_uri_audit (
  id text PRIMARY KEY,
  resource_id text NOT NULL REFERENCES teras_content_resources(id),
  original_uri text NOT NULL,
  finding text NOT NULL,
  action text NOT NULL,
  actor text NOT NULL,
  audited_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolution_note text
);

CREATE INDEX IF NOT EXISTS teras_content_resource_uri_audit_resource_idx
  ON teras_content_resource_uri_audit(resource_id, audited_at);

COMMIT;