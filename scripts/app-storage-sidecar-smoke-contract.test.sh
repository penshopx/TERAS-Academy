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
printf '%s\n' "$@" >"$TERAS_ALERT_CAPTURE"
EOF
chmod +x "$test_dir/pnpm" "$test_dir/curl"

alert_capture="$test_dir/alert"
set +e
PATH="$test_dir:$PATH" \
  PRIVATE_OBJECT_DIR="/test-bucket/private" \
  TERAS_APP_STORAGE_RUN_ID="contract-failure" \
  TERAS_APP_STORAGE_ALERT_WEBHOOK_URL="https://alerts.invalid/hook" \
  TERAS_ALERT_CAPTURE="$alert_capture" \
  bash "$runner" >/dev/null 2>&1
runner_status=$?
set -e
[[ "$runner_status" == 7 ]] || fail "runner must preserve the smoke failure exit code"
grep -Fq '"runId":"contract-failure"' "$alert_capture" &&
  grep -Fq '"failedStage":"upload"' "$alert_capture" ||
  fail "failure alert must identify the run and failed stage"
if grep -Eq 'signature|secret signed URL|example.invalid/private' "$alert_capture"; then
  fail "failure alert leaked sensitive smoke output"
fi

rm -f "$alert_capture"
cat >"$test_dir/pnpm" <<'EOF'
#!/usr/bin/env bash
echo '{"smoke":"app-storage-sidecar","runId":"contract-pass","status":"PASS","check":"cleanup","releaseApproval":false}'
EOF
chmod +x "$test_dir/pnpm"
PATH="$test_dir:$PATH" \
  PRIVATE_OBJECT_DIR="/test-bucket/private" \
  TERAS_APP_STORAGE_RUN_ID="contract-pass" \
  TERAS_APP_STORAGE_ALERT_WEBHOOK_URL="https://alerts.invalid/hook" \
  TERAS_ALERT_CAPTURE="$alert_capture" \
  bash "$runner" >/dev/null 2>&1
[[ ! -e "$alert_capture" ]] || fail "passing smoke runs must not send alerts"

echo "App Storage smoke contract passed."