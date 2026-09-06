#!/bin/bash
set -euo pipefail

pnpm --filter @workspace/scripts run test:demo-access-policy

before_demo_state="$(psql "$DATABASE_URL" -Atqc "
  SELECT
    (SELECT count(*) FROM teras_people WHERE id IN ('learner-demo','trainer-aria','assessor-sam')) || ':' ||
    (SELECT count(*) FROM teras_readiness_events WHERE id IN ('ready-demo-g1','ready-demo-g2'))
")"

set +e
NODE_ENV=production TERAS_ENABLE_DEMO_FIXTURES=1 \
  pnpm --filter @workspace/scripts run seed:demo >/tmp/teras-production-seed-guard.log 2>&1
production_seed_status=$?
NODE_ENV=development REPLIT_DEPLOYMENT=1 TERAS_ENABLE_DEMO_FIXTURES=1 \
  pnpm --filter @workspace/scripts run seed:demo >/tmp/teras-deployment-seed-guard.log 2>&1
deployment_seed_status=$?
env -u NODE_ENV -u REPLIT_DEPLOYMENT TERAS_ENABLE_DEMO_FIXTURES=1 \
  pnpm --filter @workspace/scripts run seed:demo >/tmp/teras-unset-mode-seed-guard.log 2>&1
unset_seed_status=$?
NODE_ENV=developmnt TERAS_ENABLE_DEMO_FIXTURES=1 \
  pnpm --filter @workspace/scripts run seed:demo >/tmp/teras-unknown-mode-seed-guard.log 2>&1
unknown_seed_status=$?
NODE_ENV=development \
  pnpm --filter @workspace/scripts run seed:demo >/tmp/teras-missing-flag-seed-guard.log 2>&1
missing_flag_seed_status=$?
NODE_ENV=production bash scripts/post-merge.sh >/tmp/teras-production-post-merge-guard.log 2>&1
post_merge_status=$?
set -e

after_refusal_state="$(psql "$DATABASE_URL" -Atqc "
  SELECT
    (SELECT count(*) FROM teras_people WHERE id IN ('learner-demo','trainer-aria','assessor-sam')) || ':' ||
    (SELECT count(*) FROM teras_readiness_events WHERE id IN ('ready-demo-g1','ready-demo-g2'))
")"

if [ "$production_seed_status" -eq 0 ]; then
  echo "Production demo seed guard did not reject execution." >&2
  exit 1
fi
if [ "$deployment_seed_status" -eq 0 ]; then
  echo "Deployment demo seed guard did not reject execution." >&2
  exit 1
fi
if [ "$unset_seed_status" -eq 0 ] || [ "$unknown_seed_status" -eq 0 ]; then
  echo "Unset or unknown demo mode did not fail closed." >&2
  exit 1
fi
if [ "$missing_flag_seed_status" -eq 0 ]; then
  echo "Demo fixture seed did not require its explicit flag." >&2
  exit 1
fi
if [ "$post_merge_status" -eq 0 ]; then
  echo "Production post-merge guard did not reject execution." >&2
  exit 1
fi
if [ "$before_demo_state" != "$after_refusal_state" ]; then
  echo "Rejected demo seed changed fixture state." >&2
  exit 1
fi

NODE_ENV=development TERAS_ENABLE_DEMO_FIXTURES=1 \
  pnpm --filter @workspace/scripts run seed:demo >/tmp/teras-safe-demo-seed.log 2>&1

safe_demo_state="$(psql "$DATABASE_URL" -Atqc "
  SELECT
    (SELECT count(*) FROM teras_people WHERE id IN ('learner-demo','trainer-aria','assessor-sam')) || ':' ||
    (SELECT count(*) FROM teras_readiness_events WHERE id IN ('ready-demo-g1','ready-demo-g2'))
")"
if [ "$safe_demo_state" != "3:2" ]; then
  echo "Explicit safe development demo seed did not create all fixtures." >&2
  exit 1
fi

echo "Deployment hardening guard checks passed"