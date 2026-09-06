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
cleanup_detail=""

mkdir -p "$report_dir"

json_escape() {
  node -e 'process.stdout.write(JSON.stringify(process.argv[1]))' "$1"
}

sanitize_cleanup_diagnostic() {
  node -e '
    let diagnostic = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => { diagnostic += chunk; });
    process.stdin.on("end", () => {
      for (const secret of process.argv.slice(1)) {
        if (secret) diagnostic = diagnostic.split(secret).join("[REDACTED_DATABASE_URL]");
      }
      diagnostic = diagnostic.replace(/\bpostgres(?:ql)?:\/\/[^\s]+/gi, "postgresql://[REDACTED]");
      diagnostic = diagnostic.replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g, (control) =>
        `\\u${control.charCodeAt(0).toString(16).padStart(4, "0")}`
      );
      process.stdout.write(diagnostic.trim().slice(0, 4000));
    });
  ' "${DATABASE_URL:-}" "$test_database_url"
}

capture_cleanup_diagnostic() {
  node -e '
    const limit = 3800;
    const chunks = [];
    let captured = 0;
    let truncated = false;
    process.stdin.on("data", (chunk) => {
      if (captured < limit) {
        const kept = chunk.subarray(0, limit - captured);
        chunks.push(kept);
        captured += kept.length;
      }
      if (captured >= limit && chunk.length > 0) truncated = true;
    });
    process.stdin.on("end", () => {
      process.stdout.write(Buffer.concat(chunks).toString("utf8"));
      if (truncated) process.stdout.write("\n[DIAGNOSTIC TRUNCATED]");
    });
  '
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
{"gate":"certification-preparation","runId":$(json_escape "$run_id"),"candidateSha":$(json_escape "$candidate_sha"),"testStatus":"$test_status","gateReview":"$([[ "$test_status" == PASS ]] && echo PENDING || echo NO-GO)","reviewer":null,"reviewedAt":null,"rationale":null,"storageEvidence":{"adapter":{"kind":"test-only in-process ObjectStorageService adapter","namespace":$(json_escape "$storage_namespace"),"coveredByThisReport":true},"realAppStorage":{"kind":"Replit App Storage sidecar integration","command":"pnpm run smoke:app-storage","coveredByThisReport":false,"releaseApproval":false},"note":"The scheduled sidecar smoke is operational early warning only. It is separate from this candidate-specific release gate and can never approve a release."},"database":{"name":$(json_escape "$test_database"),"isolated":true},"cleanup":{"status":"${cleanup_status:-NOT_RUN}","detail":$(json_escape "$cleanup_detail")},"checks":[$checks_json],"failure":$(json_escape "$failure")}
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
    if [[ -n "$cleanup_detail" ]]; then
      echo
      echo "## Cleanup diagnostic"
      echo
      while IFS= read -r line; do
        printf '    %s\n' "$line"
      done <<<"$cleanup_detail"
    fi
    echo
    echo "This report records internal readiness-preparation evidence only. It is not an official competency or certification decision."
  } >"$markdown_report"
  printf 'Certification gate reports: %s and %s\n' "$json_report" "$markdown_report"
}

cleanup() {
  local cleanup_exit=0
  if [[ -n "$test_database_url" ]]; then
    local cleanup_output_file
    cleanup_output_file="$(mktemp "$report_dir/.cleanup-diagnostic.XXXXXX")"
    dropdb --maintenance-db="$DATABASE_URL" --if-exists "$test_database" 2>&1 |
      capture_cleanup_diagnostic >"$cleanup_output_file"
    local dropdb_exit="${PIPESTATUS[0]}"
    if [[ "$dropdb_exit" -eq 0 ]]; then
      cleanup_status="PASS"
    else
      cleanup_status="FAIL"
      test_status="FAIL"
      cleanup_detail="$(
        {
          printf 'dropdb exited with status %s' "$dropdb_exit"
          if [[ -s "$cleanup_output_file" ]]; then
            printf ': '
            cat "$cleanup_output_file"
          fi
        } | sanitize_cleanup_diagnostic
      )"
      failure="${failure:+$failure; }disposable database cleanup failed"
      cleanup_exit=1
    fi
    rm -f "$cleanup_output_file"
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
  local failure_detail="${2:-command failed}"
  shift
  shift
  if "$@"; then
    checks+=("$(printf '%s\t%s\t%s' "$name" "PASS" "completed against the disposable database" | base64)")
  else
    checks+=("$(printf '%s\t%s\t%s' "$name" "FAIL" "$failure_detail" | base64)")
    failure="$name failed: $failure_detail"
    return 1
  fi
}

# Required by the resource URI constraint in a fresh schema; the gate does not
# copy a production schema or seed demonstration data.
run_check "resource URI policy helper" "command failed" psql "$test_database_url" -v ON_ERROR_STOP=1 -c "CREATE FUNCTION teras_is_valid_resource_uri(value text) RETURNS boolean LANGUAGE sql IMMUTABLE AS \$\$ SELECT value ~ '^https?://[^[:space:]]+$' AND value !~ '[<>\"{}|\\\\^\`]' \$\$;" >/dev/null || exit 1
run_check "schema provisioning" "command failed" env DATABASE_URL="$test_database_url" pnpm --filter @workspace/db run push-force || exit 1
run_check "authoring and safe-media input contract" "command failed" env DATABASE_URL="$test_database_url" NODE_ENV=test pnpm --filter @workspace/api-server exec tsx ./src/course-authoring.contract.test.ts || exit 1
run_check "shared certification preparation journey" "command failed" env DATABASE_URL="$test_database_url" NODE_ENV=test TERAS_GATE_STORAGE_NAMESPACE="$storage_namespace" pnpm --filter @workspace/api-server exec tsx ./src/certification-preparation-journey.integration.ts || exit 1
run_check "admin browser access gate" "reproduce locally with: pnpm --filter @workspace/api-server run test:browser-admin-access" pnpm --filter @workspace/api-server run test:browser-admin-access || exit 1

test_status="PASS"