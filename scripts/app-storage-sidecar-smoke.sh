#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

[[ -n "${PRIVATE_OBJECT_DIR:-}" ]] || {
  echo '{"smoke":"app-storage-sidecar","status":"FAIL","check":"prerequisites","detail":"PRIVATE_OBJECT_DIR is required","releaseApproval":false}' >&2
  exit 1
}

run_id="${TERAS_APP_STORAGE_RUN_ID:-smoke-$(node -e 'process.stdout.write(require("crypto").randomUUID())')}"
[[ "$run_id" =~ ^[a-zA-Z0-9._-]+$ ]] || {
  echo '{"smoke":"app-storage-sidecar","status":"FAIL","check":"prerequisites","detail":"unsafe run ID","releaseApproval":false}' >&2
  exit 1
}

echo "{\"smoke\":\"app-storage-sidecar\",\"status\":\"START\",\"runId\":\"$run_id\",\"releaseApproval\":false}"
timeout --signal=TERM --kill-after=15s "${TERAS_APP_STORAGE_SMOKE_TIMEOUT:-180s}" \
  env TERAS_APP_STORAGE_RUN_ID="$run_id" \
  pnpm --filter @workspace/api-server run test:app-storage-sidecar
echo "{\"smoke\":\"app-storage-sidecar\",\"status\":\"PASS\",\"runId\":\"$run_id\",\"releaseApproval\":false,\"note\":\"Operational smoke only; not release approval.\"}"