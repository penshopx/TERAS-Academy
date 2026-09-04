#!/bin/bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

: "${DATABASE_URL:?DATABASE_URL must be set}"

actor="${TERAS_MIGRATION_ACTOR:-automated-resource-uri-upgrade}"

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f lib/db/migrations/0003_content_resource_uri_audit.sql
pnpm --filter @workspace/scripts run audit:resource-uris -- \
  --quarantine "--actor=${actor}"
pnpm --filter @workspace/scripts run audit:resource-uris -- \
  --fail-on-findings