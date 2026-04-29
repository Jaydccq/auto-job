#!/bin/zsh
set -euo pipefail

repo_root="/Users/hongxichen/Desktop/auto-job"
cd "$repo_root"

export PATH="/Users/hongxichen/.npm-global/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"
export AUTO_JOB_SCAN_START_BRIDGE="${AUTO_JOB_SCAN_START_BRIDGE:-1}"
export AUTO_JOB_SCAN_REQUIRE_BRIDGE="${AUTO_JOB_SCAN_REQUIRE_BRIDGE:-1}"
export AUTO_JOB_SCAN_BRIDGE_WAIT_MS="${AUTO_JOB_SCAN_BRIDGE_WAIT_MS:-30000}"

mkdir -p "$repo_root/data/automation"

if command -v bb-browser >/dev/null 2>&1; then
  if ! bb-browser tab list >/dev/null 2>&1; then
    bb-browser daemon shutdown >/dev/null 2>&1 || true
    bb-browser tab list >/dev/null 2>&1 || true
  fi
fi

npm run auto:hourly-scan
