#!/usr/bin/env bash

sanitize_cleanup_diagnostic() {
  node -e '
    let diagnostic = process.argv[1];
    for (const secret of process.argv.slice(2)) {
      if (secret) diagnostic = diagnostic.split(secret).join("[REDACTED_DATABASE_URL]");
    }
    diagnostic = diagnostic.replace(/\bpostgres(?:ql)?:\/\/[^\s]+/gi, "postgresql://[REDACTED]");
    process.stdout.write(diagnostic.trim().slice(0, 4000));
  ' "$1" "${DATABASE_URL:-}" "${test_database_url:-}"
}

report_cleanup_failure() {
  local command_name="$1"
  local command_exit="$2"
  local command_output="$3"
  local diagnostic=""

  if [[ -n "$command_output" ]]; then
    diagnostic="$(sanitize_cleanup_diagnostic "$command_output")"
  fi

  printf 'Cleanup failed: %s exited with status %s' "$command_name" "$command_exit" >&2
  if [[ -n "$diagnostic" ]]; then
    printf ': %s' "$diagnostic" >&2
  fi
  printf '\n' >&2
}