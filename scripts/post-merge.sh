#!/bin/bash
set -euo pipefail

if [ "${NODE_ENV:-}" = "production" ] || [ "${REPLIT_DEPLOYMENT:-}" = "1" ]; then
  echo "Refusing to run development database reconciliation against production." >&2
  exit 1
fi

exec 9>/tmp/teras-post-merge.lock
if ! flock -n 9; then
  echo "Another TERAS post-merge reconciliation is already running." >&2
  exit 1
fi

pnpm install --frozen-lockfile
if [ "$(psql "$DATABASE_URL" -Atqc "SELECT to_regclass('public.teras_people') IS NOT NULL")" = "t" ]; then
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/post-merge.sql
  # Explicitly rehearse the additive admin upgrade on existing installations;
  # 0005 is idempotent and drizzle remains the new-install schema authority.
  PGOPTIONS="${PGOPTIONS:-} -c teras.admin_clerk_user_ids=${CLERK_ADMIN_USER_IDS:-}" \
    psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f lib/db/migrations/0005_admin_management.sql
  # Preserve existing learner progress while adding immutable course versions,
  # authoring audit history, and managed-resource upload claims.
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
    -f lib/db/migrations/0006_course_authoring_versions.sql
fi
if [ "$(psql "$DATABASE_URL" -Atqc "SELECT to_regclass('public.teras_content_resources') IS NOT NULL")" = "t" ]; then
  TERAS_MIGRATION_ACTOR=post-merge-upgrade \
    bash scripts/apply-resource-uri-upgrade.sh
else
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
    -f lib/db/migrations/0004_content_resource_uri_http_check.sql
fi
pnpm --filter @workspace/db run push
TERAS_MIGRATION_ACTOR=post-merge-upgrade \
  bash scripts/apply-resource-uri-upgrade.sh
pnpm --filter @workspace/scripts run seed:demo
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/schema-check.sql
pnpm --filter @workspace/api-server run test:resource-uri
pnpm --filter @workspace/scripts run test:resource-uri-audit
pnpm --filter @workspace/scripts run test:resource-uri-upgrade
pnpm --filter @workspace/scripts run test:admin-management-upgrade
pnpm --filter @workspace/scripts run test:admin-management
pnpm --filter @workspace/scripts run test:deployment-hardening
pnpm --filter @workspace/scripts run test:safety
pnpm --filter @workspace/api-server run test:pathway-isolation
pnpm --filter @workspace/api-server run test:safety-blockers
pnpm --filter @workspace/api-server run test:admin-management
pnpm --filter @workspace/api-server run test:course-authoring
pnpm run typecheck
