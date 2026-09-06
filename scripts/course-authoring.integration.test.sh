#!/bin/bash
set -euo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/cleanup-diagnostics.sh"

: "${DATABASE_URL:?DATABASE_URL must be set}"

test_database="teras_authoring_${RANDOM}_$$"
cleanup() {
  local test_exit=$?
  local cleanup_exit=0
  local cleanup_output=""
  trap - EXIT

  if cleanup_output="$(dropdb --maintenance-db="$DATABASE_URL" --if-exists "$test_database" 2>&1)"; then
    :
  else
    cleanup_exit=$?
    report_cleanup_failure "dropdb" "$cleanup_exit" "$cleanup_output"
  fi

  if (( test_exit != 0 )); then
    exit "$test_exit"
  fi
  exit "$cleanup_exit"
}
trap cleanup EXIT

createdb --maintenance-db="$DATABASE_URL" "$test_database"
test_database_url="$(node -e '
  const url = new URL(process.env.DATABASE_URL);
  url.pathname = "/" + process.argv[1];
  process.stdout.write(url.toString());
' "$test_database")"

# The URI check is intentionally database-native. Fresh schema push tests create
# only this stable helper, then let Drizzle create every table and constraint.
psql "$test_database_url" -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
CREATE FUNCTION teras_is_valid_resource_uri(value text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT value ~ '^https?://[^[:space:]]+$'
     AND value !~ '[<>"{}|\\^`]'
$$;
SQL

if ! push_output="$(DATABASE_URL="$test_database_url" pnpm --filter @workspace/db run push-force 2>&1)"; then
  printf '%s\n' "$push_output" >&2
  exit 1
fi
if printf '%s\n' "$push_output" | grep -Eiq '(^|[[:space:]])error:'; then
  printf '%s\n' "$push_output" >&2
  exit 1
fi

DATABASE_URL="$test_database_url" NODE_ENV=test \
  pnpm --filter @workspace/api-server exec tsx ./src/course-authoring.integration.ts