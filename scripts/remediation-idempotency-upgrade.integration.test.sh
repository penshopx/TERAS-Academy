#!/bin/bash
set -euo pipefail
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"
: "${DATABASE_URL:?DATABASE_URL must be set}"
schema="teras_remediation_upgrade_test_$$"
cleanup() { psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "DROP SCHEMA IF EXISTS \"$schema\" CASCADE" >/dev/null; }
trap cleanup EXIT
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<SQL >/dev/null
CREATE SCHEMA "$schema";
CREATE TABLE "$schema".teras_remediation_events (
  id text PRIMARY KEY,
  activity_id text NOT NULL,
  status text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL DEFAULT 'system'
);
INSERT INTO "$schema".teras_remediation_events (id, activity_id, status, created_by)
VALUES ('legacy-event', 'legacy-activity', 'In progress', 'legacy-learner');
SQL
export PGOPTIONS="-c search_path=$schema"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f lib/db/migrations/0007_remediation_activity_idempotency.sql >/dev/null
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f lib/db/migrations/0007_remediation_activity_idempotency.sql >/dev/null
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "INSERT INTO teras_remediation_events (id, activity_id, status, idempotency_key, idempotency_fingerprint, created_by) VALUES ('completed-event', 'legacy-activity', 'Completed', 'learner-key', 'payload-fingerprint', 'legacy-learner')" >/dev/null
if psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "INSERT INTO teras_remediation_events (id, activity_id, status, idempotency_key, idempotency_fingerprint) VALUES ('duplicate-event', 'legacy-activity', 'Completed', 'learner-key', 'different')" >/dev/null 2>&1; then
  echo "Remediation idempotency uniqueness was not enforced" >&2
  exit 1
fi
state="$(psql "$DATABASE_URL" -Atqc "SELECT count(*), count(*) FILTER (WHERE id = 'legacy-event' AND idempotency_key IS NULL), count(*) FILTER (WHERE id = 'completed-event' AND idempotency_fingerprint = 'payload-fingerprint') FROM teras_remediation_events")"
if [ "$state" != "2|1|1" ]; then
  echo "Remediation idempotency upgrade did not preserve old data and accept endpoint-shaped writes: $state" >&2
  exit 1
fi