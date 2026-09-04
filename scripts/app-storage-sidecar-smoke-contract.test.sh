#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
runner="$repo_root/scripts/app-storage-sidecar-smoke.sh"
integration="$repo_root/artifacts/api-server/src/app-storage-sidecar.integration.ts"
release_workflow="$repo_root/.github/workflows/certification-preparation-release.yml"
replit_config="$repo_root/.replit"

fail() {
  echo "App Storage smoke contract failed: $1" >&2
  exit 1
}

[[ -f "$runner" ]] || fail "scheduled runner is missing"
grep -Fq 'smoke-$(node -e' "$runner" ||
  fail "runner must generate a unique ID for every invocation"
grep -Fq 'TERAS_APP_STORAGE_SMOKE_TIMEOUT' "$runner" &&
  grep -Fq 'timeout --signal=TERM' "$runner" ||
  fail "runner must have a bounded execution time"
grep -Fq 'releaseApproval\":false' "$runner" &&
  grep -Fq 'releaseApproval: false' "$integration" ||
  fail "logs must explicitly reject release-approval semantics"
grep -Fq 'certification-evidence/${runId}' "$integration" ||
  fail "objects must remain under the disposable run prefix"
grep -Fq 'cleanup left' "$integration" &&
  grep -Fq 'cleanup did not remove' "$integration" ||
  fail "cleanup must verify that no disposable objects remain"
grep -Fq 'deploymentTarget = "autoscale"' "$replit_config" ||
  fail "the public autoscale deployment must remain unchanged"
grep -Fq '[[deployment.scheduled]]' "$replit_config" &&
  grep -Fq 'command = "pnpm run smoke:app-storage"' "$replit_config" &&
  grep -Fq 'schedule = "0 16 * * 1-5"' "$replit_config" &&
  grep -Fq 'timeout = 180' "$replit_config" ||
  fail "the platform scheduler must run the bounded smoke each weekday"

if grep -Fq 'smoke:app-storage' "$release_workflow"; then
  fail "the operational smoke must not be a release-gate dependency"
fi

echo "App Storage smoke contract passed."