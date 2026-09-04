#!/bin/bash
set -euo pipefail
pnpm install --frozen-lockfile
if [ "$(psql "$DATABASE_URL" -Atqc "SELECT to_regclass('public.teras_people') IS NOT NULL")" = "t" ]; then
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/post-merge.sql
fi
pnpm --filter @workspace/db run push
pnpm --filter @workspace/scripts run seed
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/schema-check.sql
pnpm --filter @workspace/scripts run test:safety
pnpm --filter @workspace/api-server run test:pathway-isolation
pnpm --filter @workspace/api-server run test:safety-blockers
pnpm --filter @workspace/api-server run test:learning-transition
pnpm run typecheck
