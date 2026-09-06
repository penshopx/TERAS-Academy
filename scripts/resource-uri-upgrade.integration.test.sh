#!/bin/bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"
source "$repo_root/scripts/cleanup-diagnostics.sh"

: "${DATABASE_URL:?DATABASE_URL must be set}"

schema="teras_uri_upgrade_test_$$"
test_database="teras_uri_upgrade_db_$$"
cleanup() {
  local test_exit=$?
  local cleanup_exit=0
  local command_exit=0
  local cleanup_output=""
  trap - EXIT

  if cleanup_output="$(dropdb --maintenance-db="$DATABASE_URL" --if-exists "$test_database" 2>&1)"; then
    :
  else
    command_exit=$?
    cleanup_exit=$command_exit
    report_cleanup_failure "dropdb" "$command_exit" "$cleanup_output"
  fi

  if cleanup_output="$(psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
    -c "DROP SCHEMA IF EXISTS \"$schema\" CASCADE" 2>&1)"; then
    :
  else
    command_exit=$?
    (( cleanup_exit == 0 )) && cleanup_exit=$command_exit
    report_cleanup_failure "psql schema cleanup" "$command_exit" "$cleanup_output"
  fi

  if (( test_exit != 0 )); then
    exit "$test_exit"
  fi
  exit "$cleanup_exit"
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
  ('unsafe-malformed', 'https://'),
  ('unsafe-whitespace', 'https://example.com/has space');
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
    'https://',
    'https://example.com/has space'
  );
SQL
)"

if [ "$result" != $'5|2\n5' ]; then
  echo "Resource URI upgrade did not quarantine and audit the expected records: $result" >&2
  exit 1
fi

# A repeat is safe and must not create duplicate unresolved audit records.
TERAS_MIGRATION_ACTOR=integration-test \
  bash scripts/apply-resource-uri-upgrade.sh >/dev/null
audit_count="$(psql "$DATABASE_URL" -Atqc \
  "SELECT count(*) FROM teras_content_resource_uri_audit")"
if [ "$audit_count" != "5" ]; then
  echo "Repeated resource URI upgrade created duplicate audit records." >&2
  exit 1
fi

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
INSERT INTO teras_content_resources (id, uri) VALUES
  ('allowed-null', NULL),
  ('allowed-http-after-upgrade', 'http://example.com/new'),
  ('allowed-https-after-upgrade', 'https://academy.example.com/new?id=1#intro'),
  ('allowed-ipv4-after-upgrade', 'http://192.0.2.10/new'),
  ('allowed-ipv6-after-upgrade', 'https://[2001:db8::1]/new'),
  ('allowed-ipv6-high-hextet', 'https://[9999::1]/new');
SQL

for unsafe_uri in \
  'javascript:alert(1)' \
  'data:text/html,unsafe' \
  'ftp://example.com/material.pdf' \
  '/material.pdf' \
  'material.pdf' \
  'not a url' \
  'https://' \
  'https://example.com/has space' \
  'https://example.com:65536/material.pdf' \
  'https://[example]/x' \
  'https://%' \
  'https://999.1.1.1/x'; do
  if psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
    -v unsafe_uri="$unsafe_uri" >/dev/null 2>&1 <<'SQL'
INSERT INTO teras_content_resources (id, uri)
VALUES ('rejected-' || md5(:'unsafe_uri'), :'unsafe_uri');
SQL
  then
    echo "Database accepted unsafe resource URI: $unsafe_uri" >&2
    exit 1
  fi
done

accepted_count="$(psql "$DATABASE_URL" -Atqc \
  "SELECT count(*) FROM teras_content_resources WHERE id LIKE 'allowed-%'")"
if [ "$accepted_count" != "6" ]; then
  echo "Database rejected an allowed HTTP(S) or NULL resource URI." >&2
  exit 1
fi

# Exercise the same policy corpus used by the application and audit classifier
# through the installed CHECK constraint. A failure names the divergent layer,
# case, and URI so CI points directly at policy drift.
while IFS=$'\t' read -r case_id expected _ uri; do
  [[ -z "$case_id" || "$case_id" == \#* ]] && continue

  if [[ "$uri" == '\N' ]]; then
    sql_value="NULL"
  else
    sql_value=":'corpus_uri'"
  fi

  if psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
    -v corpus_id="$case_id" -v corpus_uri="$uri" >/dev/null 2>&1 <<SQL
INSERT INTO teras_content_resources (id, uri)
VALUES ('corpus-' || :'corpus_id', $sql_value);
SQL
  then
    actual="allow"
  else
    actual="reject"
  fi

  if [[ "$actual" != "$expected" ]]; then
    printf 'database constraint mismatch for %s: URI %q expected %s but got %s\n' \
      "$case_id" "$uri" "$expected" "$actual" >&2
    exit 1
  fi
done < scripts/fixtures/resource-uri-policy-corpus.tsv

# Match post-merge ordering on an isolated copy of an existing, unupgraded
# database. Drizzle targets public explicitly, so a separate database is needed.
unset PGOPTIONS
createdb --maintenance-db="$DATABASE_URL" "$test_database"
test_database_url="$(node -e '
  const url = new URL(process.env.DATABASE_URL);
  url.pathname = `/${process.argv[1]}`;
  process.stdout.write(url.href);
' "$test_database")"
pg_dump "$DATABASE_URL" --schema-only --no-owner --no-privileges \
  | psql "$test_database_url" -v ON_ERROR_STOP=1 >/dev/null
psql "$test_database_url" -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
ALTER TABLE teras_content_resources
  DROP CONSTRAINT IF EXISTS teras_content_resources_uri_http_check;
DROP FUNCTION IF EXISTS teras_is_valid_resource_uri(text);
SQL
TERAS_MIGRATION_ACTOR=integration-test \
  DATABASE_URL="$test_database_url" bash scripts/apply-resource-uri-upgrade.sh >/dev/null
if ! push_output="$(DATABASE_URL="$test_database_url" pnpm --filter @workspace/db run push 2>&1)"; then
  echo "Database push failed after the resource URI upgrade." >&2
  exit 1
fi
if grep -q '^error:' <<<"$push_output"; then
  echo "Database push reported an error after the resource URI upgrade." >&2
  exit 1
fi
TERAS_MIGRATION_ACTOR=integration-test \
  DATABASE_URL="$test_database_url" bash scripts/apply-resource-uri-upgrade.sh >/dev/null

fresh_state="$(psql "$test_database_url" -Atqc "
  SELECT
    to_regprocedure('teras_is_valid_resource_uri(text)') IS NULL,
    EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conrelid = 'teras_content_resources'::regclass
        AND conname = 'teras_content_resources_uri_http_check'
        AND convalidated
    )
")"
if [ "$fresh_state" != "t|t" ]; then
  echo "Existing-schema reconciliation did not establish the self-contained URI CHECK constraint: $fresh_state" >&2
  exit 1
fi