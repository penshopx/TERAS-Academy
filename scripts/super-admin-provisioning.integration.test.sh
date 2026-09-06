#!/bin/bash
set -euo pipefail
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"
: "${DATABASE_URL:?DATABASE_URL must be set}"

ready_database="teras_super_admin_ready_$$"
legacy_database="teras_super_admin_legacy_$$"
cleanup() {
  dropdb --maintenance-db="$DATABASE_URL" --if-exists "$ready_database" >/dev/null 2>&1 || true
  dropdb --maintenance-db="$DATABASE_URL" --if-exists "$legacy_database" >/dev/null 2>&1 || true
}
trap cleanup EXIT

database_url() {
  node -e 'const url = new URL(process.env.DATABASE_URL); url.pathname = `/${process.argv[1]}`; process.stdout.write(url.href);' "$1"
}

for database in "$ready_database" "$legacy_database"; do
  createdb --maintenance-db="$DATABASE_URL" "$database"
  pg_dump "$DATABASE_URL" --schema-only --no-owner --no-privileges |
    psql "$(database_url "$database")" -v ON_ERROR_STOP=1 >/dev/null
done

ready_url="$(database_url "$ready_database")"
legacy_url="$(database_url "$legacy_database")"

DATABASE_URL="$ready_url" pnpm --filter @workspace/scripts exec tsx ./src/super-admin-provisioning.integration.ts ready

psql "$legacy_url" -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
ALTER TABLE teras_person_roles DROP CONSTRAINT IF EXISTS teras_person_roles_role_check;
ALTER TABLE teras_person_roles ADD CONSTRAINT teras_person_roles_role_check
  CHECK (role IN ('admin', 'trainer', 'assessor', 'learner'));
SQL
DATABASE_URL="$legacy_url" pnpm --filter @workspace/scripts exec tsx ./src/super-admin-provisioning.integration.ts legacy

echo "Super Admin provisioning integration checks passed"