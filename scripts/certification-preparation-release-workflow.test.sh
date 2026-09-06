#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
workflow="$repo_root/.github/workflows/certification-preparation-release.yml"
gate="$repo_root/scripts/certification-preparation-gate.sh"
release_guide="$repo_root/.github/RELEASING.md"
publisher="$repo_root/scripts/publish-approved-release.sh"

fail() {
  echo "Certification-preparation release workflow contract failed: $1" >&2
  exit 1
}

[[ -f "$workflow" ]] || fail "workflow is missing"
[[ -f "$release_guide" ]] || fail "release path documentation is missing"
[[ -f "$publisher" ]] || fail "release publisher is missing"

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
  grep -Fq "report_sha" <<<"$release_evidence_block" &&
  grep -Fq '[[ "$report_sha" == "$TARGET_SHA" ]]' <<<"$release_evidence_block" &&
  grep -Fq '[[ "$report_status" == "PASS" ]]' <<<"$release_evidence_block" ||
  fail "Gate Review must verify provenance, PASS status, and candidate SHA first"
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
  grep -Fq 'candidateSha' <<<"$publish_block" &&
  grep -Fq 'testStatus' <<<"$publish_block" ||
  fail "publisher must reverify attestation, candidate SHA, and PASS status"
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

mock_dir="$(mktemp -d)"
trap 'rm -rf "$mock_dir"' EXIT

gate_report_dir="$mock_dir/gate-reports"
gate_run_id="admin-browser-failure"
gate_candidate_sha="1111111111111111111111111111111111111111"
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
  DROPDB_MOCK_DIAGNOSTIC="dropdb: error: database removal failed: database is being accessed by other users; maintenance URL postgresql://gate_user:gate_password@gate-test.invalid/postgres" \
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
  grep -Fq '"cleanup":{"status":"FAIL","detail":"dropdb exited with status 31: dropdb: error: database removal failed: database is being accessed by other users; maintenance URL postgresql://[REDACTED]"}' "$gate_json_report" ||
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
grep -Fq 'dropdb exited with status 31: dropdb: error: database removal failed: database is being accessed by other users; maintenance URL postgresql://[REDACTED]' "$gate_json_report" &&
  grep -Fq 'dropdb exited with status 31: dropdb: error: database removal failed: database is being accessed by other users; maintenance URL postgresql://[REDACTED]' "$gate_markdown_report" ||
  fail "combined failure reports must include safe, actionable cleanup diagnostics"
if grep -Fq 'gate_password' "$gate_json_report" || grep -Fq 'gate_password' "$gate_markdown_report"; then
  fail "cleanup diagnostics must redact database credentials"
fi
node - "$gate_json_report" <<'EOF' ||
const fs = require("fs");
const report = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
if (!report.failure.startsWith("admin browser access gate failed:")) {
  process.exit(1);
}
EOF
  fail "primary check failure must remain the first reported failure"
grep -Fq 'test:browser-admin-access' "$mock_dir/pnpm-calls.log" ||
  fail "admin browser failure simulation did not execute the mocked command"
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