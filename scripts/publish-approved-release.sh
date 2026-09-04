#!/usr/bin/env bash
set -euo pipefail

: "${GITHUB_REPOSITORY:?GITHUB_REPOSITORY is required}"
: "${RELEASE_TAG:?RELEASE_TAG is required}"
: "${RELEASE_NAME:?RELEASE_NAME is required}"
: "${TARGET_SHA:?TARGET_SHA is required}"
: "${PRERELEASE:?PRERELEASE is required}"

if [[ ! "$RELEASE_TAG" =~ ^v?[0-9A-Za-z][0-9A-Za-z._-]{0,127}$ ]]; then
  echo "Invalid release tag: use 1-128 letters, digits, dots, underscores, or hyphens." >&2
  exit 1
fi
if [[ ! "$TARGET_SHA" =~ ^[0-9a-f]{40}$ ]]; then
  echo "Invalid release target: expected a full commit SHA." >&2
  exit 1
fi
if [[ "$PRERELEASE" != "true" && "$PRERELEASE" != "false" ]]; then
  echo "Invalid prerelease flag: expected true or false." >&2
  exit 1
fi

tag_created=false
cleanup_failed_release() {
  local release_exit=$?
  trap - EXIT
  if [[ "$release_exit" -ne 0 && "$tag_created" == "true" ]]; then
    gh api \
      --method DELETE \
      "repos/${GITHUB_REPOSITORY}/git/refs/tags/${RELEASE_TAG}" >/dev/null ||
      echo "Warning: failed to remove tag after release creation failed." >&2
  fi
  exit "$release_exit"
}
trap cleanup_failed_release EXIT

# Creating the ref is collision-failing. An existing tag can never be reused for
# a newly approved release, even if it points at a different commit.
gh api \
  --method POST \
  "repos/${GITHUB_REPOSITORY}/git/refs" \
  -f "ref=refs/tags/${RELEASE_TAG}" \
  -f "sha=${TARGET_SHA}" >/dev/null
tag_created=true

release_args=(
  release create "$RELEASE_TAG"
  --repo "$GITHUB_REPOSITORY"
  --title "$RELEASE_NAME"
  --generate-notes
)
if [[ "$PRERELEASE" == "true" ]]; then
  release_args+=(--prerelease)
fi
gh "${release_args[@]}"

trap - EXIT