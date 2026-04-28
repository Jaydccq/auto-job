# Codex hourly scan automation

This automation runs Career-Ops job discovery every weekday hour from 08:00
through 22:00 America/New_York. It uses the local checkout because this workflow
writes user-layer artifacts under `data/`, `reports/`, `batch/`, and `web/`.

## Repository setup

The automation command is:

```bash
bun run auto:hourly-scan
```

For a no-evaluation preview:

```bash
CAREER_OPS_SCAN_IGNORE_WINDOW=1 bun run auto:hourly-scan:dry
```

The dry command still runs scanner read paths, but it skips bridge startup,
write-path evaluation, tracker maintenance, and dashboard rebuild.

## Host scheduler setup

Codex cron runs with restricted automation permissions and may report
`approval_policy=never`, `connect EPERM`, or `listen EPERM`. Use macOS
`launchd` for the live scan so bridge, DNS, `tsx`, and browser/CDP access run
in the normal local user environment:

```bash
scripts/install-hourly-scan-launchd.zsh
```

The installed launch agent runs at the top of every hour. The checked-in
`scripts/hourly-job-scan.mjs` keeps the actual weekday 08:00-22:00
America/New_York guard, so off-window launches exit without scanning.

The launch agent writes logs to:

```text
data/automation/launchd-hourly-scan.out.log
data/automation/launchd-hourly-scan.err.log
```

`scripts/run-hourly-scan-host.zsh` starts/reuses the real Codex bridge, preflights
`bb-browser`, and runs:

```bash
bun run auto:hourly-scan
```

## Codex App setup

Use Codex Automation as a reporting layer after the host scheduler, not as the
live scanner.

1. Open Codex Automations.
2. Create a new project-scoped automation for this `career-ops` project.
3. Choose the local project checkout as the run location. Do not use a worktree
   for this workflow because the scanners depend on local browser state and
   write normal project artifacts.
4. Set the schedule to weekdays, hourly, shortly after the host scan,
   America/New_York. If the UI only accepts cron syntax, use:

   ```text
   20 8-22 * * 1-5
   ```

5. Use this prompt:

   ```text
   Check the latest Career-Ops hourly scan result in the local checkout. Do not run bun run auto:hourly-scan from this Codex cron context if the session has approval_policy=never or sandbox networking/IPC restrictions, because that environment cannot access the local bridge/browser reliably.

   Inspect data/automation/hourly-scan-*.md and report the newest summary:
   1. Which sources ran
   2. How many evaluations completed
   3. Any source blocked by login, checkpoint, rate limit, verification, parsing, browser/CDP, bridge, DNS, or sandbox execution error
   4. The newest high-fit roles worth reviewing
   5. The summary file path under data/automation

   If the newest summary reports sandbox EPERM, bridge_unavailable_preview, DNS ENOTFOUND, or tsx IPC failures, state that the Codex cron context is not suitable for live scanning and that the host-side scheduler/terminal run must execute bun run auto:hourly-scan. Never submit applications or click Apply, Easy Apply, Save, job alerts, resume upload, or final submit controls.
   ```

## What the command does

`scripts/hourly-job-scan.mjs`:

- Checks the America/New_York weekday 08:00-22:00 schedule window.
- Takes `data/automation/hourly-scan.lock` to avoid overlapping hourly runs.
- Reuses an existing bridge in `real/codex` mode for write/evaluation paths.
- If no bridge is reachable, continues in read-only preview mode instead of
  failing before source scans start. In preview mode it does not write pipeline
  candidates, queue evaluations, merge tracker rows, or rebuild the dashboard.
- Waits briefly for a just-started bridge before falling back to preview mode.
- Runs the configured source list, defaulting to
  `scan,newgrad,builtin,linkedin,indeed`.
- For LinkedIn automation runs, reads `config/profile.yml ->
  linkedin_scan.search_url` as the base search and replaces `f_TPR` with
  `r4000` by default. `f_TPR=r86400` means roughly posted in the last 24 hours;
  `r4000` keeps hourly automation focused on the newest roughly last-hour
  postings.
- For Indeed automation runs, reads `config/profile.yml ->
  indeed_scan.search_url` or `CAREER_OPS_INDEED_URL` as the full search URL, so
  filters such as entry-level `sc=` are preserved.
- Runs the broad `scan` source at most once per cadence window by default,
  using the newest successful hourly summary as the local signal. This avoids
  fetching hundreds of already-seen portal/Built In rows every hour while
  preserving hourly recent-source scans. Force it with
  `CAREER_OPS_SCAN_FORCE_BROAD=1`, or set
  `CAREER_OPS_SCAN_BROAD_INTERVAL_HOURS=0` to restore every-run behavior.
- Uses `newgrad_quick` by default. Evaluation and enrichment are uncapped unless
  `CAREER_OPS_SCAN_EVALUATE_LIMIT` or `CAREER_OPS_SCAN_ENRICH_LIMIT` is set.
- Runs tracker/dashboard maintenance after successful live scans.
- Writes `data/automation/hourly-scan-*.md` with source status, completed
  evaluation count, blocker recovery commands, high-fit roles, and output tails.

## Tuning knobs

Set these in the automation environment only when needed:

```bash
CAREER_OPS_SCAN_SOURCES=newgrad,builtin,linkedin,indeed
CAREER_OPS_SCAN_EVAL_MODE=newgrad_quick
CAREER_OPS_SCAN_EVALUATE_LIMIT=3  # optional cap; unset means no cap
CAREER_OPS_SCAN_ENRICH_LIMIT=10    # optional cap; unset means no cap
CAREER_OPS_SCAN_STEP_TIMEOUT_MS=2700000
CAREER_OPS_SCAN_IGNORE_WINDOW=1
CAREER_OPS_SCAN_DRY_RUN=1
CAREER_OPS_SCAN_START_BRIDGE=1
CAREER_OPS_SCAN_REQUIRE_BRIDGE=1
CAREER_OPS_SCAN_BRIDGE_WAIT_MS=15000
CAREER_OPS_SCAN_BROAD_INTERVAL_HOURS=6
CAREER_OPS_SCAN_FORCE_BROAD=1
CAREER_OPS_LINKEDIN_POSTED_WITHIN=r4000
CAREER_OPS_LINKEDIN_URL="https://www.linkedin.com/jobs/search-results/?keywords=software%20ai%20engineer%20new%20graduate&f_TPR=r4000"
CAREER_OPS_INDEED_URL="https://www.indeed.com/jobs?q=software+engineer%2C+AI+engineer&l=&sc=0kf%3Aexplvl%28ENTRY_LEVEL%29%3B"
```

`CAREER_OPS_SCAN_START_BRIDGE=1` restores automatic bridge startup. Use it only
from an environment that can listen on localhost; Codex Automation sandbox runs
can return `listen EPERM` when they try to start a local server.

`CAREER_OPS_SCAN_REQUIRE_BRIDGE=1` makes missing bridge a hard failure instead
of a read-only preview fallback.

For an occasional deeper manual run:

```bash
CAREER_OPS_SCAN_IGNORE_WINDOW=1 \
CAREER_OPS_SCAN_EVAL_MODE=default \
CAREER_OPS_SCAN_SOURCES=newgrad,builtin,linkedin,indeed \
bun run auto:hourly-scan
```

## Manual recovery

- LinkedIn login/checkpoint: `bb-browser open https://www.linkedin.com/login`
- Indeed verification: `bb-browser open https://www.indeed.com`
- Jobright/newgrad login: `bun run newgrad-scan:login`
- Bridge recovery: `bun run server`

Complete manual login or verification in the opened browser, close any manual
scan browser window that uses the same profile, then let the next automation run
or rerun the command manually.

If Codex Automation reports `listen EPERM`, start the bridge once from a normal
local terminal:

```bash
bun run server
```

Keep that terminal process running. The next hourly automation run will reuse
the existing bridge and enable writes/evaluations.
