#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
workflow="$repo_root/.github/workflows/certification-preparation-release.yml"
gate="$repo_root/scripts/certification-preparation-gate.sh"
release_guide="$repo_root/.github/RELEASING.md"
publisher="$repo_root/scripts/publish-approved-release.sh"
evidence_verifier="$repo_root/scripts/verify-certification-preparation-evidence.sh"
workflow_validator="$repo_root/scripts/validate-github-actions-workflow.mjs"
invalid_workflow_fixture="$repo_root/scripts/fixtures/certification-preparation-release.invalid.yml"

fail() {
  echo "Certification-preparation release workflow contract failed: $1" >&2
  exit 1
}

[[ -f "$workflow" ]] || fail "workflow is missing"
[[ -f "$release_guide" ]] || fail "release path documentation is missing"
[[ -f "$publisher" ]] || fail "release publisher is missing"
[[ -f "$evidence_verifier" ]] || fail "shared release evidence verifier is missing"
[[ -f "$workflow_validator" ]] || fail "GitHub Actions workflow validator is missing"
[[ -f "$invalid_workflow_fixture" ]] || fail "invalid workflow fixture is missing"

node "$workflow_validator" "$workflow" ||
  fail "release workflow must parse and pass GitHub Actions semantic validation"
if node "$workflow_validator" "$invalid_workflow_fixture"; then
  fail "invalid GitHub Actions syntax fixture must be rejected"
fi

job_block() {
  local job="$1"
  awk -v start="  ${job}:" '
    $0 == start { found = 1 }
    found && $0 ~ /^  [a-zA-Z0-9_-]+:$/ && $0 != start { exit }
    found { print }
  ' "$workflow"
}

verify_block="$(job_block verify-approval-control)"
evidence_block="$(job_block certification-preparation-evidence)"
release_evidence_block="$(job_block verify-release-evidence)"
review_block="$(job_block gate-review)"
publish_block="$(job_block publish-release)"

grep -Fq "workflow_dispatch:" "$workflow" ||
  fail "release creation must start from an explicit candidate dispatch"
if grep -Eq '^  (release|push):' "$workflow"; then
  fail "release publication must not start before evidence and review"
fi
grep -Fq "actions: read" "$workflow" ||
  fail "environment protection lookup needs actions read permission"
grep -Fq "attestations: write" "$workflow" &&
  grep -Fq "id-token: write" "$workflow" ||
  fail "release evidence attestation needs attestations and OIDC write permissions"
grep -Fq "github.rest.repos.getEnvironment" <<<"$verify_block" &&
  grep -Fq 'rule.type === "required_reviewers"' <<<"$verify_block" &&
  grep -Fq "rule.reviewers.length > 0" <<<"$verify_block" ||
  fail "workflow must reject an absent or unprotected review environment"
grep -Fq "image: postgres:17-alpine" "$workflow" ||
  fail "release evidence job must own disposable PostgreSQL"
grep -Fq "TERAS_GATE_STORAGE_ADAPTER: test" "$workflow" ||
  fail "release evidence must refuse real object storage"
grep -Fq 'TERAS_GATE_STORAGE_NAMESPACE: release-gate/${{ github.run_id }}/${{ github.run_attempt }}' "$workflow" ||
  fail "storage namespace must be unique per workflow attempt"
grep -Fq "run: pnpm run setup:browser-admin-access" <<<"$evidence_block" ||
  fail "release evidence job must install Chromium for the admin access gate"
grep -Fq "run: pnpm run gate:certification-preparation" "$workflow" ||
  fail "workflow does not run the certification-preparation gate"
grep -Fq "if: always()" "$workflow" &&
  grep -Fq "actions/upload-artifact@v4" "$workflow" ||
  fail "reports must be uploaded even when the gate fails"
grep -Fq "needs: verify-approval-control" <<<"$evidence_block" ||
  fail "evidence must require a verified approval control"
grep -Fq -- "- certification-preparation-evidence" <<<"$review_block" &&
  grep -Fq -- "- verify-release-evidence" <<<"$review_block" &&
  grep -Fq "environment: release-gate-review" <<<"$review_block" ||
  fail "Gate Review must wait for verified evidence and human approval"
grep -Fq "needs: certification-preparation-evidence" <<<"$release_evidence_block" &&
  grep -Fq "actions/download-artifact@v4" <<<"$release_evidence_block" &&
  grep -Fq "gh attestation verify" <<<"$release_evidence_block" &&
  grep -Fq -- "--signer-workflow" <<<"$release_evidence_block" &&
  grep -Fq 'bash scripts/verify-certification-preparation-evidence.sh "$json_report" "$TARGET_SHA"' <<<"$release_evidence_block" ||
  fail "Gate Review must verify provenance, PASS status, candidate SHA, and both Super Admin checks first"
grep -Fq -- "- gate-review" <<<"$publish_block" &&
  grep -Fq "run: bash scripts/publish-approved-release.sh" <<<"$publish_block" ||
  fail "release creation must happen only after Gate Review GO"
if grep -Fq "publish-approved-release.sh" <<<"$evidence_block$review_block"; then
  fail "evidence or review jobs must not publish a release"
fi
grep -Fq 'candidate_sha: ${{ steps.candidate.outputs.sha }}' <<<"$evidence_block" &&
  grep -Fq 'TERAS_GATE_CANDIDATE_SHA: ${{ steps.candidate.outputs.sha }}' <<<"$evidence_block" &&
  grep -Fq 'TARGET_SHA: ${{ needs.certification-preparation-evidence.outputs.candidate_sha }}' <<<"$publish_block" ||
  fail "publication must use the exact SHA tested before approval"
grep -Fq "actions/attest-build-provenance@v2" <<<"$evidence_block" &&
  grep -Fq "release-gate-reports/*.json" <<<"$evidence_block" &&
  grep -Fq "release-gate-reports/*.md" <<<"$evidence_block" ||
  fail "both evidence reports must receive GitHub provenance attestations"
grep -Fq "actions/download-artifact@v4" <<<"$publish_block" &&
  grep -Fq "gh attestation verify" <<<"$publish_block" &&
  grep -Fq 'bash scripts/verify-certification-preparation-evidence.sh "$json_report" "$TARGET_SHA"' <<<"$publish_block" ||
  fail "publisher must reverify attestation, candidate SHA, PASS status, and both Super Admin checks"
[[ "$(grep -Fc 'bash scripts/verify-certification-preparation-evidence.sh "$json_report" "$TARGET_SHA"' "$workflow")" -eq 2 ]] ||
  fail "review and publication must call the same release evidence verifier"
grep -Fq 'report_sha="$(jq -er '\''.candidateSha'\'' "$json_report")"' "$evidence_verifier" &&
  grep -Fq 'report_status="$(jq -er '\''.testStatus'\'' "$json_report")"' "$evidence_verifier" &&
  grep -Fq '"Super Admin provisioning policy"' "$evidence_verifier" &&
  grep -Fq '"Super Admin ready and legacy provisioning"' "$evidence_verifier" ||
  fail "shared verifier must own candidate SHA, PASS status, and both Super Admin rules"
grep -Fq 'RELEASE_TAG: ${{ inputs.tag_name }}' <<<"$publish_block" &&
  grep -Fq 'RELEASE_NAME: ${{ inputs.release_name || inputs.tag_name }}' <<<"$publish_block" ||
  fail "dispatcher input must reach the shell only through environment variables"
grep -Fq 'ref=refs/tags/${RELEASE_TAG}' "$publisher" &&
  grep -Fq 'sha=${TARGET_SHA}' "$publisher" ||
  fail "publisher must atomically create the tag at the tested SHA"
grep -Fq "Certification preparation release gate" "$release_guide" &&
  grep -Fiq "required reviewers" "$release_guide" &&
  grep -Fq "Do not publish releases directly" "$release_guide" ||
  fail "release guide must document the protected pre-publication path"

grep -Fq "cleanup || gate_exit=1" "$gate" ||
  fail "cleanup failure must make the gate fail"
grep -Fq "trap - EXIT" "$gate" ||
  fail "exit trap must be disabled before propagating the final status"
grep -Fq '"candidateSha":$(json_escape "$candidate_sha")' "$gate" &&
  grep -Fq 'Release candidate SHA: \`$candidate_sha\`' "$gate" &&
  grep -Fq '40-character Git commit SHA' "$gate" ||
  fail "JSON and Markdown reports must identify a valid full candidate SHA"
grep -Fq 'pnpm --filter @workspace/api-server run test:browser-admin-access' "$gate" &&
  grep -Fq 'reproduce locally with: pnpm --filter @workspace/api-server run test:browser-admin-access' "$gate" ||
  fail "release gate must block on admin browser access with an actionable reproduction command"
grep -Fq 'pnpm --filter @workspace/scripts run test:super-admin-provisioning-policy' "$gate" &&
  grep -Fq 'pnpm --filter @workspace/scripts run test:super-admin-provisioning' "$gate" &&
  grep -Fq 'env DATABASE_URL="$test_database_url"' "$gate" ||
  fail "release gate must block on Super Admin policy and ready/legacy provisioning checks"

mock_dir="$(mktemp -d)"
trap 'rm -rf "$mock_dir"' EXIT

fixture_dir="$mock_dir/release-evidence-fixtures"
mkdir -p "$fixture_dir"

write_evidence_fixture() {
  local name="$1"
  local candidate_sha="$2"
  local test_status="$3"
  local checks="$4"
  jq -n \
    --arg candidate_sha "$candidate_sha" \
    --arg test_status "$test_status" \
    --argjson checks "$checks" \
    '{candidateSha: $candidate_sha, testStatus: $test_status, checks: $checks}' >"$fixture_dir/$name.json"
}

fixture_candidate_sha="1111111111111111111111111111111111111111"
wrong_candidate_sha="2222222222222222222222222222222222222222"
policy_pass='{"name":"Super Admin provisioning policy","status":"PASS","detail":"Policy check passed."}'
ready_pass='{"name":"Super Admin ready and legacy provisioning","status":"PASS","detail":"Provisioning check passed."}'
ready_fail='{"name":"Super Admin ready and legacy provisioning","status":"FAIL","detail":"Provisioning check failed."}'

write_evidence_fixture valid "$fixture_candidate_sha" PASS "[$policy_pass,$ready_pass]"
write_evidence_fixture wrong-sha "$wrong_candidate_sha" PASS "[$policy_pass,$ready_pass]"
write_evidence_fixture missing-policy "$fixture_candidate_sha" PASS "[$ready_pass]"
write_evidence_fixture missing-ready "$fixture_candidate_sha" PASS "[$policy_pass]"
write_evidence_fixture failed-check "$fixture_candidate_sha" PASS "[$policy_pass,$ready_fail]"
write_evidence_fixture duplicate-name "$fixture_candidate_sha" PASS "[$policy_pass,$policy_pass]"
write_evidence_fixture global-fail "$fixture_candidate_sha" FAIL "[$policy_pass,$ready_pass]"

if ! bash "$evidence_verifier" "$fixture_dir/valid.json" "$fixture_candidate_sha"; then
  fail "valid evidence with exactly two distinct passing Super Admin checks must be accepted"
fi
for invalid_fixture in wrong-sha missing-policy missing-ready failed-check duplicate-name global-fail; do
  if bash "$evidence_verifier" "$fixture_dir/$invalid_fixture.json" "$fixture_candidate_sha"; then
    fail "invalid $invalid_fixture evidence must be rejected"
  fi
done
if grep -Eiq 'email|identity|@' "$fixture_dir"/*.json; then
  fail "release evidence fixtures must not contain identity or email data"
fi

gate_report_dir="$mock_dir/gate-reports"
gate_run_id="admin-browser-failure"
gate_candidate_sha="1111111111111111111111111111111111111111"
long_dropdb_output="$(node - <<'EOF'
const urls = [
  "postgres://plain_user:plain_password@gate-test.invalid/postgres",
  "postgresql://encoded_user:p%40ss%3Aword@gate-test.invalid:5432/postgres?sslmode=require",
  "POSTGRESQL://caps_user:caps_password@[2001:db8::1]:5432/postgres",
];
process.stdout.write([
  "dropdb: error: database removal failed",
  "terminal controls: \u001b[31mred\u001b[0m bell=\u0007 backspace=\u0008 carriage=\rreturn delete=\u007f c1=\u0085",
  "# forged Markdown heading",
  "| forged | table | row |",
  "```sh",
  "echo this must remain diagnostic text",
  "```",
  ...urls.map((url) => `maintenance URL ${url}`),
  "very long detail follows:",
].join("\n"));
EOF
)"
cat >"$mock_dir/pnpm" <<'EOF'
#!/usr/bin/env bash
printf '%s\n' "$*" >>"$PNPM_MOCK_LOG"
if [[ "$*" == *"test:browser-admin-access"* ]]; then
  exit 23
fi
exit 0
EOF
cat >"$mock_dir/database-command" <<'EOF'
#!/usr/bin/env bash
printf '%s %s\n' "$(basename "$0")" "$*" >>"$DATABASE_MOCK_LOG"
if [[ "$(basename "$0")" == "dropdb" ]]; then
  if [[ -n "${DROPDB_MOCK_DIAGNOSTIC:-}" ]]; then
    printf '%s\n' "$DROPDB_MOCK_DIAGNOSTIC" >&2
  fi
  if [[ -n "${DROPDB_MOCK_EXTREME_OUTPUT:-}" ]]; then
    node -e 'process.stderr.write("x".repeat(300000) + "\nTRUNCATION_SENTINEL_MUST_NOT_APPEAR\n")'
  fi
  exit "${DROPDB_MOCK_EXIT:-0}"
fi
exit 0
EOF
chmod +x "$mock_dir/pnpm" "$mock_dir/database-command"
ln -s database-command "$mock_dir/createdb"
ln -s database-command "$mock_dir/dropdb"
ln -s database-command "$mock_dir/psql"

if PATH="$mock_dir:$PATH" \
  PNPM_MOCK_LOG="$mock_dir/pnpm-calls.log" \
  DATABASE_MOCK_LOG="$mock_dir/database-calls.log" \
  DROPDB_MOCK_EXIT=31 \
  DROPDB_MOCK_DIAGNOSTIC="$long_dropdb_output" \
  DROPDB_MOCK_EXTREME_OUTPUT=1 \
  DATABASE_URL="postgresql://gate-test.invalid/postgres" \
  TERAS_GATE_RUN_ID="$gate_run_id" \
  TERAS_GATE_CANDIDATE_SHA="$gate_candidate_sha" \
  TERAS_GATE_REPORT_DIR="$gate_report_dir" \
  TERAS_GATE_STORAGE_ADAPTER="test" \
  TERAS_GATE_STORAGE_NAMESPACE="release-gate-contract" \
  bash "$gate"; then
  fail "gate must exit non-zero when the admin browser access check fails"
fi

gate_json_report="$gate_report_dir/certification-preparation-$gate_run_id.json"
gate_markdown_report="$gate_report_dir/certification-preparation-$gate_run_id.md"
[[ -f "$gate_json_report" && -f "$gate_markdown_report" ]] ||
  fail "failed admin browser gate must still write JSON and Markdown reports"
grep -Fq '"testStatus":"FAIL"' "$gate_json_report" &&
  grep -Fq '"gateReview":"NO-GO"' "$gate_json_report" &&
  grep -Fq '"cleanup":{"status":"FAIL","detail":"dropdb exited with status 31: dropdb: error: database removal failed\nterminal controls: \\u001b[31mred\\u001b[0m bell=\\u0007 backspace=\\u0008 carriage=\\u000dreturn delete=\\u007f c1=\\u0085\n# forged Markdown heading\n| forged | table | row |\n```sh\necho this must remain diagnostic text\n```\nmaintenance URL postgresql://[REDACTED]\nmaintenance URL postgresql://[REDACTED]\nmaintenance URL postgresql://[REDACTED]' "$gate_json_report" ||
  fail "combined check and cleanup failure JSON report must be FAIL/NO-GO with failed cleanup"
grep -Fq 'Automated test status: **FAIL**' "$gate_markdown_report" &&
  grep -Fq 'Gate review: **NO-GO**' "$gate_markdown_report" ||
  fail "combined check and cleanup failure Markdown report must be FAIL/NO-GO"
grep -Fq 'reproduce locally with: pnpm --filter @workspace/api-server run test:browser-admin-access' "$gate_json_report" &&
  grep -Fq 'reproduce locally with: pnpm --filter @workspace/api-server run test:browser-admin-access' "$gate_markdown_report" ||
  fail "combined failure reports must retain the actionable primary check failure"
grep -Fq 'disposable database cleanup failed' "$gate_json_report" &&
  grep -Fq 'disposable database cleanup failed' "$gate_markdown_report" ||
  fail "combined failure reports must also record the cleanup failure"
grep -Fq 'maintenance URL postgresql://[REDACTED]' "$gate_json_report" &&
  grep -Fq '    # forged Markdown heading' "$gate_markdown_report" &&
  grep -Fq '    | forged | table | row |' "$gate_markdown_report" &&
  grep -Fq '    ```sh' "$gate_markdown_report" ||
  fail "combined failure reports must include safe, actionable cleanup diagnostics"
if grep -Eq 'plain_password|p%40ss%3Aword|caps_password|plain_user|encoded_user|caps_user' "$gate_json_report" "$gate_markdown_report"; then
  fail "cleanup diagnostics must redact database credentials"
fi
node - "$gate_json_report" <<'EOF' ||
const fs = require("fs");
const report = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
if (!report.failure.startsWith("admin browser access gate failed:")) {
  process.exit(1);
}
if (report.cleanup.detail.length > 4000) {
  process.exit(1);
}
if (!report.cleanup.detail.includes("# forged Markdown heading")) {
  process.exit(1);
}
if (!report.cleanup.detail.includes("terminal controls: \\u001b[31mred\\u001b[0m bell=\\u0007 backspace=\\u0008 carriage=\\u000dreturn delete=\\u007f c1=\\u0085")) {
  process.exit(1);
}
if (/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/.test(report.cleanup.detail)) {
  process.exit(1);
}
if (report.cleanup.detail.includes("TRUNCATION_SENTINEL_MUST_NOT_APPEAR")) {
  process.exit(1);
}
if (!report.cleanup.detail.endsWith("[DIAGNOSTIC TRUNCATED]")) {
  process.exit(1);
}
if ((report.cleanup.detail.match(/postgresql:\/\/\[REDACTED\]/g) || []).length !== 3) {
  process.exit(1);
}
EOF
  fail "JSON cleanup detail must remain valid, redacted, multiline, and bounded"
if grep -Fxq '# forged Markdown heading' "$gate_markdown_report" ||
  grep -Fxq '| forged | table | row |' "$gate_markdown_report" ||
  grep -Fxq '```sh' "$gate_markdown_report"; then
  fail "cleanup Markdown characters must remain inside the indented diagnostic block"
fi
grep -Fq '    terminal controls: \u001b[31mred\u001b[0m bell=\u0007 backspace=\u0008 carriage=\u000dreturn delete=\u007f c1=\u0085' "$gate_markdown_report" ||
  fail "cleanup Markdown must render terminal controls as stable diagnostic text"
node - "$gate_json_report" "$gate_markdown_report" <<'EOF' ||
const fs = require("fs");
for (const path of process.argv.slice(2)) {
  const output = fs.readFileSync(path, "utf8");
  if (/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/.test(output)) process.exit(1);
}
EOF
  fail "cleanup reports must not contain raw terminal control characters"
if grep -Fq 'TRUNCATION_SENTINEL_MUST_NOT_APPEAR' "$gate_json_report" "$gate_markdown_report"; then
  fail "cleanup diagnostics must be truncated before oversized trailing content"
fi
grep -Fq '[DIAGNOSTIC TRUNCATED]' "$gate_json_report" &&
  grep -Fq '    [DIAGNOSTIC TRUNCATED]' "$gate_markdown_report" ||
  fail "truncated cleanup diagnostics must say that output was omitted"
grep -Fq 'test:browser-admin-access' "$mock_dir/pnpm-calls.log" ||
  fail "admin browser failure simulation did not execute the mocked command"
grep -Fq 'test:super-admin-provisioning-policy' "$mock_dir/pnpm-calls.log" &&
  grep -Fq 'test:super-admin-provisioning' "$mock_dir/pnpm-calls.log" ||
  fail "release gate did not execute both Super Admin checks before later checks"
node - "$gate_json_report" <<'EOF' ||
const fs = require("fs");
const report = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const expected = [
  "Super Admin provisioning policy",
  "Super Admin ready and legacy provisioning",
];
for (const name of expected) {
  const check = report.checks.find((candidate) => candidate.name === name);
  if (!check || check.status !== "PASS") process.exit(1);
  if (/email|identity|clerk user/i.test(check.detail)) process.exit(1);
}
EOF
  fail "release evidence must record sanitized PASS results for both Super Admin checks"
grep -Fq 'dropdb ' "$mock_dir/database-calls.log" ||
  fail "cleanup failure simulation did not execute the mocked dropdb command"

cat >"$mock_dir/gh" <<'EOF'
#!/usr/bin/env bash
printf '%s\n' "$*" >> "$GH_MOCK_LOG"
if [[ "$1" == "api" && "$*" == *"--method POST"* ]]; then
  echo "HTTP 422: Reference already exists at a different SHA" >&2
  exit 1
fi
EOF
chmod +x "$mock_dir/gh"

if PATH="$mock_dir:$PATH" \
  GH_MOCK_LOG="$mock_dir/calls.log" \
  GITHUB_REPOSITORY="teras/academy" \
  RELEASE_TAG="v-existing" \
  RELEASE_NAME="Existing collision" \
  TARGET_SHA="1111111111111111111111111111111111111111" \
  PRERELEASE="false" \
  bash "$publisher"; then
  fail "publisher must reject an existing tag instead of releasing it"
fi
grep -Fq "refs/tags/v-existing" "$mock_dir/calls.log" ||
  fail "collision test did not attempt atomic tag creation"
if grep -Fq "release create" "$mock_dir/calls.log"; then
  fail "publisher attempted a release after tag collision"
fi

echo "Certification-preparation release workflow contract passed."