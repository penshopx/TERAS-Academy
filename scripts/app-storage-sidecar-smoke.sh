#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

run_id="${TERAS_APP_STORAGE_RUN_ID:-smoke-$(node -e 'process.stdout.write(require("crypto").randomUUID())')}"
output_file="$(mktemp)"
trap 'rm -f "$output_file"' EXIT

json_failure() {
  local check="$1"
  node -e 'process.stdout.write(JSON.stringify({
    smoke: "app-storage-sidecar",
    status: "FAIL",
    runId: process.argv[1],
    check: process.argv[2],
    releaseApproval: false
  }))' "$run_id" "$check"
}

notify_failure() {
  local failed_stage="$1"
  local webhook_url="${TERAS_APP_STORAGE_ALERT_WEBHOOK_URL:-}"

  if [[ -z "$webhook_url" ]]; then
    echo "{\"smoke\":\"app-storage-sidecar\",\"status\":\"ALERT_SKIPPED\",\"runId\":\"$run_id\",\"check\":\"$failed_stage\",\"reason\":\"TERAS_APP_STORAGE_ALERT_WEBHOOK_URL is not configured\",\"releaseApproval\":false}" >&2
    return 0
  fi

  local payload
  payload="$(node -e 'process.stdout.write(JSON.stringify({
    event: "teras.app-storage.smoke.failed",
    status: "FAIL",
    runId: process.argv[1],
    failedStage: process.argv[2],
    releaseApproval: false,
    message: `TERAS App Storage smoke failed at ${process.argv[2]} (run ${process.argv[1]}).`
  }))' "$run_id" "$failed_stage")"

  if curl --fail --silent --show-error \
    --connect-timeout 10 \
    --max-time "${TERAS_APP_STORAGE_ALERT_TIMEOUT_SECONDS:-20}" \
    --header "Content-Type: application/json" \
    --data "$payload" \
    "$webhook_url" >/dev/null; then
    echo "{\"smoke\":\"app-storage-sidecar\",\"status\":\"ALERT_SENT\",\"runId\":\"$run_id\",\"check\":\"$failed_stage\",\"releaseApproval\":false}" >&2
  else
    echo "{\"smoke\":\"app-storage-sidecar\",\"status\":\"ALERT_FAILED\",\"runId\":\"$run_id\",\"check\":\"$failed_stage\",\"releaseApproval\":false}" >&2
  fi
}

fail_before_smoke() {
  local check="$1"
  json_failure "$check" | tee -a "$output_file" >&2
  notify_failure "$check"
  exit 1
}

[[ -n "${PRIVATE_OBJECT_DIR:-}" ]] || {
  fail_before_smoke "prerequisites"
}

[[ "$run_id" =~ ^[a-zA-Z0-9._-]+$ ]] || {
  run_id="invalid-run-id"
  fail_before_smoke "prerequisites"
}

echo "{\"smoke\":\"app-storage-sidecar\",\"status\":\"START\",\"runId\":\"$run_id\",\"releaseApproval\":false}"
set +e
timeout --signal=TERM --kill-after=15s "${TERAS_APP_STORAGE_SMOKE_TIMEOUT:-180s}" \
  env TERAS_APP_STORAGE_RUN_ID="$run_id" \
  pnpm --filter @workspace/api-server run test:app-storage-sidecar \
  > >(tee -a "$output_file") 2> >(tee -a "$output_file" >&2)
smoke_status=$?
set -e

if (( smoke_status != 0 )); then
  failed_stage="$(
    node -e '
      const fs = require("node:fs");
      const lines = fs.readFileSync(process.argv[1], "utf8").split(/\r?\n/);
      let stage = process.argv[2] === "124" || process.argv[2] === "137" ? "timeout" : "unknown";
      for (const line of lines) {
        try {
          const entry = JSON.parse(line);
          if (entry.smoke === "app-storage-sidecar" && entry.status === "FAIL" && typeof entry.check === "string") {
            stage = entry.check;
          }
        } catch {}
      }
      process.stdout.write(stage);
    ' "$output_file" "$smoke_status"
  )"
  notify_failure "$failed_stage"
  exit "$smoke_status"
fi

echo "{\"smoke\":\"app-storage-sidecar\",\"status\":\"PASS\",\"runId\":\"$run_id\",\"releaseApproval\":false,\"note\":\"Operational smoke only; not release approval.\"}"