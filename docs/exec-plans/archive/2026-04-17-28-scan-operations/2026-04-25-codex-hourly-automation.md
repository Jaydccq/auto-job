# Codex hourly scan automation

## Background

The project already has source-specific scanners for zero-token portal scan,
newgrad-jobs, Built In, LinkedIn, and Indeed. Codex Automation needs one stable
project command that can run safely on a schedule without overlapping itself or
running outside the requested weekday business window.

## Goal

Add a local-project automation entrypoint for weekday hourly scans from 08:00
through 22:00 America/New_York, and document the Codex App setup steps.

## Scope

- Add an npm script that runs one hourly scan orchestration command.
- Add a small Node orchestration script for time-window guard, locking, bridge
  readiness, source execution, post-scan maintenance, and summary output.
- Add durable Codex Automation setup instructions in `docs/`.
- Add only the profile/config needed for existing scanners to run unattended.

## Assumptions

- Automation should run against the local project checkout because scanners
  write user-layer artifacts under `data/`, `reports/`, `batch/`, and `web/`.
- The schedule is intended for America/New_York.
- The automation must never submit applications or click final application
  controls.
- The existing `newgrad_quick` evaluation mode is the right default for hourly
  runs.

## Implementation steps

1. Add `scripts/hourly-job-scan.mjs` and npm scripts.
   Verify: command help/dry run and syntax checks pass.
2. Add LinkedIn default search URL if missing.
   Verify: LinkedIn scanner can resolve a URL from profile config.
3. Add Codex Automation setup documentation.
   Verify: docs link from `docs/CODEX.md` and include local-project setup,
   schedule, prompt, safety boundaries, recovery commands, and tuning knobs.
4. Run targeted verification.
   Verify: dry-run command can start, apply the time-window override, and write
   an automation summary without full live evaluations.
5. Make bridge startup sandbox-safe.
   Verify: when no bridge is reachable and auto-start is disabled, the command
   continues in preview mode and writes a summary instead of failing before
   source scans start.
6. Narrow LinkedIn automation freshness.
   Verify: hourly automation passes a LinkedIn URL with `f_TPR=r4000` by
   default while preserving the profile URL as the base query.
7. Fix retry blockers from the bridge-enabled catch-up run.
   Verify: top-level bridge probe waits for a just-started real/codex bridge,
   and Indeed command construction omits empty `--location`.
8. Preserve the user-selected Indeed search filters for scheduled scans.
   Verify: hourly automation builds the Indeed command with `--url` from
   profile config or `CAREER_OPS_INDEED_URL`.

## Verification approach

- `node --check scripts/hourly-job-scan.mjs`
- `npm run auto:hourly-scan:dry` with `CAREER_OPS_SCAN_IGNORE_WINDOW=1` and a
  narrow source list if live browser state allows it.
- `npm run verify` if targeted checks do not expose environment blockers.
- `CAREER_OPS_SCAN_IGNORE_WINDOW=1 CAREER_OPS_SCAN_SOURCES= npm run
  auto:hourly-scan` to verify the no-bridge preview fallback without running
  live source scans.

## Progress log

- 2026-04-25: Created plan after reading `CLAUDE.md`, `docs/CODEX.md`,
  `package.json`, profile config, portals config, and scanner docs/options.
- 2026-04-25: Added `scripts/hourly-job-scan.mjs`, npm automation scripts,
  LinkedIn profile default URL, and Codex Automation setup documentation.
- 2026-04-25: Verified `node --check scripts/hourly-job-scan.mjs`,
  `package.json` JSON parsing, `git diff --check` for changed files, and a
  no-source dry automation run with `CAREER_OPS_SCAN_IGNORE_WINDOW=1`.
- 2026-04-25: Ran `npm run verify`; it passed with existing duplicate warnings
  for RemoteHunter and Anduril rows.
- 2026-04-25: Automation run `npm run auto:hourly-scan` did not reach source
  execution because local sandbox permissions blocked bridge startup. `tsx`
  failed to listen on its IPC pipe, and direct compiled bridge startup failed to
  listen on `127.0.0.1:47319`. Recorded the blocked run in
  `data/automation/hourly-scan-2026-04-25T02-08-17Z-blocked.md`.
- 2026-04-25: Updated `scripts/hourly-job-scan.mjs` so automation no longer
  tries to start the bridge by default. It now reuses an existing real/codex
  bridge when available and otherwise runs read-only preview commands, recording
  the bridge recovery command in the summary. Automatic startup remains
  available with `CAREER_OPS_SCAN_START_BRIDGE=1`; hard failure remains
  available with `CAREER_OPS_SCAN_REQUIRE_BRIDGE=1`.
- 2026-04-25: Verified the no-bridge fallback with
  `CAREER_OPS_BRIDGE_PORT=9 CAREER_OPS_SCAN_IGNORE_WINDOW=1
  CAREER_OPS_SCAN_SOURCES= npm run auto:hourly-scan`; it exited successfully,
  wrote a summary with `bridge_unavailable_preview`, and did not try to listen
  on localhost. Removed the temporary verification summary afterward.
- 2026-04-25: Ran `npm run verify`; it passed with the existing duplicate
  warnings for RemoteHunter and Anduril rows.
- 2026-04-25: Updated hourly automation so LinkedIn scans derive their base URL
  from `config/profile.yml -> linkedin_scan.search_url` or
  `CAREER_OPS_LINKEDIN_URL`, then replace `f_TPR` with
  `CAREER_OPS_LINKEDIN_POSTED_WITHIN` defaulting to `r4000`. This keeps hourly
  LinkedIn scans focused on the newest roughly last-hour postings while manual
  LinkedIn scans can still use the profile URL directly.
- 2026-04-25: Verified the LinkedIn URL transform with a Node YAML parse check;
  generated automation URL had `f_TPR=r4000`. Also reran `node --check
  scripts/hourly-job-scan.mjs`, `git diff --check`, and `npm run verify`.
- 2026-04-25 03:25Z: Ran `npm run auto:hourly-scan` from the local checkout for
  the job-search automation. The command exited before source execution because
  it was outside the configured America/New_York schedule window, so no sources
  ran, no evaluations completed, and no new `data/automation` summary was
  written. Manual catch-up command: `CAREER_OPS_SCAN_IGNORE_WINDOW=1 npm run
  auto:hourly-scan`.
- 2026-04-25 03:47Z: Ran the requested test catch-up with
  `CAREER_OPS_SCAN_IGNORE_WINDOW=1 npm run auto:hourly-scan`. The sandbox run
  wrote `data/automation/hourly-scan-2026-04-25T03-46-15-821Z.md` but hit DNS
  failures and `tsx` IPC `EPERM`, so the command was rerun with approved
  unsandboxed execution. The unsandboxed run wrote
  `data/automation/hourly-scan-2026-04-25T03-46-46-635Z.md`, ran requested
  sources `scan`, `newgrad`, `builtin`, `linkedin`, and `indeed`, and completed
  0 evaluations because no real/codex bridge was reachable. Direct scan ran in
  read-only preview mode and found 9 newest candidate roles, but did not write
  them or queue evaluations. Blockers: bridge unavailable
  (`npm run ext:bridge`), Built In browser daemon Chrome/CDP disconnected
  (`bb-browser daemon shutdown && bb-browser tab list`), Newgrad and LinkedIn
  failed bridge health checks with `fetch failed`, Indeed failed with
  `missing value for --location`, and Pallet returned HTTP 404 in direct scan.
- 2026-04-25 03:50Z: After the user started the bridge, reran
  `CAREER_OPS_SCAN_IGNORE_WINDOW=1 npm run auto:hourly-scan` with approved
  unsandboxed execution. The run wrote
  `data/automation/hourly-scan-2026-04-25T03-50-10-526Z.md`. The top-level
  orchestration bridge probe still reported `bridge_unavailable_preview`, so
  direct scan stayed dry-run and no evaluations were queued. Source status:
  `scan` ok, `newgrad` ok, `builtin` failed, `linkedin` failed, `indeed`
  failed. Newgrad scanner itself reported `Bridge health: ok`, read 50 JobRight
  API rows within 24h, promoted 19, filtered 31, and wrote
  `data/scan-runs/newgrad-20260425T034956Z-66083039-summary.json`. Completed
  evaluations remained 0. Remaining blockers: browser daemon Chrome/CDP
  disconnected for Built In and LinkedIn (`bb-browser daemon shutdown &&
  bb-browser tab list`), Indeed still passes an empty `--location`, and Pallet
  still returns HTTP 404.
- 2026-04-25: Confirmed the current bridge health payload is
  `execution.mode=real` and `execution.realExecutor=codex`. Updated the
  orchestrator to poll briefly for a just-started bridge before preview
  fallback, and to omit the Indeed `--location` option when
  `CAREER_OPS_INDEED_LOCATION` is empty.
- 2026-04-25 04:20Z: Restarted the bb-browser daemon with
  `bb-browser daemon shutdown` and verified Chrome/CDP recovery with
  `bb-browser tab list`. Ran a full catch-up using
  `CAREER_OPS_SCAN_IGNORE_WINDOW=1 npm run auto:hourly-scan` in the approved
  local environment. The orchestrator detected the existing real/codex bridge,
  ran all sources, wrote
  `data/automation/hourly-scan-2026-04-25T04-19-55-048Z.md`, and completed 6
  evaluations: 3 from direct scan, 1 from newgrad, and 2 from LinkedIn. High
  results were Uber Graduate 2026 Software Engineer I Mobile iOS at 4.55/5 and
  Jobright.ai AI Engineer Entry Level at 4.3/5. Built In still failed with
  truncated bb-browser JSON, one LinkedIn candidate failed `/v1/evaluate` with
  invalid envelope, and direct scan still had Pallet HTTP 404. Indeed no longer
  failed on empty `--location`; it ran and skipped two candidates for
  `salary_below_minimum`.
- 2026-04-25: The full run exposed a tracker table break from a LinkedIn title
  containing `|`. Repaired `data/applications.md` row #358 for Loop, added a
  `merge-tracker.mjs` cell sanitizer, and added a bridge merge-tracker test for
  pipe-containing role titles. `npm run verify` passed afterward with only the
  existing RemoteHunter and Anduril duplicate warnings.
- 2026-04-25: Updated the hourly orchestrator so Indeed scans prefer a full
  search URL from `CAREER_OPS_INDEED_URL` or
  `config/profile.yml -> indeed_scan.search_url`. Added the user's entry-level
  Indeed URL to profile config so the scheduled run preserves the `sc=` filter
  instead of rebuilding a plain query/location search.
- 2026-04-25: Verified the Indeed URL change with `node --check
  scripts/hourly-job-scan.mjs`, `git diff --check` for touched files, a Node
  YAML parse check showing `q=software engineer, AI engineer`, empty `l=`, and
  `sc=0kf:explvl(ENTRY_LEVEL);`, plus a score-only Indeed smoke test. The smoke
  test parsed 16 rows from the supplied URL, kept 5 under the test limit,
  promoted 1, filtered 4, and called no bridge write endpoints.
- 2026-04-27 08:02Z: Ran `npm run auto:hourly-scan` from the local checkout for
  the job-search automation. The plain command exited at the schedule guard
  because it was outside the America/New_York window, so reran
  `CAREER_OPS_SCAN_IGNORE_WINDOW=1 npm run auto:hourly-scan` to exercise the
  requested scan path. The run wrote
  `data/automation/hourly-scan-2026-04-27T08-02-15-633Z.md`, attempted `scan`,
  `newgrad`, `builtin`, `linkedin`, and `indeed`, and completed 0 evaluations.
  Bridge was unavailable, so writes/evaluations were disabled with recovery
  `npm run ext:bridge`; API/Built In fetches failed on DNS `ENOTFOUND`, and
  browser-backed `tsx` scanners failed with `listen EPERM` in this sandbox.
- 2026-04-27 10:03Z: Ran `npm run auto:hourly-scan` from the local checkout for
  the job-search automation. The plain command exited at the schedule guard
  because it was outside the America/New_York window, so reran
  `CAREER_OPS_SCAN_IGNORE_WINDOW=1 npm run auto:hourly-scan`. The catch-up run
  wrote `data/automation/hourly-scan-2026-04-27T10-03-07-150Z.md`, requested
  `scan`, `newgrad`, `builtin`, `linkedin`, and `indeed`, and completed 0
  evaluations. Bridge was unavailable, so writes/evaluations were disabled with
  recovery `npm run ext:bridge`; direct scan ran in dry-run preview mode and
  hit DNS `ENOTFOUND` for Ashby/Greenhouse/Built In hosts; `newgrad`,
  `builtin`, `linkedin`, and `indeed` failed before scanning because `tsx`
  could not create its local IPC pipe in the sandbox (`listen EPERM`).
- 2026-04-27 11:03Z: Ran `npm run auto:hourly-scan` from the local checkout for
  the job-search automation. The plain command exited at the schedule guard
  because it was 07:03 America/New_York, so reran
  `CAREER_OPS_SCAN_IGNORE_WINDOW=1 npm run auto:hourly-scan`. The catch-up run
  wrote `data/automation/hourly-scan-2026-04-27T11-03-16-362Z.md`, requested
  `scan`, `newgrad`, `builtin`, `linkedin`, and `indeed`, and completed 0
  evaluations. Bridge was unavailable, so writes/evaluations were disabled with
  recovery `npm run ext:bridge`; direct scan ran in dry-run preview mode and
  hit DNS `ENOTFOUND` for Ashby/Greenhouse/Built In hosts; `newgrad`,
  `builtin`, `linkedin`, and `indeed` failed before scanning because `tsx`
  could not create its local IPC pipe in the sandbox (`listen EPERM`). Ran
  `npm run dashboard:build` afterward to refresh `web/index.html`; it wrote the
  dashboard with 365 reports, 256 applications, 551 pipeline rows, and 1368
  scan-history rows.
- 2026-04-27 12:02Z: Ran `npm run auto:hourly-scan` from the local checkout for
  the job-search automation. The run was inside the configured weekday window,
  wrote `data/automation/hourly-scan-2026-04-27T12-02-38-323Z.md`, requested
  `scan`, `newgrad`, `builtin`, `linkedin`, and `indeed`, and completed 0
  evaluations. Bridge was unavailable, so writes/evaluations were disabled with
  recovery `npm run ext:bridge`; direct scan ran in dry-run preview mode and
  hit DNS `ENOTFOUND` for Ashby/Greenhouse/Built In hosts; `newgrad`,
  `builtin`, `linkedin`, and `indeed` failed before scanning because `tsx`
  could not create its local IPC pipe in the sandbox (`listen EPERM`). Ran
  `npm run dashboard:build` afterward to refresh `web/index.html`; it wrote the
  dashboard with 365 reports, 256 applications, 551 pipeline rows, and 1368
  scan-history rows.
- 2026-04-27 13:02Z: Ran `npm run auto:hourly-scan` from the local checkout for
  the job-search automation. The run was inside the configured weekday window,
  wrote `data/automation/hourly-scan-2026-04-27T13-02-46-179Z.md`, requested
  `scan`, `newgrad`, `builtin`, `linkedin`, and `indeed`, and completed 0
  evaluations. Bridge was unavailable, so writes/evaluations were disabled with
  recovery `npm run ext:bridge`; direct scan ran in dry-run preview mode and
  hit DNS `ENOTFOUND` for Ashby/Greenhouse/Built In hosts; `newgrad`,
  `builtin`, `linkedin`, and `indeed` failed before scanning because `tsx`
  could not create its local IPC pipe in the sandbox (`listen EPERM`). Ran
  `npm run dashboard:build` afterward to refresh `web/index.html`; it wrote the
  dashboard with 365 reports, 256 applications, 551 pipeline rows, and 1368
  scan-history rows.
- 2026-04-27 14:02Z: Ran `npm run auto:hourly-scan` from the local checkout for
  the job-search automation. The run was inside the configured weekday window,
  wrote `data/automation/hourly-scan-2026-04-27T14-02-08-657Z.md`, requested
  `scan`, `newgrad`, `builtin`, `linkedin`, and `indeed`, and completed 0
  evaluations. Bridge was unavailable, so writes/evaluations were disabled with
  recovery `npm run ext:bridge`; direct scan ran in dry-run preview mode and
  hit DNS `ENOTFOUND` for Ashby/Greenhouse/Built In hosts; `newgrad`,
  `builtin`, `linkedin`, and `indeed` failed before scanning because `tsx`
  could not create its local IPC pipe in the sandbox (`listen EPERM`). Ran
  `npm run dashboard:build` afterward to refresh `web/index.html`; it wrote the
  dashboard with 365 reports, 256 applications, 551 pipeline rows, and 1368
  scan-history rows.
- 2026-04-27 15:01Z: Ran `npm run auto:hourly-scan` from the local checkout for
  the job-search automation. The run was inside the configured weekday window,
  wrote `data/automation/hourly-scan-2026-04-27T15-01-09-672Z.md`, requested
  `scan`, `newgrad`, `builtin`, `linkedin`, and `indeed`, and completed 0
  evaluations. Bridge was unavailable, so writes/evaluations were disabled with
  recovery `npm run ext:bridge`; direct scan ran in dry-run preview mode and
  hit DNS `ENOTFOUND` for Ashby/Greenhouse/Built In hosts; `newgrad`,
  `builtin`, `linkedin`, and `indeed` failed before scanning because `tsx`
  could not create its local IPC pipe in the sandbox (`listen EPERM`). Ran
  `npm run dashboard:build` afterward to refresh `web/index.html`; it wrote the
  dashboard with 365 reports, 256 applications, 551 pipeline rows, and 1368
  scan-history rows.
- 2026-04-27 16:02Z: Ran `npm run auto:hourly-scan` from the local checkout for
  the job-search automation. The run was inside the configured weekday window,
  wrote `data/automation/hourly-scan-2026-04-27T16-02-49-713Z.md`, requested
  `scan`, `newgrad`, `builtin`, `linkedin`, and `indeed`, and completed 0
  evaluations. Bridge was unavailable, so writes/evaluations were disabled with
  recovery `npm run ext:bridge`; direct scan ran in dry-run preview mode and
  hit DNS `ENOTFOUND` for Ashby/Greenhouse/Built In hosts; `newgrad`,
  `builtin`, `linkedin`, and `indeed` failed before scanning because `tsx`
  could not create its local IPC pipe in the sandbox (`listen EPERM`). Ran
  `npm run dashboard:build` afterward to refresh `web/index.html`; it wrote the
  dashboard with 365 reports, 256 applications, 551 pipeline rows, and 1368
  scan-history rows.
- 2026-04-27 16:29Z: Starting another scheduled job-search automation run from
  the local checkout. Goal: run `npm run auto:hourly-scan`, scan configured
  sources read-only with respect to applications, use existing pipeline
  enrichment/evaluation paths when available, rebuild/report via the checked-in
  automation, then record sources, completed evaluations, blockers, high-fit
  roles, and the `data/automation` summary path. Success criteria: command
  exits or reports a concrete blocker, no Apply/Easy Apply/Save/job-alert/
  resume-upload/final-submit controls are used, the summary artifact is
  inspected, and this plan records the outcome. Assumptions: preserve unrelated
  dirty worktree changes and do not bypass login/checkpoint/verification
  blockers. Uncertainties: bridge availability, DNS/network availability, and
  sandbox IPC behavior may match prior failed hourly runs.
- 2026-04-27 16:30Z: Ran `npm run auto:hourly-scan` from the local checkout.
  The run wrote
  `data/automation/hourly-scan-2026-04-27T16-30-21-960Z.md`, requested `scan`,
  `newgrad`, `builtin`, `linkedin`, and `indeed`, and completed 0 evaluations.
  Bridge was unavailable, so writes/evaluations were disabled with recovery
  `npm run ext:bridge`; direct scan ran in dry-run preview mode and hit DNS
  `ENOTFOUND` for Ashby/Greenhouse/Built In hosts; `newgrad`, `builtin`,
  `linkedin`, and `indeed` failed before scanning because `tsx` could not
  create its local IPC pipe in the sandbox (`listen EPERM`). No login,
  checkpoint, rate-limit, verification, or parsing blocker was detected in the
  captured output tails, and no high-fit roles were found. Ran
  `npm run dashboard:build` afterward to refresh `web/index.html`; it wrote the
  dashboard with 365 reports, 256 applications, 551 pipeline rows, and 1368
  scan-history rows.
- 2026-04-27 16:38Z: After the user started `npm run ext:bridge`, checked
  bridge reachability from the Codex sandbox. Unauthenticated `curl` could
  receive a 401 from `127.0.0.1:47319`, but Node `fetch` failed with
  `connect EPERM 127.0.0.1:47319`, and sending the real
  `bridge/.bridge-token` through curl was also blocked. Conclusion: opening
  the bridge is necessary but not sufficient for sandboxed automation; live
  write/evaluation runs must execute outside the restricted sandbox or they
  will still report `bridge_unavailable_preview`.
- 2026-04-27 16:43Z: Reran `npm run auto:hourly-scan` outside the sandbox with
  the existing real/codex bridge. The run wrote
  `data/automation/hourly-scan-2026-04-27T16-43-09-948Z.md`, detected
  `existing_real_codex`, added 30 direct-scan offers, completed 3 evaluations,
  and rebuilt the dashboard with 368 reports, 257 applications, 581 pipeline
  rows, and 1410 scan-history rows. Newgrad also reached JobRight and enriched
  10 promoted rows, but all 10 were skipped by existing value/dedupe rules.
  Built In, LinkedIn, and Indeed then failed because `bb-browser` Chrome/CDP was
  disconnected, with recovery `bb-browser daemon shutdown && bb-browser tab
  list`.
- 2026-04-27 16:56Z: Restarted `bb-browser` with `bb-browser daemon shutdown`
  and `bb-browser tab list`, then reran only
  `CAREER_OPS_SCAN_SOURCES=builtin,linkedin,indeed npm run auto:hourly-scan`
  outside the sandbox. The run wrote
  `data/automation/hourly-scan-2026-04-27T16-56-08-591Z.md`; Built In parsed 2
  rows and promoted 0, LinkedIn parsed 74 raw / 71 unique rows, promoted 55,
  added 6 pipeline candidates, and completed 3 evaluations, and Indeed parsed
  16 rows, promoted 2, enriched 2, and skipped both by value/experience rules.
  High-fit evaluations from the LinkedIn run were Jobs via Dice Jr Gen-AI
  Engineer at 4.2/5 and Adobe Machine Learning Engineer at 4.4/5. Verification
  passed with the existing RemoteHunter and Anduril duplicate warnings, and
  the dashboard rebuilt with 371 reports, 260 applications, 587 pipeline rows,
  and 1414 scan-history rows.
- 2026-04-27: Tightened hourly summary blocker detection so successful sources
  are not reported as blockers merely because their output contains `parsed=`.
  Added explicit Chrome/CDP recovery mapping to
  `bb-browser daemon shutdown && bb-browser tab list`.
- 2026-04-27: Updated the active Codex Automation `job-search` prompt and
  `docs/codex-hourly-scan-automation.md` so hourly runs request approved
  non-sandbox/local command execution when needed. The prompt now explicitly
  treats `connect EPERM`, `listen EPERM`, and `tsx` IPC pipe failures as
  sandbox execution failures requiring one non-sandbox rerun before reporting,
  and it reports browser/CDP, bridge, DNS, and sandbox blockers separately.
- 2026-04-27: A later automation run still reported
  `approval_policy=never`, so prompt-only non-sandbox escalation cannot work in
  Codex cron. Re-scoped Codex Automation to reporting only and added host-side
  launchd scripts: `scripts/run-hourly-scan-host.zsh` for the real scan and
  `scripts/install-hourly-scan-launchd.zsh` to install
  `com.career-ops.hourly-scan`. Updated `docs/codex-hourly-scan-automation.md`
  so live scanning is owned by launchd while Codex cron inspects the newest
  `data/automation/hourly-scan-*.md` summary afterward.
- 2026-04-27: Installed `com.career-ops.hourly-scan` under the user launchd
  domain and verified it can run `npm run auto:hourly-scan` outside the Codex
  sandbox. The first launchd run detected `existing_real_codex`, completed 2
  direct-scan evaluations, ran Newgrad through enrichment, and rebuilt the
  dashboard. Built In, LinkedIn, and Indeed failed because launchd did not
  include `/Users/hongxichen/.npm-global/bin` in PATH for `bb-browser`; updated
  the launchd installer and host runner PATH and added an explicit
  `spawn bb-browser ENOENT` blocker classification.
- 2026-04-27: Reinstalled and verified launchd after adding
  `/Users/hongxichen/.npm-global/bin` to PATH. The successful host-side run
  wrote `data/automation/hourly-scan-2026-04-27T17-32-54-871Z.md`, detected
  `existing_real_codex`, ran `scan`, `newgrad`, `builtin`, `linkedin`, and
  `indeed` without sandbox/bridge/tsx/DNS blockers, completed 3 LinkedIn
  evaluations, rebuilt the dashboard with 376 reports, 264 applications, 593
  pipeline rows, and 1416 scan-history rows, and left only existing duplicate
  warnings in `npm run verify`.
- 2026-04-27: Changed hourly scan defaults so `CAREER_OPS_SCAN_EVALUATE_LIMIT`
  and `CAREER_OPS_SCAN_ENRICH_LIMIT` are optional caps instead of built-in
  defaults. When unset, the orchestrator no longer passes `--evaluate-limit` or
  `--enrich-limit`, so scanner defaults remain uncapped. Updated
  `docs/codex-hourly-scan-automation.md` to document the uncapped default.
- 2026-04-27: Investigated a `0` evaluation hourly summary. The run did scan
  sources successfully, but all enriched candidates were duplicates or skipped
  before evaluation (`already_evaluated_report`, sponsorship, site-match,
  clearance, or experience filters). Re-applied the Codex Automation prompt as
  a reporting-only summary task because the app automation had drifted back to a
  long embedded setup document with stale cap examples.

## Key decisions

- Use a single local orchestration command instead of putting multi-step logic
  in the Codex Automation prompt.
- Keep the script configurable through environment variables so the automation
  can be tuned without adding more scripts.
- Do not start a local listening bridge from Codex Automation by default. The
  automation sandbox can reject `listen()` with `EPERM`, so scheduled runs
  should either reuse an already-running bridge or fall back to preview mode.
- A bridge running in a normal terminal does not guarantee sandboxed Codex
  automation can use it: the sandbox can also reject Node `connect()` calls to
  `127.0.0.1:47319`. Full live runs need an approved/non-sandbox execution
  path.
- The Codex Automation prompt should request non-sandbox/local command
  execution for `npm run auto:hourly-scan` and classify sandbox `EPERM` errors
  separately from bridge/login/parser blockers.
- Codex cron cannot perform the live scan when its run context has
  `approval_policy=never`; use host launchd for the real command and keep Codex
  Automation as a summary/notification layer.
- Wait up to `CAREER_OPS_SCAN_BRIDGE_WAIT_MS` for bridge readiness so a bridge
  started immediately before the automation run does not cause a false preview
  fallback.
- Sanitize markdown tracker cells in `merge-tracker.mjs` because generated TSV
  fields can legitimately contain `|` from job-board titles.
- Keep LinkedIn automation freshness narrower than the manual profile default:
  use `f_TPR=r4000` for scheduled hourly runs instead of the broader
  `f_TPR=r86400` 24-hour window.
- Keep user-selected Indeed filters as a full URL in profile config, because
  query/location reconstruction drops SERP filters such as entry-level `sc=`.
- Keep hourly enrichment/evaluation uncapped by default; use
  `CAREER_OPS_SCAN_ENRICH_LIMIT` and `CAREER_OPS_SCAN_EVALUATE_LIMIT` only as
  explicit operator caps.
- Keep Codex App Automation as a concise reporting layer. The prompt should not
  embed the full setup guide or stale tuning examples, because host launchd owns
  the live scan.

## Risks and blockers

- LinkedIn, Indeed, or Jobright may require manual login/checkpoint recovery.
- Real Codex bridge mode depends on the local `codex` CLI and bridge
  dependencies being available.
- Full live verification may be expensive or slow because it can queue
  evaluations.
- Codex sandbox environments that disallow local listening sockets cannot start
  the real/codex bridge. In that case the automation will run preview scans
  only. Recovery for full evaluations is to keep `npm run ext:bridge` running
  from a normal local terminal before the scheduled run.
- Built In and external ATS detail reads can still return truncated JSON from
  bb-browser when page text/output is large; this remains the next reliability
  gap.
- One LinkedIn candidate failed evaluation queueing with `BAD_REQUEST invalid
  envelope`; inspect the candidate payload before relying on fully unattended
  LinkedIn evaluation for all promoted rows.

## Final outcome

Implemented. The automation command is `npm run auto:hourly-scan`, with
`npm run auto:hourly-scan:dry` available for explicit preview runs. Codex App
setup steps are documented in `docs/codex-hourly-scan-automation.md`. Missing
bridge now degrades to preview mode instead of blocking all source scans.
