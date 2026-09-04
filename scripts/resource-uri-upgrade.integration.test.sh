#!/bin/bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

: "${DATABASE_URL:?DATABASE_URL must be set}"

schema="teras_uri_upgrade_test_$$"
cleanup() {
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
    -c "DROP SCHEMA IF EXISTS \"$schema\" CASCADE" >/dev/null
}
trap cleanup EXIT

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<SQL >/dev/null
CREATE SCHEMA "$schema";
CREATE TABLE "$schema".teras_content_resources (
  id text PRIMARY KEY,
  uri text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO "$schema".teras_content_resources (id, uri) VALUES
  ('safe-http', 'http://example.com/material.pdf'),
  ('safe-https', 'https://example.com/material.pdf'),
  ('unsafe-javascript', 'javascript:alert(1)'),
  ('unsafe-data', 'data:text/html,<script>alert(1)</script>'),
  ('unsafe-relative', '/material.pdf'),
  ('unsafe-malformed', 'https://');
SQL

export PGOPTIONS="-c search_path=$schema"
TERAS_MIGRATION_ACTOR=integration-test \
  bash scripts/apply-resource-uri-upgrade.sh >/dev/null

result="$(psql "$DATABASE_URL" -Atv ON_ERROR_STOP=1 <<'SQL'
SELECT
  count(*) FILTER (WHERE id LIKE 'unsafe-%' AND uri IS NULL),
  count(*) FILTER (WHERE id LIKE 'safe-%' AND uri IS NOT NULL)
FROM teras_content_resources;
SELECT count(*)
FROM teras_content_resource_uri_audit
WHERE action = 'QUARANTINED'
  AND actor = 'integration-test'
  AND original_uri IN (
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    '/material.pdf',
    'https://'
  );
SQL
)"

if [ "$result" != $'4|2\n4' ]; then
  echo "Resource URI upgrade did not quarantine and audit the expected records: $result" >&2
  exit 1
fi

# A repeat is safe and must not create duplicate unresolved audit records.
TERAS_MIGRATION_ACTOR=integration-test \
  bash scripts/apply-resource-uri-upgrade.sh >/dev/null
audit_count="$(psql "$DATABASE_URL" -Atqc \
  "SELECT count(*) FROM teras_content_resource_uri_audit")"
if [ "$audit_count" != "4" ]; then
  echo "Repeated resource URI upgrade created duplicate audit records." >&2
  exit 1
fi