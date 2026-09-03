#!/bin/bash
set -e
pnpm install --frozen-lockfile
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/post-merge.sql
pnpm --filter @workspace/db run push
pnpm --filter @workspace/scripts run seed
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/schema-check.sql
pnpm --filter @workspace/scripts run test:safety
pnpm run typecheck
