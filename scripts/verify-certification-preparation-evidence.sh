#!/usr/bin/env bash
set -euo pipefail

json_report="${1:-}"
target_sha="${2:-}"

if [[ -z "$json_report" || -z "$target_sha" ]]; then
  echo "Usage: $0 <json-report> <target-sha>" >&2
  exit 2
fi

[[ -f "$json_report" ]] || {
  echo "::error::Release-gate JSON evidence report does not exist: $json_report"
  exit 1
}

report_sha="$(jq -er '.candidateSha' "$json_report")" || {
  echo "::error::Release-gate evidence has no valid candidate SHA."
  exit 1
}
report_status="$(jq -er '.testStatus' "$json_report")" || {
  echo "::error::Release-gate evidence has no valid test status."
  exit 1
}

[[ "$report_sha" == "$target_sha" ]] || {
  echo "::error::Evidence SHA $report_sha does not match release candidate $target_sha."
  exit 1
}
[[ "$report_status" == "PASS" ]] || {
  echo "::error::Release-gate evidence status is $report_status, not PASS."
  exit 1
}

jq -e '
  [
    .checks[] |
    select(
      (.name == "Super Admin provisioning policy" or
       .name == "Super Admin ready and legacy provisioning") and
      .status == "PASS"
    ) |
    .name
  ] | sort == [
    "Super Admin provisioning policy",
    "Super Admin ready and legacy provisioning"
  ]
' "$json_report" >/dev/null || {
  echo "::error::Release-gate evidence is missing a required passing Super Admin check."
  exit 1
}