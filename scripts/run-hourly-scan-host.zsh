#!/bin/zsh
set -euo pipefail

repo_root="/Users/hongxichen/Desktop/career-ops"
cd "$repo_root"

export PATH="/Users/hongxichen/.bun/bin:/Users/hongxichen/.npm-global/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"
export CAREER_OPS_SCAN_START_BRIDGE="${CAREER_OPS_SCAN_START_BRIDGE:-1}"
export CAREER_OPS_SCAN_REQUIRE_BRIDGE="${CAREER_OPS_SCAN_REQUIRE_BRIDGE:-1}"
export CAREER_OPS_SCAN_BRIDGE_WAIT_MS="${CAREER_OPS_SCAN_BRIDGE_WAIT_MS:-30000}"

mkdir -p "$repo_root/data/automation"

if command -v bb-browser >/dev/null 2>&1; then
  if ! bb-browser tab list >/dev/null 2>&1; then
    bb-browser daemon shutdown >/dev/null 2>&1 || true
    bb-browser tab list >/dev/null 2>&1 || true
  fi
fi

bun run auto:hourly-scan
