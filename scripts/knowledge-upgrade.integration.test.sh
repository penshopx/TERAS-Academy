#!/bin/bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"
source "$repo_root/scripts/cleanup-diagnostics.sh"

: "${DATABASE_URL:?DATABASE_URL must be set}"

fresh_schema="teras_knowledge_fresh_upgrade_test_$$"
legacy_schema="teras_knowledge_legacy_upgrade_test_$$"
cleanup() {
  local test_exit=$?
  local cleanup_exit=0
  local cleanup_output=""
  trap - EXIT

  if cleanup_output="$(psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c \
    "DROP SCHEMA IF EXISTS \"$fresh_schema\" CASCADE; DROP SCHEMA IF EXISTS \"$legacy_schema\" CASCADE" \
    2>&1)"; then
    :
  else
    cleanup_exit=$?
    report_cleanup_failure "psql schema cleanup" "$cleanup_exit" "$cleanup_output"
  fi

  if (( test_exit != 0 )); then
    exit "$test_exit"
  fi
  exit "$cleanup_exit"
}
trap cleanup EXIT

run_knowledge_migrations() {
  local schema="$1"
  local migration
  for migration in \
    lib/db/migrations/0008_knowledge_articles.sql \
    lib/db/migrations/0009_knowledge_article_family_version.sql \
    lib/db/migrations/0010_seed_baseline_assistant_knowledge.sql; do
    PGOPTIONS="-c search_path=$schema" \
      psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$migration" >/dev/null
  done
}

assert_baseline_state() {
  local schema="$1"
  local expected_help_title="$2"
  local state
  state="$(PGOPTIONS="-c search_path=$schema" psql "$DATABASE_URL" -Atqc "
    SELECT
      to_regclass('teras_knowledge_articles') IS NOT NULL,
      count(*) FILTER (
        WHERE id IN ('teras-baseline-help-guidance-v1', 'teras-baseline-energy-guidance-v1')
          AND status = 'published'
          AND audience = ARRAY['learner', 'trainer', 'assessor', 'admin']::text[]
      ),
      count(*) FILTER (
        WHERE id = 'teras-baseline-help-guidance-v1'
          AND title = '$expected_help_title'
      ),
      EXISTS (
        SELECT 1
        FROM pg_indexes
        WHERE schemaname = '$schema'
          AND indexname = 'teras_knowledge_articles_family_version_unique'
      )
    FROM teras_knowledge_articles;
  ")"
  if [ "$state" != "t|2|1|t" ]; then
    echo "Knowledge upgrade did not preserve the published, audience-scoped baseline in $schema: $state" >&2
    exit 1
  fi
}

# A fresh installation has no article table before the sequence. This mirrors
# the post-push pass, which must be safe to repeat after Drizzle creates it.
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "CREATE SCHEMA \"$fresh_schema\"" >/dev/null
run_knowledge_migrations "$fresh_schema"
PGOPTIONS="-c search_path=$fresh_schema" psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c \
  "UPDATE teras_knowledge_articles SET title = 'Admin edited help guidance' WHERE id = 'teras-baseline-help-guidance-v1'" \
  >/dev/null
run_knowledge_migrations "$fresh_schema"
assert_baseline_state "$fresh_schema" "Admin edited help guidance"

# Existing installations may have an article table before the additive
# columns, family constraint, and canonical seed are introduced.
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<SQL >/dev/null
CREATE SCHEMA "$legacy_schema";
CREATE TABLE "$legacy_schema".teras_knowledge_articles (
  id text PRIMARY KEY,
  category text NOT NULL CHECK (category IN ('help', 'energy')),
  title text NOT NULL,
  body text NOT NULL,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL DEFAULT 'system'
);
INSERT INTO "$legacy_schema".teras_knowledge_articles
  (id, category, title, body, version, status)
VALUES ('legacy-article', 'help', 'Legacy article', 'Preserved existing guidance.', 1, 'published');
SQL
run_knowledge_migrations "$legacy_schema"
PGOPTIONS="-c search_path=$legacy_schema" psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c \
  "UPDATE teras_knowledge_articles SET title = 'Admin edited help guidance' WHERE id = 'teras-baseline-help-guidance-v1'" \
  >/dev/null
run_knowledge_migrations "$legacy_schema"
assert_baseline_state "$legacy_schema" "Admin edited help guidance"

if PGOPTIONS="-c search_path=$legacy_schema" psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "
  INSERT INTO teras_knowledge_articles
    (id, parent_article_id, category, title, body, version, status)
  VALUES
    ('duplicate-baseline-family', 'teras-baseline-help-guidance-v1', 'help', 'Duplicate', 'Must fail.', 1, 'draft');
" >/dev/null 2>&1; then
  echo "Knowledge family-version uniqueness was not enforced for the legacy upgrade." >&2
  exit 1
fi

legacy_count="$(PGOPTIONS="-c search_path=$legacy_schema" psql "$DATABASE_URL" -Atqc \
  "SELECT count(*) FROM teras_knowledge_articles WHERE id = 'legacy-article' AND title = 'Legacy article'")"
if [ "$legacy_count" != "1" ]; then
  echo "Knowledge upgrade did not preserve the legacy article." >&2
  exit 1
fi

echo "Knowledge upgrade migration checks passed"