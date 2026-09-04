#!/bin/bash
set -euo pipefail
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"
: "${DATABASE_URL:?DATABASE_URL must be set}"
schema="teras_admin_upgrade_test_$$"
cleanup() { psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "DROP SCHEMA IF EXISTS \"$schema\" CASCADE" >/dev/null; }
trap cleanup EXIT
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<SQL >/dev/null
CREATE SCHEMA "$schema";
CREATE TABLE "$schema".teras_people (id text PRIMARY KEY, name text NOT NULL, initials text NOT NULL, role text NOT NULL, organization text, created_at timestamptz NOT NULL DEFAULT now(), created_by text NOT NULL DEFAULT 'system');
CREATE TABLE "$schema".teras_programs (id text PRIMARY KEY, domain text NOT NULL, name text NOT NULL, description text NOT NULL, status text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), created_by text NOT NULL DEFAULT 'system');
CREATE TABLE "$schema".teras_pathways (id text PRIMARY KEY, program_id text NOT NULL REFERENCES "$schema".teras_programs(id), name text NOT NULL, type text NOT NULL, outcome text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), created_by text NOT NULL DEFAULT 'system');
CREATE TABLE "$schema".teras_enrollments (id text PRIMARY KEY, learner_id text NOT NULL REFERENCES "$schema".teras_people(id), program_id text NOT NULL REFERENCES "$schema".teras_programs(id), pathway_id text NOT NULL REFERENCES "$schema".teras_pathways(id), trainer_id text, assessor_id text, created_at timestamptz NOT NULL DEFAULT now(), created_by text NOT NULL DEFAULT 'system');
INSERT INTO "$schema".teras_people (id, name, initials, role) VALUES ('legacy-trainer', 'Legacy Trainer', 'LT', 'Trainer'), ('bootstrap-admin', 'Bootstrap Admin', 'BA', 'Learner');
SQL
export PGOPTIONS="-c search_path=$schema"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f lib/db/migrations/0005_admin_management.sql >/dev/null
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "UPDATE teras_people SET clerk_user_id = 'clerk-bootstrap', status = 'ACTIVE' WHERE id = 'bootstrap-admin'" >/dev/null
export PGOPTIONS="-c search_path=$schema -c teras.admin_clerk_user_ids=clerk-bootstrap"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f lib/db/migrations/0005_admin_management.sql >/dev/null
state="$(psql "$DATABASE_URL" -Atqc "SELECT to_regclass('teras_person_roles') IS NOT NULL, to_regclass('teras_cohorts') IS NOT NULL, to_regclass('teras_admin_audit_events') IS NOT NULL, (SELECT count(*) FROM information_schema.columns WHERE table_schema = '$schema' AND table_name = 'teras_people' AND column_name IN ('clerk_user_id','status')), (SELECT count(*) FROM teras_person_roles WHERE person_id = 'legacy-trainer' AND role = 'trainer'), (SELECT count(*) FROM teras_person_roles WHERE person_id = 'bootstrap-admin' AND role = 'admin'), (SELECT status FROM teras_people WHERE id = 'bootstrap-admin')")"
if [ "$state" != "t|t|t|2|1|1|active" ]; then
  echo "Admin management upgrade was not additive and idempotent: $state" >&2
  exit 1
fi