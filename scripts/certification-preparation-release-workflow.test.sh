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