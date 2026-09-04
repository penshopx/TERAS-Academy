#!/bin/bash
set -euo pipefail

before_demo_state="$(psql "$DATABASE_URL" -Atqc "
  SELECT
    (SELECT count(*) FROM teras_people WHERE id IN ('learner-demo','trainer-aria','assessor-sam')) || ':' ||
    (SELECT count(*) FROM teras_readiness_events WHERE id IN ('ready-demo-g1','ready-demo-g2'))
")"

set +e
NODE_ENV=production pnpm --filter @workspace/scripts run seed:demo >/tmp/teras-production-seed-guard.log 2>&1
seed_status=$?
NODE_ENV=production bash scripts/post-merge.sh >/tmp/teras-production-post-merge-guard.log 2>&1
post_merge_status=$?
set -e

after_demo_state="$(psql "$DATABASE_URL" -Atqc "
  SELECT
    (SELECT count(*) FROM teras_people WHERE id IN ('learner-demo','trainer-aria','assessor-sam')) || ':' ||
    (SELECT count(*) FROM teras_readiness_events WHERE id IN ('ready-demo-g1','ready-demo-g2'))
")"

if [ "$seed_status" -eq 0 ]; then
  echo "Production demo seed guard did not reject execution." >&2
  exit 1
fi
if [ "$post_merge_status" -eq 0 ]; then
  echo "Production post-merge guard did not reject execution." >&2
  exit 1
fi
if [ "$before_demo_state" != "$after_demo_state" ]; then
  echo "Rejected production seed changed demo fixture state." >&2
  exit 1
fi

echo "Deployment hardening guard checks passed"