#!/bin/bash
set -euo pipefail
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"
source "$repo_root/scripts/cleanup-diagnostics.sh"
: "${DATABASE_URL:?DATABASE_URL must be set}"
test_database="teras_admin_api_test_$$"
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
test_database_url="$(node -e 'const url = new URL(process.env.DATABASE_URL); url.pathname = `/${process.argv[1]}`; process.stdout.write(url.href);' "$test_database")"
pg_dump "$DATABASE_URL" --schema-only --no-owner --no-privileges | psql "$test_database_url" -v ON_ERROR_STOP=1 >/dev/null
DATABASE_URL="$test_database_url" psql "$test_database_url" -v ON_ERROR_STOP=1 -f lib/db/migrations/0005_admin_management.sql >/dev/null
TERAS_TEST_INITIAL_SUPER_ADMIN_CLAIM=1 \
  DATABASE_URL="$test_database_url" \
  pnpm --filter @workspace/api-server run test:admin-management