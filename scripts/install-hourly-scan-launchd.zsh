#!/bin/zsh
set -euo pipefail

repo_root="/Users/hongxichen/Desktop/career-ops"
label="com.career-ops.hourly-scan"
plist="$HOME/Library/LaunchAgents/$label.plist"

mkdir -p "$HOME/Library/LaunchAgents" "$repo_root/data/automation"

cat > "$plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$label</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/zsh</string>
    <string>-lc</string>
    <string>cd "$repo_root" &amp;&amp; export PATH="/Users/hongxichen/.bun/bin:/Users/hongxichen/.npm-global/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:\$PATH" &amp;&amp; export CAREER_OPS_SCAN_START_BRIDGE="\${CAREER_OPS_SCAN_START_BRIDGE:-1}" CAREER_OPS_SCAN_REQUIRE_BRIDGE="\${CAREER_OPS_SCAN_REQUIRE_BRIDGE:-1}" CAREER_OPS_SCAN_BRIDGE_WAIT_MS="\${CAREER_OPS_SCAN_BRIDGE_WAIT_MS:-30000}" &amp;&amp; mkdir -p "$repo_root/data/automation" &amp;&amp; if command -v bb-browser &gt;/dev/null 2&gt;&amp;1; then if ! bb-browser tab list &gt;/dev/null 2&gt;&amp;1; then bb-browser daemon shutdown &gt;/dev/null 2&gt;&amp;1 || true; bb-browser tab list &gt;/dev/null 2&gt;&amp;1 || true; fi; fi; bun run auto:hourly-scan</string>
  </array>
  <key>WorkingDirectory</key>
  <string>$repo_root</string>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Minute</key>
    <integer>0</integer>
  </dict>
  <key>StandardOutPath</key>
  <string>$repo_root/data/automation/launchd-hourly-scan.out.log</string>
  <key>StandardErrorPath</key>
  <string>$repo_root/data/automation/launchd-hourly-scan.err.log</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>/Users/hongxichen/.bun/bin:/Users/hongxichen/.npm-global/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
  </dict>
</dict>
</plist>
PLIST

launchctl unload "$plist" >/dev/null 2>&1 || true
launchctl load "$plist"
launchctl start "$label" || true

echo "Installed $label at $plist"
echo "Logs:"
echo "  $repo_root/data/automation/launchd-hourly-scan.out.log"
echo "  $repo_root/data/automation/launchd-hourly-scan.err.log"
