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
grep -Fq 'TERAS_APP_STORAGE_ALERT_WEBHOOK_URL' "$runner" &&
  grep -Fq 'failedStage' "$runner" &&
  grep -Fq 'notify_failure "$failed_stage"' "$runner" ||
  fail "runner must notify the configured operational webhook with the failed stage"
grep -Fq 'TERAS_APP_STORAGE_HEARTBEAT_URL' "$runner" &&
  grep -Fq 'event: "teras.app-storage.smoke.heartbeat"' "$runner" &&
  grep -Fq 'send_heartbeat "PASS"' "$runner" &&
  grep -Fq 'send_heartbeat "FAIL" "$failed_stage"' "$runner" ||
  fail "runner must send separately configured PASS and FAIL dead-man heartbeats"
grep -Fq -- '--connect-timeout 10' "$runner" &&
  grep -Fq 'TERAS_APP_STORAGE_HEARTBEAT_TIMEOUT_SECONDS' "$runner" ||
  fail "heartbeat delivery must have bounded curl timeouts"
if sed -n '/send_heartbeat()/,/^}/p' "$runner" |
  sed -n '/payload="$(node -e/,/}))'"'"' "\$status" "\$run_id" "\$failed_stage")"/p' |
  grep -Eq 'detail|URL|url|message'; then
  fail "heartbeat payload must not contain smoke details, object URLs, or messages"
fi
grep -Fq 'status: "FAIL"' "$runner" &&
  grep -Fq 'releaseApproval: false' "$runner" ||
  fail "alert payload must remain failure-only and reject release-approval semantics"
if grep -F 'payload=' "$runner" | grep -Eq 'detail|URL|url'; then
  fail "alert payload must not contain failure details or URLs"
fi
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

test_dir="$(mktemp -d)"
trap 'rm -rf "$test_dir"' EXIT
cat >"$test_dir/pnpm" <<'EOF'
#!/usr/bin/env bash
echo '{"smoke":"app-storage-sidecar","runId":"contract-failure","status":"START","check":"upload","releaseApproval":false}'
echo '{"smoke":"app-storage-sidecar","runId":"contract-failure","status":"FAIL","check":"upload","detail":"secret signed URL https://example.invalid/private?signature=secret","releaseApproval":false}'
exit 7
EOF
cat >"$test_dir/curl" <<'EOF'
#!/usr/bin/env bash
printf '%s\n' "$@" >>"$TERAS_CURL_CAPTURE"
printf '%s\n' '---' >>"$TERAS_CURL_CAPTURE"
[[ "${TERAS_CURL_FAIL:-0}" != 1 ]]
EOF
chmod +x "$test_dir/pnpm" "$test_dir/curl"

curl_capture="$test_dir/curl-capture"
set +e
PATH="$test_dir:$PATH" \
  PRIVATE_OBJECT_DIR="/test-bucket/private" \
  TERAS_APP_STORAGE_RUN_ID="contract-failure" \
  TERAS_APP_STORAGE_ALERT_WEBHOOK_URL="https://alerts.invalid/hook" \
  TERAS_APP_STORAGE_HEARTBEAT_URL="https://heartbeat.invalid/hook" \
  TERAS_CURL_FAIL=1 \
  TERAS_CURL_CAPTURE="$curl_capture" \
  bash "$runner" >/dev/null 2>&1
runner_status=$?
set -e
[[ "$runner_status" == 7 ]] || fail "runner must preserve the smoke failure exit code"
grep -Fq '"status":"FAIL","runId":"contract-failure","failedStage":"upload","releaseApproval":false' "$curl_capture" ||
  fail "failed smoke must send a minimal FAIL heartbeat"
grep -Fq '"runId":"contract-failure"' "$curl_capture" &&
  grep -Fq '"failedStage":"upload"' "$curl_capture" ||
  fail "failure alert must identify the run and failed stage"
if grep -Eq 'signature|secret signed URL|example.invalid/private' "$curl_capture"; then
  fail "heartbeat or failure alert leaked sensitive smoke output"
fi

rm -f "$curl_capture"
cat >"$test_dir/pnpm" <<'EOF'
#!/usr/bin/env bash
echo '{"smoke":"app-storage-sidecar","runId":"contract-pass","status":"PASS","check":"cleanup","releaseApproval":false}'
EOF
chmod +x "$test_dir/pnpm"
PATH="$test_dir:$PATH" \
  PRIVATE_OBJECT_DIR="/test-bucket/private" \
  TERAS_APP_STORAGE_RUN_ID="contract-pass" \
  TERAS_APP_STORAGE_ALERT_WEBHOOK_URL="https://alerts.invalid/hook" \
  TERAS_APP_STORAGE_HEARTBEAT_URL="https://heartbeat.invalid/hook" \
  TERAS_CURL_CAPTURE="$curl_capture" \
  bash "$runner" >/dev/null 2>&1
grep -Fq '"status":"PASS","runId":"contract-pass","failedStage":null,"releaseApproval":false' "$curl_capture" ||
  fail "passing smoke must send a minimal PASS heartbeat"
grep -Fq -- '--connect-timeout' "$curl_capture" &&
  grep -Fq -- '--max-time' "$curl_capture" ||
  fail "heartbeat curl invocation must use bounded timeouts"
grep -Fq 'https://alerts.invalid/hook' "$curl_capture" &&
  fail "passing smoke runs must not send failure alerts"
if grep -Eq 'detail|signature|secret signed URL|example.invalid/private' "$curl_capture"; then
  fail "PASS heartbeat leaked smoke output or sensitive details"
fi

rm -f "$curl_capture"
set +e
PATH="$test_dir:$PATH" \
  PRIVATE_OBJECT_DIR="/test-bucket/private" \
  TERAS_APP_STORAGE_RUN_ID="contract-heartbeat-failure" \
  TERAS_APP_STORAGE_ALERT_WEBHOOK_URL="https://alerts.invalid/hook" \
  TERAS_APP_STORAGE_HEARTBEAT_URL="https://heartbeat.invalid/hook" \
  TERAS_CURL_FAIL=1 \
  TERAS_CURL_CAPTURE="$curl_capture" \
  bash "$runner" >/dev/null 2>&1
runner_status=$?
set -e
[[ "$runner_status" == 1 ]] || fail "a failed PASS heartbeat must fail the smoke run"
grep -Fq 'https://alerts.invalid/hook' "$curl_capture" ||
  fail "a failed PASS heartbeat must notify the independent failure alert at heartbeat stage"
grep -Fq '"failedStage":"heartbeat"' "$curl_capture" ||
  fail "a failed PASS heartbeat must alert the heartbeat stage"

rm -f "$curl_capture"
missing_heartbeat_log="$test_dir/missing-heartbeat.log"
set +e
PATH="$test_dir:$PATH" \
  PRIVATE_OBJECT_DIR="/test-bucket/private" \
  TERAS_APP_STORAGE_RUN_ID="contract-missing-heartbeat" \
  TERAS_APP_STORAGE_ALERT_WEBHOOK_URL="https://alerts.invalid/hook" \
  TERAS_CURL_CAPTURE="$curl_capture" \
  bash "$runner" >/dev/null 2>"$missing_heartbeat_log"
runner_status=$?
set -e
[[ "$runner_status" == 1 ]] || fail "missing heartbeat configuration must fail the run"
grep -Fq 'TERAS_APP_STORAGE_HEARTBEAT_URL is required' "$missing_heartbeat_log" ||
  fail "missing heartbeat configuration must be explicit in logs"
grep -Fq '"failedStage":"heartbeat"' "$curl_capture" ||
  fail "missing heartbeat configuration must alert the heartbeat stage"

echo "App Storage smoke contract passed."
