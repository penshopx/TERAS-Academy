#!/usr/bin/env bash
# A release gate deliberately creates its own database and uses only the
# in-process object-storage adapter installed by the integration suite.
set -uo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

run_id="${TERAS_GATE_RUN_ID:-$(node -e 'process.stdout.write(require("crypto").randomUUID())')}"
candidate_sha="${TERAS_GATE_CANDIDATE_SHA:-$(git rev-parse HEAD 2>/dev/null || true)}"
report_dir="${TERAS_GATE_REPORT_DIR:-$repo_root/.release-gate}"
json_report="$report_dir/certification-preparation-$run_id.json"
markdown_report="$report_dir/certification-preparation-$run_id.md"
test_database="teras_certification_gate_${run_id//-/}"
test_database_url=""
storage_namespace=""
declare -a checks=()
test_status="FAIL"
failure=""

mkdir -p "$report_dir"

json_escape() {
  node -e 'process.stdout.write(JSON.stringify(process.argv[1]))' "$1"
}

write_report() {
  local checks_json=""
  local check name status detail
  for check in "${checks[@]}"; do
    IFS=$'\t' read -r name status detail <<<"$(printf '%s' "$check" | base64 --decode)"
    [[ -n "$checks_json" ]] && checks_json+=","
    checks_json+="{\"name\":$(json_escape "$name"),\"status\":$(json_escape "$status"),\"detail\":$(json_escape "$detail")}"
  done
  cat >"$json_report" <<EOF
{"gate":"certification-preparation","runId":$(json_escape "$run_id"),"candidateSha":$(json_escape "$candidate_sha"),"testStatus":"$test_status","gateReview":"$([[ "$test_status" == PASS ]] && echo PENDING || echo NO-GO)","reviewer":null,"reviewedAt":null,"rationale":null,"storageEvidence":{"adapter":{"kind":"test-only in-process ObjectStorageService adapter","namespace":$(json_escape "$storage_namespace"),"coveredByThisReport":true},"realAppStorage":{"kind":"Replit App Storage sidecar integration","command":"pnpm run smoke:app-storage","coveredByThisReport":false,"releaseApproval":false},"note":"The scheduled sidecar smoke is operational early warning only. It is separate from this candidate-specific release gate and can never approve a release."},"database":{"name":$(json_escape "$test_database"),"isolated":true},"cleanup":{"status":"${cleanup_status:-NOT_RUN}"},"checks":[$checks_json],"failure":$(json_escape "$failure")}
EOF
  {
    echo "# Certification-preparation release gate"
    echo
    echo "- Run: \`$run_id\`"
    echo "- Release candidate SHA: \`$candidate_sha\`"
    echo "- Automated test status: **$test_status**"
    echo "- Gate review: **$([[ "$test_status" == PASS ]] && echo PENDING || echo NO-GO)** (tests never auto-GO)"
    echo "- Database: isolated disposable \`$test_database\`"
    echo "- Adapter evidence in this report: **test-only in-process adapter**, namespace \`$storage_namespace\`"
    echo "- Real App Storage smoke: **separate scheduled operational check**, run with \`pnpm run smoke:app-storage\`; it never approves a release"
    echo
    echo "## Checks"
    echo
    echo "| Check | Status | Detail |"
    echo "| --- | --- | --- |"
    for check in "${checks[@]}"; do
      IFS=$'\t' read -r name status detail <<<"$(printf '%s' "$check" | base64 --decode)"
      echo "| $name | $status | $detail |"
    done
    if [[ -n "$failure" ]]; then echo; echo "Failure: $failure"; fi
    echo
    echo "This report records internal readiness-preparation evidence only. It is not an official competency or certification decision."
  } >"$markdown_report"
  printf 'Certification gate reports: %s and %s\n' "$json_report" "$markdown_report"
}

cleanup() {
  local cleanup_exit=0
  if [[ -n "$test_database_url" ]]; then
    if dropdb --maintenance-db="$DATABASE_URL" --if-exists "$test_database" >/dev/null 2>&1; then
      cleanup_status="PASS"
    else
      cleanup_status="FAIL"
      test_status="FAIL"
      failure="${failure:+$failure; }disposable database cleanup failed"
      cleanup_exit=1
    fi
  else
    cleanup_status="NOT_REQUIRED"
  fi
  write_report
  return "$cleanup_exit"
}

finish() {
  local gate_exit=$?
  trap - EXIT
  cleanup || gate_exit=1
  exit "$gate_exit"
}
trap finish EXIT

fail() {
  failure="$1"
  checks+=("$(printf '%s\t%s\t%s' "isolation prerequisites" "FAIL" "$1" | base64)")
  exit 1
}

[[ -n "${DATABASE_URL:-}" ]] || fail "DATABASE_URL is required to create a disposable gate database"
[[ "$candidate_sha" =~ ^[0-9a-f]{40}$ ]] || fail "TERAS_GATE_CANDIDATE_SHA must be a full 40-character Git commit SHA"
[[ "${TERAS_GATE_STORAGE_ADAPTER:-}" == "test" ]] || fail "TERAS_GATE_STORAGE_ADAPTER must be exactly 'test'; real storage is refused"
[[ -n "${TERAS_GATE_STORAGE_NAMESPACE:-}" ]] || fail "TERAS_GATE_STORAGE_NAMESPACE is required"
command -v createdb >/dev/null || fail "createdb is required"
command -v dropdb >/dev/null || fail "dropdb is required"
command -v psql >/dev/null || fail "psql is required"

storage_namespace="${TERAS_GATE_STORAGE_NAMESPACE%/}/$run_id"
checks+=("$(printf '%s\t%s\t%s' "isolation prerequisites" "PASS" "fresh PostgreSQL database and run-scoped test storage namespace configured" | base64)")

if ! createdb --maintenance-db="$DATABASE_URL" "$test_database"; then
  fail "could not create disposable PostgreSQL database"
fi
test_database_url="$(node -e 'const url = new URL(process.env.DATABASE_URL); url.pathname = "/" + process.argv[1]; process.stdout.write(url.toString())' "$test_database")"

run_check() {
  local name="$1"
  shift
  if "$@"; then
    checks+=("$(printf '%s\t%s\t%s' "$name" "PASS" "completed against the disposable database" | base64)")
  else
    checks+=("$(printf '%s\t%s\t%s' "$name" "FAIL" "command failed" | base64)")
    failure="$name failed"
    return 1
  fi
}

# Required by the resource URI constraint in a fresh schema; the gate does not
# copy a production schema or seed demonstration data.
run_check "resource URI policy helper" psql "$test_database_url" -v ON_ERROR_STOP=1 -c "CREATE FUNCTION teras_is_valid_resource_uri(value text) RETURNS boolean LANGUAGE sql IMMUTABLE AS \$\$ SELECT value ~ '^https?://[^[:space:]]+$' AND value !~ '[<>\"{}|\\\\^\`]' \$\$;" >/dev/null || exit 1
run_check "schema provisioning" env DATABASE_URL="$test_database_url" pnpm --filter @workspace/db run push-force || exit 1
run_check "authoring and safe-media input contract" env DATABASE_URL="$test_database_url" NODE_ENV=test pnpm --filter @workspace/api-server exec tsx ./src/course-authoring.contract.test.ts || exit 1
run_check "shared certification preparation journey" env DATABASE_URL="$test_database_url" NODE_ENV=test TERAS_GATE_STORAGE_NAMESPACE="$storage_namespace" pnpm --filter @workspace/api-server exec tsx ./src/certification-preparation-journey.integration.ts || exit 1

test_status="PASS"