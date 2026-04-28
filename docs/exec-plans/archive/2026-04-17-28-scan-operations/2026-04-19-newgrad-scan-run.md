# Newgrad Scan Run

## Background

The `/career-ops newgrad-scan` mode uses the Chrome extension and local bridge to extract listings from `newgrad-jobs.com`, score them with `config/profile.yml -> newgrad_scan`, enrich strong matches, and write survivors to `data/pipeline.md`.

## Goal

Make `/career-ops newgrad-scan` actionable without requiring the user to manually drive Chrome: open the source page, scan, enrich, and write qualifying results through the existing bridge pipeline.

## Scope

- Check required career-ops setup files.
- Check the update status as required by `CLAUDE.md`.
- Verify whether the local bridge is reachable.
- Start the bridge if it is not running.
- Refresh the extension build if needed.
- Add an autonomous browser-driven scan path that reuses the existing content extractors and bridge endpoints.
- Run the autonomous scan once.

## Assumptions

- The current dirty worktree contains user or prior-session changes and must not be reverted.
- The existing `extension/src/content/extract-newgrad.ts` extractor functions are the source of truth for DOM parsing.
- Bridge scoring/enrichment endpoints remain the source of truth for filtering, de-dupe, JD cache writes, and `data/pipeline.md` updates.

## Implementation Steps

1. Read router and mode instructions.
   Verify: `CLAUDE.md`, `.claude/skills/career-ops/SKILL.md`, `modes/_shared.md`, and `modes/newgrad-scan.md` identify the expected flow.
2. Check setup and bridge health.
   Verify: required setup files exist; `/v1/health` status is known.
3. Start the bridge if needed.
   Verify: authenticated `/v1/health` returns success.
4. Refresh the extension build.
   Verify: `npm run ext:build` succeeds.
5. Add an autonomous scan script.
   Verify: script compiles and calls the same extractor plus bridge endpoint contracts.
6. Run the autonomous scan.
   Verify: command opens the source page, extracts rows, scores rows, enriches promoted rows, and reports added/skipped counts.

## Verification Approach

- `node update-system.mjs check`
- File existence checks for `cv.md`, `config/profile.yml`, `modes/_profile.md`, and `portals.yml`
- Authenticated curl to `http://127.0.0.1:47319/v1/health`
- `npm run ext:build`
- `node --check` or TypeScript execution smoke check for the autonomous script
- Autonomous scan run result

## Progress Log

- 2026-04-19: User invoked `/career-ops newgrad-scan`.
- 2026-04-19: Update check returned offline with local version `1.3.0`; repo setup files are present.
- 2026-04-19: Initial bridge health check found no listener on `127.0.0.1:47319`.
- 2026-04-19: Started the bridge with `npm run ext:bridge`; it is listening on `127.0.0.1:47319` in real Codex executor mode.
- 2026-04-19: Authenticated health check passed after rerunning outside the sandbox because local loopback requests were blocked by sandbox networking.
- 2026-04-19: Rebuilt the Chrome extension successfully with `npm run ext:build`; output refreshed under gitignored `extension/dist/`.
- 2026-04-19: Re-ran authenticated bridge health successfully after the extension build.
- 2026-04-19: User requested that the agent open the scan source and perform scan/enrich without manual browser work.
- 2026-04-19: Root cause: `modes/newgrad-scan.md` only describes a manual extension workflow even though existing extractors and bridge endpoints can support an autonomous browser-driven CLI flow.
- 2026-04-19: Added `scripts/newgrad-scan-autonomous.ts` and wired `npm run newgrad-scan`.
- 2026-04-19: First autonomous browser run extracted 85 rows, promoted 14, enriched 14, and exposed a URL-quality bug where company homepages could be chosen over concrete job URLs.
- 2026-04-19: Tightened bridge URL scoring so bare company homepages do not beat Jobright detail URLs, and added a regression test.
- 2026-04-19: Second autonomous run exposed auth/analytics URL capture from Google One Tap during apply probing.
- 2026-04-19: Tightened bridge and probe URL scoring to treat `accounts.google.com` as noise and require generic external URLs to carry job/apply/careers signals before outranking Jobright.
- 2026-04-19: Removed bad homepage/auth-log pipeline entries and their generated JD cache files.
- 2026-04-19: Final autonomous run extracted 78 rows, promoted 13, enriched 13, added 2 pipeline entries, skipped 11, and wrote concrete Jobright job URLs for Goldman Sachs and Twitch.
- 2026-04-20: User invoked `/career-ops newgrad-scan`; bridge was not running, so started `npm run ext:bridge`.
- 2026-04-20: Autonomous run extracted 108 rows, promoted 34, enriched 34, added 3 pipeline entries, and skipped 31.
- 2026-04-20: Added pipeline entries for The Baldwin Group, Geneva Trading, and Klaviyo with Jobright job URLs and local JD cache files.
- 2026-04-20: Confirmed no `accounts.google.com` or bare Goldman/Twitch homepage URLs remain in `data/pipeline.md` or `jds/`.
- 2026-04-20: User asked to log into the same browser used by `/career-ops newgrad-scan`; changed the runner to use persistent profile `data/browser-profiles/newgrad-scan`.
- 2026-04-20: Opened the persistent scan profile for user login, then killed the lingering Chrome process that still held `SingletonLock` after login.
- 2026-04-20: Re-ran autonomous scan with the persistent logged-in profile: extracted 119 rows, promoted 31, enriched 31, added 0, skipped 31.
- 2026-04-20: User reported Google sign-in still rejected the browser as insecure.
- 2026-04-20: Added `npm run newgrad-scan:login` to open top-level Jobright in ordinary Google Chrome with the scanner profile, avoiding embedded newgrad-jobs login and Playwright-controlled login contexts.
- 2026-04-20: Added `data/browser-profiles/` to `.gitignore` so local Chrome profile data and cookies cannot be staged accidentally.
- 2026-04-20: After user completed login through the dedicated window, killed the lingering Chrome process holding the profile lock and reran the autonomous scan.
- 2026-04-20: Post-login retest extracted 125 rows, promoted 33, enriched 33, added 0, and skipped 33.
- 2026-04-20: Confirmed the dedicated scan profile still lacked Jobright's `SESSION_ID`; user approved importing only that Jobright cookie into the scanner profile.
- 2026-04-20: Imported `.jobright.ai` `SESSION_ID` into `data/browser-profiles/newgrad-scan` and verified the cookie name and flags without printing the value.
- 2026-04-20: Login-state retest extracted 141 rows, promoted 44, enriched 44, added 8, and skipped 36.
- 2026-04-20: Found one bad added URL, `https://jobright.ai/jobs/recommend`, for Sun West; added a URL-selection regression test and corrected the pipeline/JD URL to the concrete Jobright detail page from scanner browser history.
- 2026-04-21: User invoked `/career-ops newgrad-scan`.
- 2026-04-21: Current run goal is to execute the repo-native autonomous scan, let bridge scoring/enrichment/evaluation handle results, and verify scan outputs without touching unrelated dirty worktree changes.
- 2026-04-21: Success criteria for this run: bridge health passes, `npm run newgrad-scan` completes or reports a concrete blocker, resulting data/report/dashboard changes are identified, and targeted verification is run before reporting completion.
- 2026-04-21: Update check returned `up-to-date` at `1.3.0`; required setup files `cv.md`, `config/profile.yml`, `modes/_profile.md`, and `portals.yml` are present.
- 2026-04-21: Initial bridge health check found no listener, so started `npm run ext:bridge` in `real-codex` mode on `127.0.0.1:47319`.
- 2026-04-21: Bridge health passed with tracker, CV/profile, Codex CLI, and Playwright Chromium OK.
- 2026-04-21: Live scan extracted 213 rows, promoted 59, enriched 59, added 8 pipeline entries, and skipped 51. Skip breakdown: 4 `no_sponsorship`, 8 `site_signal_mixed`, 18 `site_match_below_bar`, 4 `already_evaluated_report`, 2 `active_clearance_required`, 14 `pipeline_threshold`, and 1 `seniority_too_high`.
- 2026-04-21: Added scan candidates for Relativity, WisdomAI, Bose Corporation, Morgan Stanley, Klaviyo, Goldman Sachs, CAI, and Bayview Asset Management.
- 2026-04-21: The scanner queued 7 direct evaluations but initially failed the Bose queue request with `BAD_REQUEST invalid envelope`; root cause was scanner structured-signal strings that could exceed bridge schema max lengths.
- 2026-04-21: The scanner process then exited nonzero while waiting for jobs because `waitForEvaluations()` polled `/v1/jobs/:id` without the required `x-career-ops-token` header.
- 2026-04-21: Fixed `scripts/newgrad-scan-autonomous.ts` so evaluation polling includes the bridge token and structured signal arrays are trimmed to bridge schema string limits before queueing.
- 2026-04-21: Manually requeued the Bose candidate with a minimal valid `newgrad_quick` evaluation payload so the rejected candidate was not lost.
- 2026-04-21: Evaluation results completed: Relativity `3.7/5` report 284, WisdomAI `4.1/5` report 285, Morgan Stanley `3.75/5` report 286, Klaviyo `4.05/5` report 287, Goldman Sachs `3.95/5` report 288, CAI `3.2/5` report 289, Bayview Asset Management `2.35/5` report 290, and Bose Corporation `4.2/5` report 291.
- 2026-04-21: Tracker rows were added for Relativity, WisdomAI, Morgan Stanley, Klaviyo, CAI, Bayview, and Bose. Goldman report 288 was generated, but tracker merge skipped the row as a duplicate of an existing Goldman Sachs application.
- 2026-04-21: Rebuilt the dashboard with `npm run dashboard`; generated `web/index.html` now reports 259 reports, 183 applications, 381 pipeline entries, and 828 scan-history rows.
- 2026-04-21: Verification passed: `npm run newgrad-scan -- --help`, script-level `tsc --noEmit` for `scripts/newgrad-scan-autonomous.ts`, `npm --prefix bridge run typecheck`, `npm --prefix bridge run test -- src/server.test.ts src/adapters/newgrad-links.test.ts src/adapters/newgrad-value-scorer.test.ts`, and `npm run verify`.
- 2026-04-22: User invoked `/career-ops newgrad-scan`.
- 2026-04-22: Current run goal is to execute the default repo-native
  autonomous newgrad scan for today's 24-hour window, including direct
  evaluations for enrich survivors unless the bridge or scanner reports a
  concrete blocker.
- 2026-04-22: Success criteria for this run: update/setup checks pass, bridge
  health passes or is started successfully, `npm run newgrad-scan` completes or
  stops with an actionable failure, resulting data/report/dashboard changes are
  inspected, targeted verification is run, and this plan records the outcome.
- 2026-04-22: Assumptions: required user setup files already present remain the
  source of truth, the existing persistent Jobright profile should be reused,
  default evaluation queueing is desired, and unrelated worktree changes must
  not be reverted.
- 2026-04-22: Update check returned `up-to-date` at `1.3.0`; required setup
  files `cv.md`, `config/profile.yml`, `modes/_profile.md`, `portals.yml`, and
  `data/applications.md` are present.
- 2026-04-22: Initial bridge health check found no listener, so started
  `npm run ext:bridge` in `real-codex` mode. Authenticated `/v1/health`
  passed with tracker, CV/profile, Codex CLI, and Playwright Chromium OK.
- 2026-04-22: `npm run newgrad-scan` used the JobRight API source and returned
  126 rows within 24 hours. It promoted 43, filtered 83, enriched all 43 detail
  pages, added 8 pipeline candidates, and skipped 35. Skip breakdown:
  14 `site_match_below_bar`, 9 `site_signal_mixed`, 8 `no_sponsorship`,
  3 `pipeline_threshold`, and 1 `active_clearance_required`.
- 2026-04-22: Added and queued direct evaluations for AppLovin, Aurora, MUFG,
  Gumloop, Axle, Amazon, AgileGrid Solutions, and Charles Schwab. The scanner's
  built-in evaluation wait completed 4 jobs and timed out on 4 still-running
  bridge jobs; manual bridge polling confirmed all 8 jobs eventually completed.
- 2026-04-22: Generated reports 298-305: AppLovin `4.2/5`, Aurora `3.95/5`,
  MUFG `4.15/5`, Gumloop `4.55/5`, Amazon Applied Scientist `4.15/5`, Axle
  `3.55/5`, AgileGrid Solutions `3.15/5`, and Charles Schwab `2.65/5`. Tracker
  rows were added or updated for all eight.
- 2026-04-22: Rebuilt the dashboard with `npm run dashboard`; generated
  `web/index.html` now reports 273 reports, 193 applications, 389 pipeline
  entries, and 929 scan-history rows.
- 2026-04-22: Verification: `npm run newgrad-scan -- --help` passed.
  `npm run verify` failed because three bridge tests exceeded Vitest's default
  5-second timeout, while tracker/status/report checks, bridge typecheck,
  extension typecheck, and extension build passed. Rerunning the failed bridge
  tests with `npm --prefix bridge run test -- --testTimeout=20000
  src/server.test.ts src/batch/batch-runner.e2e.test.ts` passed.
- 2026-04-21: `npm run verify` finished with 0 errors and 2 existing duplicate warnings: RemoteHunter Software Engineer rows and Anduril Industries Software Engineer rows.
- 2026-04-23: User invoked `/career-ops newgrad-scan`.
- 2026-04-23: Goal: execute the repo-native autonomous newgrad scan for the
  current 24-hour JobRight/newgrad window and let qualifying enrich survivors
  queue direct `newgrad_quick` evaluations.
- 2026-04-23: Success criteria: update/setup checks pass, bridge health is
  available in real Codex mode, `npm run newgrad-scan` completes or reports a
  concrete blocker, generated data/report/dashboard changes are inspected,
  targeted verification is run, and this plan records the outcome.
- 2026-04-23: Assumptions: the persistent scanner browser profile should be
  reused, default direct evaluation is desired, no application should be
  submitted, and unrelated dirty worktree changes must be preserved.
- 2026-04-23: Uncertainties: JobRight may change its API/page shape, login
  state may be stale, live evaluation jobs may outlive the scanner wait window,
  and full verification may hit the known bridge test timeout issue.
- 2026-04-23: Simplest viable path: use existing `npm run newgrad-scan`
  without code changes, start the bridge only if health is unavailable, rebuild
  the dashboard after completed evaluations, then run focused verification.
- 2026-04-23: Update check returned `up-to-date` at `1.3.0`; required setup
  files `cv.md`, `config/profile.yml`, `modes/_profile.md`, `portals.yml`, and
  `data/applications.md` are present. `npm run newgrad-scan -- --help` passed.
- 2026-04-23: Initial authenticated bridge health check failed, so started
  `npm run ext:bridge` in `real-codex` mode. `/v1/health` then passed with
  tracker, CV/profile, Codex CLI, and Playwright Chromium OK.
- 2026-04-23: `npm run newgrad-scan` first attempted Google Chrome with the
  persistent scanner profile, hit `Browser window not found`, and automatically
  fell back to bundled Playwright Chromium. The scan continued successfully.
- 2026-04-23: The JobRight API list source returned 184 rows within 24 hours.
  The scanner promoted 61, filtered 123, enriched all 61 detail pages, added 5
  pipeline candidates, and skipped 56. Skip breakdown:
  26 `site_match_below_bar`, 12 `site_signal_mixed`, 7 `no_sponsorship`,
  7 `pipeline_threshold`, 2 `seniority_too_high`, 1 `already_evaluated_report`,
  and 1 `detail_value_threshold`.
- 2026-04-23: Added and queued direct evaluations for BillGO, LendingClub,
  Nextdoor, Salesforce, and IXL Learning. All 5 evaluations completed with no
  queue failures or timeouts, and all 5 tracker merges returned true.
- 2026-04-23: Generated reports 310-314: LendingClub `3.85/5`, BillGO
  `4.1/5`, Salesforce `4.35/5`, Nextdoor `4.2/5`, and IXL Learning `3.8/5`.
- 2026-04-23: Rebuilt the dashboard with `npm run dashboard`; generated
  `web/index.html` now reports 282 reports, 202 applications, 394 pipeline
  rows, and 1010 scan-history rows.
- 2026-04-23: Verification passed: `npm run newgrad-scan -- --help` passed, and
  `npm run verify` completed with 0 errors and 2 existing duplicate warnings
  for RemoteHunter Software Engineer and Anduril Industries Software Engineer
  tracker rows.
- 2026-04-23: User asked whether `newgrad-scan` enrichment has the same
  inaccurate `pageText` problem just fixed for LinkedIn. Goal: trace the
  newgrad/JobRight enrich path from detail extraction through bridge pipeline
  write and direct `newgrad_quick` evaluation input. Success criteria: identify
  whether JobRight/newgrad detail extraction can send shell/list text as a JD
  excerpt, add a focused guard or regression test only if the issue is present,
  run targeted verification, and record any remaining risk. Assumptions: use
  repository code and local scanner artifacts as the source of truth; do not
  submit applications. Uncertainties: whether the CLI path, extension panel
  path, local JD cache backfill, or direct pending evaluation path is the weak
  point. Simplest viable path: inspect `extractNewGradDetail`,
  `scripts/newgrad-scan-autonomous.ts`, `extension/src/background/index.ts`,
  and `bridge/src/adapters/claude-pipeline.ts`, then build a minimal
  reproduction if broad selectors or low-quality descriptions can reach
  `Description excerpt`.
- 2026-04-23: The issue exists in `newgrad-scan` enrichment, but in a narrower
  form than LinkedIn. Recent JobRight `jds/` cache samples showed good
  structured Requirements and Responsibilities from embedded JobRight data, but
  `detail.description` was often just the page-shell line `Represents the skills
  you have`; `detail.salaryRange` could also be polluted with
  `Turbo for Students: Get Hired Faster!`. That means quick evaluation usually
  still had enough structured JD signal to score, but `Description excerpt` and
  salary could be misleading.
- 2026-04-23: Implemented a scoped fix. `extractNewGradDetail` now rejects the
  known low-value JobRight shell description, composes a fallback description
  from structured requirements/responsibilities when needed, and only accepts
  salary text that looks like an actual pay range. The extension panel enrich
  path now normalizes returned `NewGradDetail` objects the same way, covering
  its older inlined extractor. The quick-evaluation prompt sanitizer also strips
  stale low-value JobRight `Description excerpt` blocks and the fake Turbo
  salary line, so old cache/pending rows do not keep polluting model input.
- 2026-04-23: Minimal reproduction passed. A synthetic JobRight detail page with
  `class="description">Represents the skills you have</div>`, fake Turbo salary,
  and embedded JobRight requirements/responsibilities now extracts an empty
  salary and a structured description:
  `Requirements` with Java/Python/TypeScript and REST/cloud requirements plus
  `Responsibilities` with API/AI-service work.
- 2026-04-23: Verification passed: `npm --prefix extension run typecheck`,
  `npm --prefix bridge run test -- src/adapters/claude-pipeline.test.ts`,
  `npm --prefix bridge run typecheck`, `npm run newgrad-scan -- --help`,
  `npm run ext:build`, script-level TypeScript check for
  `scripts/newgrad-scan-autonomous.ts`, `git diff --check`, and
  `npm run verify`. Full verify completed with 0 errors and the same 2 existing
  duplicate warnings for RemoteHunter Software Engineer and Anduril Industries
  Software Engineer tracker rows.
- 2026-04-23: User asked to run the full `/career-ops newgrad-scan` flow again
  and carefully inspect whether text extraction or enrich has issues. Goal:
  execute the repo-native full scan/enrich/direct-evaluation path, then inspect
  the generated JD cache, pipeline/evaluation candidates, and reports for
  low-value description excerpts, fake salary text, list/shell text being
  treated as JD content, URL mis-selection, and missing structured
  requirements/responsibilities. Success criteria: update/setup checks pass,
  bridge health is available in real Codex mode, `npm run newgrad-scan`
  completes or reports a concrete blocker, new artifacts are identified and
  sampled, targeted verification runs, and this plan records the outcome.
  Assumptions: full direct evaluation is intended, the persistent scanner
  browser profile should be reused, no application should be submitted, and
  unrelated worktree changes must be preserved. Uncertainties: JobRight may
  change its live API/page shape, login state may be stale, and direct
  evaluation jobs may exceed the scanner wait window. Simplest viable path:
  use existing `npm run newgrad-scan`, start the bridge only if needed, compare
  before/after repo artifacts, inspect representative JD/report text, then run
  focused verification.
- 2026-04-23: Update check returned `up-to-date`; required setup files are
  present. Bridge was not initially listening on `127.0.0.1:47319`, so started
  `npm run ext:bridge` in `real-codex` mode. Health then passed with tracker,
  CV/profile, Codex CLI, Node, and Playwright Chromium OK.
- 2026-04-23: Baseline before the run: 283 markdown files under `reports/`, 79
  files under `jds/`, 518 lines in `data/pipeline.md`, 211 lines in
  `data/applications.md`, and 1012 lines in `data/scan-history.tsv`.
- 2026-04-23: `npm run newgrad-scan` completed the full flow. JobRight API list
  source returned 197 rows within 24 hours, scoring promoted 63 and filtered
  134, detail enrichment succeeded for all 63 with 0 failures, bridge enrich
  added 2 candidates and skipped 61. Skip breakdown:
  33 `site_match_below_bar`, 12 `site_signal_mixed`,
  2 `already_evaluated_report`, 1 `experience_too_high`, 6 `no_sponsorship`,
  1 `detail_value_threshold`, 2 `seniority_too_high`,
  1 `active_clearance_required`, and 3 `pipeline_threshold`.
- 2026-04-23: Direct evaluations queued and completed for Association of
  Universities for Research in Astronomy and Autodesk. AURA generated report
  316 with `3.4/5` and `SKIP`; Autodesk generated report 315 with `4.45/5` and
  `Evaluated`. Tracker merges returned true for both.
- 2026-04-23: Inspection of new JD caches found no current-run
  `Represents the skills you have`, `Turbo for Students`, or verification-shell
  description pollution in `jds/autodesk-fd1232d2.txt` or
  `jds/association-of-universities-for-research-in-astronomy-36595670.txt`.
  Both caches include structured Requirements and Responsibilities, and the
  reports use the expected salary signals: Autodesk `$96000-$172425/yr`, AURA
  `$80000-$95000/yr`.
- 2026-04-23: Found one current enrich persistence bug: direct evaluation kept
  list salary via `detail.salaryRange || row.salary`, but local JD cache writes
  only persisted `detail.salaryRange`, so current cache frontmatter initially
  omitted salary when the detail page lacked a salary field. Implemented a
  scoped fix in `bridge/src/adapters/claude-pipeline.ts` so JD cache writes use
  the same salary fallback, added a regression test in
  `bridge/src/adapters/claude-pipeline.test.ts`, and patched the two current
  run JD cache files to include salary frontmatter.
- 2026-04-23: Separate historical-cache audit with `rg -u` showed many older
  ignored `jds/*.txt` files still contain stale JobRight shell text and fake
  Turbo salary frontmatter. This is not produced by the current run, but it can
  affect old unchecked pipeline rows if reused. Recorded the cleanup as open
  debt in `docs/exec-plans/tech-debt-tracker.md`; did not bulk rewrite old
  caches in this focused task.
- 2026-04-23: Verification passed: `npm --prefix bridge run test --
  src/adapters/claude-pipeline.test.ts` passed with 20 tests, `npm --prefix
  bridge run typecheck` passed, `npm run newgrad-scan -- --help` passed,
  `npm run dashboard:build` rebuilt `web/index.html`, `git diff --check`
  passed, and `npm run verify` completed with 0 errors and 2 existing duplicate
  warnings for RemoteHunter Software Engineer and Anduril Industries Software
  Engineer tracker rows.
- 2026-04-23: User invoked `/career-ops newgrad-scan`. Goal: execute the
  repo-native autonomous JobRight/newgrad scan for the current window and let
  qualifying enrich survivors queue direct `newgrad_quick` evaluations.
  Success criteria: update/setup checks pass, bridge health is available in
  real Codex mode, `npm run newgrad-scan` completes or reports a concrete
  blocker, generated artifacts are inspected, targeted verification runs, and
  this plan records the outcome. Assumptions: default direct evaluation is
  intended, the persistent scanner profile should be reused, no application
  should be submitted, and unrelated dirty worktree changes must be preserved.
  Uncertainties: JobRight login/API state may change, evaluation jobs may
  outlive the scanner wait window, and full verification may still report known
  duplicate tracker warnings. Simplest viable path: use the existing scanner
  without code changes, start the bridge only if needed, inspect before/after
  artifacts, rebuild dashboard after completed evaluations, and run focused
  verification.
- 2026-04-23: Update check returned `offline` with local version `1.3.0`;
  required setup files `cv.md`, `config/profile.yml`, `modes/_profile.md`,
  `portals.yml`, and `data/applications.md` are present. Initial bridge health
  check found no listener on `127.0.0.1:8765`.
- 2026-04-23: `npm` was not on the default Codex shell PATH. Started the
  bridge with `PATH=/opt/homebrew/bin:/usr/local/bin:$PATH npm run ext:bridge`
  outside the sandbox because `tsx` needs to create a local IPC socket. Bridge
  health then passed on `127.0.0.1:47319` with `execution.mode=real`,
  `execution.realExecutor=codex`, Codex CLI OK, Node OK, and Playwright
  Chromium OK.
- 2026-04-23: Baseline before the run: 285 markdown report files, 81 JD cache
  files, 522 lines in `data/pipeline.md`, 213 lines in `data/applications.md`,
  and 1034 lines in `data/scan-history.tsv`.
- 2026-04-23: `npm run newgrad-scan` completed the full scan/enrich/direct
  evaluation flow. JobRight API list source returned 95 rows within 24 hours;
  scanner promoted 40, filtered 55, enriched all 40 details with 0 failures,
  added 8 pipeline candidates, and skipped 32. Skip breakdown:
  19 `site_match_below_bar`, 8 `site_signal_mixed`, 1 `experience_too_high`,
  2 `already_evaluated_report`, 1 `no_sponsorship`, and
  1 `active_clearance_required`.
- 2026-04-23: Added and queued direct evaluations for R1 RCM, Akamai
  Technologies job 2312, KeyBank, Figma, Salesforce Slack AI Platform, Akamai
  Technologies job 2528, FanDuel, and Tesla. All 8 evaluations completed with
  no queue failures or timeouts, and all 8 tracker merges returned true.
- 2026-04-23: Generated reports 317-324: R1 RCM `3/5`, Akamai Technologies
  job 2312 `3.65/5`, KeyBank `2.7/5`, Figma `4.1/5`, Salesforce Slack AI
  Platform `4.55/5`, Akamai Technologies job 2528 `3.7/5`, FanDuel `3.85/5`,
  and Tesla `3.65/5`.
- 2026-04-23: Artifact inspection found no current-run occurrences of the
  previously fixed JobRight shell-description phrases `Represents the skills
  you have`, `Turbo for Students`, or `Get Hired Faster` in the new JD caches
  or reports. Current JD caches include real descriptions, requirements,
  responsibilities, salaries, and concrete apply URLs. Residual lower-risk
  metadata noise remains in JobRight `Skill tags` for some rows, such as
  applicant counts, stage labels, sponsorship badges, and a promotional
  `94% OFF` fragment; recorded this in `docs/exec-plans/tech-debt-tracker.md`.
- 2026-04-23: Rebuilt the dashboard with `npm run dashboard:build`; generated
  `web/index.html` now reports 292 reports, 210 applications, 404 pipeline
  rows, and 1070 scan-history rows.
- 2026-04-23: Verification passed: `npm run newgrad-scan -- --help` passed
  when rerun outside the sandbox for the same `tsx` IPC reason, `git diff
  --check` passed, the current-run bad-shell-text grep returned no matches, and
  `npm run verify` completed with 0 errors and 2 existing duplicate warnings
  for RemoteHunter Software Engineer and Anduril Industries Software Engineer
  tracker rows.

## Key Decisions

- Use the existing Chrome extension plus bridge workflow instead of creating a parallel scanner path.
- Avoid modifying unrelated dirty files already present in the worktree.
- Reuse existing extractor and bridge scoring/enrichment logic; do not duplicate scoring or pipeline-writing behavior in the new script.
- If the apply-flow probe cannot resolve an ATS/employer URL, keep the Jobright job page rather than a homepage or telemetry URL.
- Browser login state belongs in the persistent user-layer profile under `data/browser-profiles/newgrad-scan`; manual login should use that same profile and the browser must be closed before the next scan.
- Manual Jobright login should be done through top-level `https://jobright.ai/` in a non-automated Chrome window, not inside `newgrad-jobs.com` or a Playwright scan browser, because Google can reject embedded or automated sign-in contexts.
- `jobright.ai/jobs/recommend` is not a concrete job URL and must not outrank a `jobright.ai/jobs/info/...` detail URL.
- Direct evaluation polling must use the bridge token for `/v1/jobs/:id`, same as the create and health endpoints.
- Scanner-provided structured signals must obey the bridge runtime schema limits before queueing evaluations; otherwise one noisy extracted tag can reject the whole candidate.
- When a candidate fails queueing because of a scanner payload issue but has already been written to the pipeline, requeue it with a minimal valid payload rather than rerunning the whole scan.

## Risks and Blockers

- The autonomous run can still fall back to Jobright job pages when the source site does not expose an employer ATS URL without a login/session.
- The repository has unrelated dirty worktree changes from prior work; this task did not revert them.
- The scanner succeeded in writing a Goldman report, but tracker merge skipped it as a duplicate of an existing Goldman Sachs row. This preserves deduplication but means report 288 is not represented as a new top tracker row.
- `npm run verify` currently reports duplicate warnings for RemoteHunter and Anduril rows. They do not block pipeline health, but they remain cleanup candidates.
- The full `npm run verify` command can fail on local bridge test timeout
  thresholds even when the failed tests pass with a longer Vitest timeout. This
  is a verification-environment issue to address separately from scan behavior.

## Final Outcome

Implemented and verified.

Changed behavior:

- `/career-ops newgrad-scan` now documents an autonomous path through `npm run newgrad-scan`.
- `npm run newgrad-scan` opens `https://www.newgrad-jobs.com/`, resolves the embedded Jobright source, extracts list rows with the existing extractor, scores via bridge, enriches details with the existing detail extractor, and writes qualifying rows through bridge.
- URL selection now avoids bare company homepages and Google auth/analytics probe URLs.

Scan result:

- Extracted 78 rows.
- Promoted 13 rows.
- Enriched 13 rows.
- Added 2 pipeline entries.
- Skipped 11 rows: 6 detail value threshold, 4 no sponsorship, 1 experience too high.

Verification run:

- `npm run newgrad-scan -- --help` passed.
- `npm --prefix bridge run test -- src/adapters/newgrad-links.test.ts` passed, 7 tests.
- `npm --prefix extension run typecheck` passed.
- `npm --prefix bridge run typecheck` passed.
- `npm run verify` passed with 0 errors and 1 pre-existing duplicate warning for Anduril tracker rows.

Latest scan run:

- `npm run newgrad-scan` passed on 2026-04-20.
- Extracted 108 rows.
- Promoted 34 rows.
- Enriched 34 rows.
- Added 3 pipeline entries.
- Skipped 31 rows: 15 detail value threshold, 13 no sponsorship, 1 seniority too high, 1 already in pipeline, 1 experience too high.
- `npm run verify` passed with 0 errors and the same 1 pre-existing duplicate warning for Anduril tracker rows.

Post-login scan run:

- `npm run newgrad-scan` passed on 2026-04-20 using `data/browser-profiles/newgrad-scan`.
- Extracted 119 rows.
- Promoted 31 rows.
- Enriched 31 rows.
- Added 0 pipeline entries.
- Skipped 31 rows: 15 detail value threshold, 13 no sponsorship, 1 seniority too high, 1 already in pipeline, 1 experience too high.
- `npm run verify` passed with 0 errors and the same 1 pre-existing duplicate warning for Anduril tracker rows.

Post-login retest after dedicated login window:

- `npm run newgrad-scan` passed on 2026-04-20 using `data/browser-profiles/newgrad-scan`.
- Extracted 125 rows.
- Promoted 33 rows.
- Enriched 33 rows.
- Added 0 pipeline entries.
- Skipped 33 rows: 15 detail value threshold, 15 no sponsorship, 1 seniority too high, 1 already in pipeline, 1 experience too high.
- `npm run verify` passed with 0 errors and the same 1 pre-existing duplicate warning for Anduril tracker rows.

Login cookie import retest:

- User approved importing only `.jobright.ai` `SESSION_ID` into the scanner profile.
- `npm run newgrad-scan` passed on 2026-04-20 using `data/browser-profiles/newgrad-scan`.
- Extracted 141 rows.
- Promoted 44 rows.
- Enriched 44 rows.
- Added 8 pipeline entries.
- Skipped 36 rows: 15 no sponsorship, 3 already in pipeline, 9 detail value threshold, 1 seniority too high, 6 pipeline threshold, 1 active clearance required, 1 experience too high.
- Corrected the Sun West pipeline/JD URL from `jobright.ai/jobs/recommend` to its concrete Jobright detail URL.
- `npm --prefix bridge run test -- src/adapters/newgrad-links.test.ts` passed, 8 tests.
- `npm run verify` passed with 0 errors and the same 1 pre-existing duplicate warning for Anduril tracker rows.

2026-04-21 live run:

- `npm run newgrad-scan` reached scan/enrich/pipeline write successfully, then exited nonzero because evaluation polling omitted the bridge token. The queued jobs still ran to completion in the bridge.
- Added 8 pipeline entries and generated reports 284-291.
- Tracker now includes new rows for Bose, Bayview, CAI, Klaviyo, Morgan Stanley, WisdomAI, and Relativity. Goldman report 288 exists, but the tracker row was dedup-skipped against the existing Goldman Sachs row.
- Fixed scanner polling auth and structured-signal truncation, then verified with help smoke, script typecheck, bridge typecheck, focused bridge tests, dashboard rebuild, and `npm run verify`.

2026-04-22 live run:

- `npm run newgrad-scan` completed scan/enrich/pipeline write successfully and
  queued 8 direct evaluations. The scanner wait window returned with 4 complete
  and 4 timed out, but the bridge continued running and all 8 evaluations
  reached terminal `completed` state after manual monitoring.
- Generated reports 298-305 and updated tracker/dashboard state for AppLovin,
  Aurora, MUFG, Gumloop, Amazon Applied Scientist, Axle, AgileGrid Solutions,
  and Charles Schwab.
- `npm run dashboard` and `npm run newgrad-scan -- --help` passed.
- Full `npm run verify` completed tracker/status/report checks but failed on 3
  bridge test timeouts under the default 5-second Vitest limit. The same failed
  bridge tests passed with `--testTimeout=20000`.

2026-04-23 live run:

- `npm run newgrad-scan` completed scan/enrich/pipeline write successfully and
  queued 5 direct evaluations.
- Generated reports 310-314 and merged tracker rows for LendingClub, BillGO,
  Salesforce, Nextdoor, and IXL Learning.
- Rebuilt `web/index.html`; dashboard counts are now 282 reports,
  202 applications, 394 pipeline rows, and 1010 scan-history rows.
- `npm run newgrad-scan -- --help` and `npm run verify` passed. Verification
  has 0 errors and 2 pre-existing duplicate tracker warnings.

2026-04-23 extraction/enrich inspection run:

- `npm run newgrad-scan` completed the full flow: 197 rows extracted, 63
  promoted, 63 enriched, 2 pipeline candidates added, 61 skipped, and 2 direct
  evaluations completed.
- Generated reports 315-316 and tracker rows for Autodesk Machine Learning
  Engineer (`4.45/5`, Evaluated) and Association of Universities for Research
  in Astronomy Software Engineer I (`3.4/5`, SKIP).
- Current-run JD caches contain structured Requirements and Responsibilities
  and no low-value JobRight shell description. Fixed the JD-cache salary
  persistence fallback so future enrich writes preserve row salary when detail
  salary is absent.
- Historical ignored `jds/*.txt` cache pollution remains as tracked debt in
  `docs/exec-plans/tech-debt-tracker.md`.
- `npm --prefix bridge run test -- src/adapters/claude-pipeline.test.ts`,
  `npm --prefix bridge run typecheck`, `npm run newgrad-scan -- --help`,
  `npm run dashboard:build`, `git diff --check`, and `npm run verify` passed.
  Full verify has 0 errors and 2 existing duplicate tracker warnings.

2026-04-23 current live run:

- User invoked `/career-ops newgrad-scan`.
- Goal: run the repo-native autonomous newgrad scan for the current 24-hour
  JobRight/newgrad window, enrich qualifying rows, queue direct
  `newgrad_quick` evaluations, and record the resulting artifacts.
- Success criteria: update/setup checks pass, bridge health is available in
  real Codex mode, the scanner completes or reports an actionable blocker,
  generated data/report/dashboard changes are inspected, focused verification
  runs, and this plan records the outcome.
- Assumptions: the existing persistent scanner profile should be reused, default
  direct evaluation is intended, no application should be submitted, and
  unrelated dirty worktree changes must be preserved.
- Uncertainties: this shell has no `npm` binary even though `node` is available,
  JobRight may change live API/page shape, login state may be stale, and
  direct evaluation jobs may outlive the scanner wait window.
- Simplest viable path: run the same underlying entrypoints that `npm` would
  invoke, start the bridge only if needed, run the scanner, rebuild the
  dashboard if evaluations complete, then run focused verification.
- Update/setup checks passed: update check returned `offline` with local
  version `1.3.0`, and `cv.md`, `config/profile.yml`, `modes/_profile.md`,
  and `portals.yml` are present. `node` is available from the Codex app, but
  `npm`/`npx`/`pnpm` are absent from this shell PATH.
- Baseline before the run: 293 report markdown files, 89 JD cache files, 535
  lines in `data/pipeline.md`, 219 lines in `data/applications.md`, and 1071
  lines in `data/scan-history.tsv`.
- The default full scan/evaluation run was blocked by the approval reviewer
  because direct `newgrad_quick` evaluations would send scraped job data plus
  repo-resident CV/profile context through Codex execution. Switched to the
  safer `--no-evaluate` scanner mode, which scans, scores, enriches, and writes
  local pipeline/JD artifacts without queueing direct evaluations.
- First `--no-evaluate` attempt used an already-running bridge, extracted 96
  rows, promoted 33, enriched 33 with 0 failures, closed the scan browser, then
  failed with `fetch failed` while handing enrich results to the bridge. The
  bridge was no longer listening afterward. No reports, JD cache files,
  pipeline rows, or tracker rows were written; `data/scan-history.tsv` grew by
  five filtered rows only.
- Started a fresh attached bridge process in real Codex mode and reran
  `node bridge/node_modules/tsx/dist/cli.mjs scripts/newgrad-scan-autonomous.ts
  --no-evaluate`. The rerun completed: JobRight API source returned 96 rows
  within 24 hours, promoted 33, filtered 63, enriched 33 with 0 failures,
  bridge enrich added 1 pipeline candidate and skipped 32. Skip breakdown:
  17 `site_match_below_bar`, 8 `site_signal_mixed`, 1 `experience_too_high`,
  2 `already_evaluated_report`, 2 `no_sponsorship`,
  1 `active_clearance_required`, and 1 `pipeline_threshold`.
- Added pipeline/JD cache candidate: LetsGetChecked — Graduate Software
  Engineer, score `9/9`, value `8.1/10`, apply URL
  `https://job-boards.eu.greenhouse.io/letsgetchecked/jobs/4833407101?gh_src=07eabf22teu`,
  local cache `jds/letsgetchecked-30666b06.txt`.
- Inspected `jds/letsgetchecked-30666b06.txt`; it contains real role content,
  salary `$76240-$95300/yr`, concrete Greenhouse apply URL, requirements,
  responsibilities, skill tags, and no obvious JobRight shell-description or
  fake Turbo salary pollution.
- Rebuilt dashboard with `node web/build-dashboard.mjs`; generated
  `web/index.html` reports 292 parsed reports, 210 applications, 405 pipeline
  items, and 1075 scan-history rows.
- Verification: `node verify-pipeline.mjs` passed tracker/status/report checks
  but failed its bridge/extension command section because it shells out to
  missing `npm`. Direct equivalents passed: `node
  bridge/node_modules/typescript/bin/tsc --noEmit -p bridge/tsconfig.json`,
  `node extension/node_modules/typescript/bin/tsc --noEmit -p
  extension/tsconfig.json`, `node extension/build.mjs`, `node
  node_modules/vitest/vitest.mjs run` from `bridge/` (24 files, 207 tests), and
  `git diff --check`.
- Final outcome for this run: local scan/enrich/pipeline update completed in
  no-evaluate mode; no direct evaluations were queued, no reports were
  generated, and `data/applications.md` was unchanged.
- 2026-04-24: User invoked `/career-ops newgrad-scan`. Goal: execute the
  repo-native autonomous JobRight/newgrad scan for the current 24-hour window,
  enrich qualifying rows, queue direct `newgrad_quick` evaluations when the
  bridge supports it, and record resulting artifacts. Success criteria:
  update/setup checks pass, bridge health is available in real Codex mode,
  scanner completes or reports an actionable blocker, generated artifacts are
  inspected, dashboard is rebuilt when data changes, focused verification runs,
  and this plan records the outcome. Assumptions: default direct evaluation is
  intended, the persistent scanner profile should be reused, no application
  should be submitted, and unrelated dirty worktree changes must be preserved.
  Uncertainties: JobRight API/login state may change, bridge jobs may outlive
  the scanner wait window, and full verification may still report known
  duplicate tracker warnings. Simplest viable path: use existing
  `npm run newgrad-scan`, start the bridge only if needed, inspect before/after
  artifacts, rebuild dashboard after completed evaluations, then run focused
  verification.
- 2026-04-24: Update/setup checks passed for this run. `node
  update-system.mjs check` returned `offline` with local version `1.3.0`, and
  `cv.md`, `config/profile.yml`, `modes/_profile.md`, `portals.yml`, and
  `data/applications.md` are present. Initial bridge health check found no
  listener on `127.0.0.1:47319`.
- 2026-04-24: Baseline before the run: 293 markdown report files, 89 JD cache
  files, 539 lines in `data/pipeline.md`, 219 lines in
  `data/applications.md`, and 1080 lines in `data/scan-history.tsv`.
- 2026-04-24: Started `npm run ext:bridge` in real Codex mode on
  `127.0.0.1:47319`. Authenticated `/v1/health` passed with
  `execution.mode=real`, `execution.realExecutor=codex`, tracker/CV/profile OK,
  Codex CLI OK, Node OK, and Playwright Chromium OK.
- 2026-04-24: First `npm run newgrad-scan` attempt exposed a broken package
  script from the scan Bun migration: `bun --cwd bridge run tsx ...` printed
  Bun help and exited 0 instead of running the scanner. Fixed scan package
  scripts to call `./bridge/node_modules/.bin/tsx` directly; verified both
  `bun run newgrad-scan -- --help` and `npm run newgrad-scan -- --help`.
- 2026-04-24: Full `bun run newgrad-scan` completed the scan/enrich phase.
  JobRight API source returned 96 rows within 24 hours; scanner promoted 34,
  filtered 62, enriched 34 with 0 failures, bridge enrich added 3 candidates
  and skipped 31. Skip breakdown: 18 `site_match_below_bar`, 8
  `site_signal_mixed`, 1 `already_evaluated_report`, 2 `no_sponsorship`, 1
  `active_clearance_required`, and 1 `pipeline_threshold`.
- 2026-04-24: Added pipeline/JD cache candidates for Wonderschool Early Career
  Software Engineer - Applied AI, Peloton Interactive Software Engineer I, and
  Aviatrix MTS SDET, Test Infrastructure. The scanner queued direct evaluations
  for all three. Aviatrix completed as report 327 with `2.7/5`, `SKIP`, and
  tracker merge true. Wonderschool and Peloton initially failed before report
  creation because the bridge inherited user-level Codex model `gpt-5.5`, and
  the Codex CLI returned `The model gpt-5.5 does not exist or you do not have
  access to it`.
- 2026-04-24: Added a bridge-level Codex model override. `CAREER_OPS_CODEX_MODEL`
  can override it. At the time, the default was `gpt-5.4`, which was verified
  with a minimal `codex exec -m gpt-5.4` probe. Superseded on 2026-04-25:
  the current default is `gpt-5.4-mini` with medium reasoning, recorded in
  `docs/exec-plans/active/2026-04-24-codex-eval-intelligence-medium.md`.
- 2026-04-24: Requeued only the two failed candidates from local JD cache files.
  Peloton Interactive completed as report 328 with `2.3/5`, `SKIP`, and tracker
  merge true. Wonderschool completed as report 329 with `2.6/5`, `SKIP`, and
  tracker merge true.
- 2026-04-24: Artifact inspection found no current-run occurrences of
  `Represents the skills you have`, `Turbo for Students`, `Get Hired Faster`,
  `Enable JavaScript`, `__NEXT_DATA__`, or `jobright.ai/jobs/recommend` in the
  three new JD caches or reports. The JD caches contain concrete Greenhouse
  URLs, salary frontmatter, and real role descriptions. The two retried reports
  are quick-screen SKIPs and note missing structured signals because they were
  requeued from the local JD cache after the original in-memory bridge jobs were
  lost during restart.
- 2026-04-24: Rebuilt the dashboard with `npm run dashboard:build`; generated
  `web/index.html` reports 295 parsed reports, 213 applications, 409 pipeline
  rows, and 1091 scan-history rows. Raw file counts after the run are 296
  markdown files under `reports/` including `reports/CLAUDE.md`, 92 JD cache
  files, 544 lines in `data/pipeline.md`, 222 lines in `data/applications.md`,
  and 1092 lines in `data/scan-history.tsv`.
- 2026-04-24: Verification passed: `bun run newgrad-scan -- --help`,
  `npm run newgrad-scan -- --help`, `npm --prefix bridge run typecheck`,
  `npm --prefix bridge run test -- src/adapters/claude-pipeline.test.ts
  src/server.test.ts` with 22 tests, `git diff --check`, and `npm run verify`.
  Full verify completed with 0 errors and the same 2 known duplicate warnings
  for RemoteHunter Software Engineer and Anduril Industries Software Engineer
  tracker rows.
- 2026-04-24: User challenged the Wonderschool report 329 quick-screen score
  of `2.6/5` as likely too low. Audit found the scanner pipeline entry had
  `score: 9/9, value: 10/10` with reasons including `strong_skill_match`,
  `early_career_level`, and `sponsorship_supported`, while the quick-screen
  report showed `no structured signals available`. The quick log confirms the
  retried evaluation received only `source/company/role` in `structuredSignals`
  and the richer salary, H1B likely, skill tags, and JD content only as
  `pageText` from `jds/wonderschool-1c578e39.txt`. This makes report 329 a
  cache-requeue artifact rather than a clean evaluation from the original
  enriched row. Treat the `2.6/5` score as suspect until the role is requeued
  with structured signals or the quick evaluator is taught to recover
  frontmatter/JD-cache structure during retry.
- 2026-04-24: User clarified screening policy changes. Goal: set the
  compensation walk-away floor to `$90K`, make sponsorship unknown/not
  explicitly confirmed a non-blocker, keep only explicit no-sponsorship language
  as a sponsorship blocker, then rerun candidates skipped because of the old
  floor or unknown-sponsorship handling. Success criteria: config and
  quick-screen rules are updated mechanically, focused tests verify the new
  policy and JD-cache structured-signal recovery, affected candidates are
  requeued through `/v1/evaluate`, generated reports/tracker rows are inspected,
  and final results are recorded here. Assumptions: explicit no-sponsorship,
  restricted work-authorization, active clearance, experience-above-limit, and
  salary below `$90K` remain blockers; unrelated low-signal or role-mismatch
  skips are not automatically rerun. Uncertainties: some older skip reports lack
  local JD cache text, so reruns may be limited to candidates with enough cached
  context to evaluate without live browsing.
- 2026-04-24: Implemented the policy correction in quick-screen code and full
  batch prompt. `config/profile.yml` already had `compensation.minimum: "$90K"`;
  quick screening now annualizes hourly salary before comparing to the floor,
  recovers structured signals from local JD-cache frontmatter/body during
  retries, blocks only explicit no-sponsorship/restricted work-authorization
  language, and allows explicit `policy_rerun` duplicate bypasses. Updated
  `batch/batch-prompt.md` so deep evaluations treat `h1b: "unknown"` as an
  unresolved risk rather than a blocker.
- 2026-04-24: Reran the affected cached candidates through the bridge with
  policy-rerun signals. New reports: Wonderschool `330` (`4.05/5`,
  `Evaluated`), Peloton `331` (`2.7/5`, `Evaluated`), KeyBank `332`
  (`3.15/5`, `Evaluated`), R1 RCM `333` (`3.1/5`, `Evaluated`), AURA `334`
  (`3.25/5`, `Evaluated`), ECC `335` (`2.1/5`, `SKIP`), Vizient `336`
  (`2.8/5`, `SKIP`), Intuit `337` (`4.05/5`, `Evaluated`), Businessolver
  `338` (`3.05/5`, `Evaluated`), and L&T Technology Services `339`
  (`2.8/5`, `SKIP`).
- 2026-04-24: Fixed `merge-tracker.mjs` after discovering that duplicate-row
  updates preserved stale `SKIP` status from older quick screens. New behavior
  uses the rerun status for non-advanced existing rows, preserves advanced
  workflow states and existing PDFs, and lets a newer `Evaluated` report replace
  an older quick-screen `SKIP` even if the final full-eval score is lower.
  Updated existing tracker rows for the policy rerun results and rebuilt
  `web/index.html`.
- 2026-04-24: Verification passed: `npm --prefix bridge test --
  src/adapters/claude-pipeline.test.ts src/adapters/newgrad-value-scorer.test.ts
  src/batch/merge-tracker.test.ts` (31 tests), `npm --prefix bridge run
  typecheck`, `npm run verify` (0 errors, 2 known duplicate warnings), stale
  prompt grep for `h1b unknown` hard-blocker wording returned no matches, and
  `npm run dashboard:build` rebuilt the dashboard with 305 reports, 213
  applications, 409 pipeline rows, and 1091 scan-history rows.
- 2026-04-24: User invoked `/newgrad-scan`. Goal: execute the repo-native
  autonomous JobRight/newgrad scan for the current 24-hour window, enrich
  qualifying rows, queue the default `newgrad_quick` evaluations, rebuild
  derived artifacts if data changes, and record the outcome. Success criteria:
  update/setup checks pass, bridge health is available in real Codex mode,
  scanner completes or reports an actionable blocker, generated artifacts are
  inspected, focused verification runs, and this plan records the result.
  Assumptions: `/newgrad-scan` maps to the existing `/career-ops newgrad-scan`
  workflow, direct evaluation is intended, the persistent scanner browser
  profile should be reused, no application should be submitted, and unrelated
  dirty worktree changes must be preserved. Uncertainties: JobRight API/login
  state may change, direct evaluation jobs may outlive the scanner wait window,
  and live scan output may include only previously seen rows. Simplest viable
  path: start the existing real-Codex bridge if needed, run `npm run
  newgrad-scan`, inspect before/after artifacts, rebuild the dashboard when
  needed, then run focused verification.
- 2026-04-24: Update/setup checks passed for this run. `node
  update-system.mjs check` returned `offline` with local version `1.3.0`, and
  `cv.md`, `config/profile.yml`, `modes/_profile.md`, and `portals.yml` are
  present. Baseline before the run: 307 markdown report files under `reports/`,
  94 JD cache files, 546 lines in `data/pipeline.md`, 223 lines in
  `data/applications.md`, and 1103 lines in `data/scan-history.tsv`.
- 2026-04-24: Started `npm run ext:bridge` in real Codex mode on
  `127.0.0.1:47319`; authenticated health passed. `npm run newgrad-scan`
  completed successfully. JobRight API source returned 76 rows within 24
  hours, promoted 18, filtered 58, enriched 18 with 0 failures, then bridge
  enrich added 0 candidates and skipped 18. Skip breakdown: 13
  `site_match_below_bar`, 3 `site_signal_mixed`, 1 `no_sponsorship`, and 1
  `pipeline_threshold`. No direct `newgrad_quick` evaluations were queued.
- 2026-04-24: Run artifacts written to
  `data/scan-runs/newgrad-20260424T090224Z-87268713.jsonl` and
  `data/scan-runs/newgrad-20260424T090224Z-87268713-summary.json`. Reports, JD
  cache files, pipeline rows, and tracker rows did not change; ignored
  `data/scan-history.tsv` advanced from 1103 to 1108 lines. Rebuilt
  `web/index.html` with `npm run dashboard:build`; dashboard output reported
  306 reports, 214 applications, 410 pipeline rows, and 1107 scan-history rows.
- 2026-04-24: Verification passed: `npm run newgrad-scan -- --help`,
  `npm run verify` (0 errors, same 2 known duplicate warnings for RemoteHunter
  Software Engineer and Anduril Industries Software Engineer), and
  `git diff --check`.
- 2026-04-24: User invoked `/career-ops newgrad-scan`. Goal: execute the
  repo-native autonomous JobRight/newgrad scan for the current window, enrich
  qualifying rows, queue default `newgrad_quick` evaluations when candidates
  survive enrichment, and record resulting artifacts. Success criteria:
  setup/update checks pass, bridge health is available in real Codex mode,
  `npm run newgrad-scan` completes or returns a concrete blocker, generated
  artifacts are inspected, focused verification runs, and this plan records the
  result. Assumptions: this maps to the existing autonomous scanner, direct
  evaluation is intended, the persistent scanner browser profile should be
  reused, no application should be submitted, and unrelated dirty worktree
  changes must be preserved. Uncertainties: JobRight API/login state may have
  changed since the last run, direct evaluation jobs may take longer than the
  scanner wait window, and the live window may contain only previously seen
  rows. Simplest viable path: use the existing `npm run newgrad-scan`, start
  the bridge only if needed, inspect before/after artifacts, rebuild the
  dashboard if data changed, then run focused verification.
- 2026-04-24: Setup checks passed for this run. `node update-system.mjs check`
  returned `offline` with local version `1.3.0`; `cv.md`,
  `config/profile.yml`, `modes/_profile.md`, `portals.yml`, and
  `data/applications.md` are present. Baseline before the run: 307 markdown
  report files under `reports/`, 95 JD cache files, 548 lines in
  `data/pipeline.md`, 223 lines in `data/applications.md`, and 1116 lines in
  `data/scan-history.tsv`.
- 2026-04-24: Started `npm run ext:bridge` in real Codex mode on
  `127.0.0.1:47319`; authenticated bridge health passed. `npm run
  newgrad-scan` completed successfully. JobRight API source returned 83 rows
  within 24 hours, promoted 36, filtered 47, enriched 36 with 0 failures, then
  bridge enrich added 8 candidates and skipped 28. Skip breakdown: 10
  `site_signal_mixed`, 13 `site_match_below_bar`, and 5 `no_sponsorship`.
  Direct evaluation queued 8 candidates, completed 8, failed 0, and timed out
  0.
- 2026-04-24: Run artifacts written to
  `data/scan-runs/newgrad-20260424T180551Z-93ecc8d2.jsonl` and
  `data/scan-runs/newgrad-20260424T180551Z-93ecc8d2-summary.json`. Generated
  reports/tracker rows: Procore Technologies `341` (`4.05/5`, `Evaluated`),
  Notion `342` (`4.3/5`, `Evaluated`), Fortune `343` (`3.8/5`,
  `Evaluated`), Sterne Kessler `344` (`2/5`, `SKIP`), AMETEK `345`
  (`2.1/5`, `SKIP`), The Tatitlek Corporation `346` (`2/5`, `SKIP`), Meta
  `347` (`1.5/5`, `SKIP`), and The Walt Disney Company `348` (`3.4/5`,
  `Evaluated`). Counts after the run: 315 markdown report files under
  `reports/`, 103 JD cache files, 561 lines in `data/pipeline.md`, 231 lines
  in `data/applications.md`, and 1149 lines in `data/scan-history.tsv`.
- 2026-04-24: Rebuilt `web/index.html` with `npm run dashboard:build`;
  dashboard output reported 314 parsed reports, 222 applications, 419 pipeline
  rows, and 1148 scan-history rows. Verification passed: `npm run
  newgrad-scan -- --help`, `npm run verify` (0 errors, same 2 warnings for
  duplicate RemoteHunter Software Engineer and Anduril Industries Software
  Engineer rows), and `git diff --check`.
- 2026-04-24: User invoked `/career-ops newgrad-scan`. Goal: execute the
  repo-native autonomous JobRight/newgrad scan for the current live window,
  enrich qualifying rows, queue default `newgrad_quick` evaluations for any
  enrich survivors, rebuild derived artifacts if data changes, and record the
  outcome. Success criteria: setup/update checks pass, bridge health is
  available in real Codex mode, `npm run newgrad-scan` completes or reports an
  actionable blocker, generated artifacts are inspected, focused verification
  runs, and this plan records the result. Assumptions: the slash command maps
  to the existing autonomous scanner, direct evaluation is intended, no
  application should be submitted, the persistent scanner browser profile should
  be reused, and unrelated dirty worktree changes must be preserved.
  Uncertainties: JobRight API/login state may have changed, direct evaluations
  may outlive the scanner wait window, and the live window may contain only
  previously seen rows. Simplest viable path: start or reuse the existing
  real-Codex bridge, run `npm run newgrad-scan`, inspect before/after artifacts,
  rebuild the dashboard when needed, then run focused verification.
- 2026-04-24: Setup/update checks passed for this run. `node
  update-system.mjs check` returned `offline` with local version `1.3.0`;
  required files `cv.md`, `config/profile.yml`, `modes/_profile.md`,
  `portals.yml`, and `data/applications.md` are present. Baseline before the
  run: 328 markdown report files under `reports/`, 116 JD cache files, 581
  lines in `data/pipeline.md`, 243 lines in `data/applications.md`, and 1171
  lines in `data/scan-history.tsv`. Initial unauthenticated bridge health found
  no listener on `127.0.0.1:47319`.
- 2026-04-24: Started `npm run ext:bridge` in real Codex mode on
  `127.0.0.1:47319`; authenticated bridge health passed with tracker,
  CV/profile, Codex CLI, and Playwright Chromium OK. `npm run newgrad-scan`
  completed successfully. JobRight API source returned 114 rows within 24
  hours, promoted 42, filtered 72, enriched 42 with 0 failures, then bridge
  enrich added 4 candidates and skipped 38. Skip breakdown: 18
  `site_match_below_bar`, 9 `site_signal_mixed`, 6 `no_sponsorship`, 3
  `experience_too_high`, 1 `already_evaluated_report`, and 1
  `pipeline_threshold`.
- 2026-04-24: Direct evaluation queued 4 candidates and completed all 4 with no
  queue failures or timeouts. Generated reports/tracker rows: Remitly `362`
  (`4.05/5`, `Evaluated`), MSCI Inc. `363` (`3.8/5`, `Evaluated`/manual
  review), AgileGrid Solutions `364` (`2/5`, `SKIP`), and Sezzle `365`
  (`3.6/5`, `Evaluated`/manual review). Run artifacts were written to
  `data/scan-runs/newgrad-20260424T212849Z-5c7612d7.jsonl` and
  `data/scan-runs/newgrad-20260424T212849Z-5c7612d7-summary.json`.
- 2026-04-24: Counts after the run: 332 markdown report files under `reports/`,
  120 JD cache files, 589 lines in `data/pipeline.md`, 247 lines in
  `data/applications.md`, and 1191 lines in `data/scan-history.tsv`. Rebuilt
  `web/index.html` with `npm run dashboard:build`; dashboard output reported
  331 parsed reports, 238 applications, 436 pipeline rows, and 1190
  scan-history rows. Verification passed: `npm run newgrad-scan -- --help`,
  `npm run verify` (0 errors, same 2 duplicate warnings for RemoteHunter
  Software Engineer and Anduril Industries Software Engineer), and
  `git diff --check`.
- 2026-04-24: User invoked `/career-ops newgrad-scan` again. Goal: run the
  existing autonomous JobRight/newgrad scanner for the current live window,
  enrich qualifying rows, queue default `newgrad_quick` evaluations for enrich
  survivors, rebuild derived dashboard output if data changes, and record the
  outcome. Success criteria: setup/update checks pass, bridge health is
  available in real Codex mode, `npm run newgrad-scan` completes or reports a
  concrete blocker, generated artifacts are inspected, focused verification
  runs, and this plan records the result. Assumptions: this slash command maps
  to the repo-native autonomous scanner, direct evaluation is intended, no
  application should be submitted, the persistent scanner browser profile
  should be reused, and unrelated worktree changes must be preserved.
  Uncertainties: JobRight API/login state may have changed, direct evaluations
  may outlive the scanner wait window, and many rows may already be deduped
  because earlier scans ran today. Simplest viable path: start or reuse the
  real-Codex bridge, run `npm run newgrad-scan`, inspect artifacts, rebuild the
  dashboard when needed, then run focused verification.
- 2026-04-24: Setup/update checks passed for this run. `node
  update-system.mjs check` returned `offline` with local version `1.3.0`;
  required files `cv.md`, `config/profile.yml`, `modes/_profile.md`,
  `portals.yml`, and `data/applications.md` are present. Baseline before the
  run: 342 markdown report files under `reports/`, 119 JD cache files, 601
  lines in `data/pipeline.md`, 254 lines in `data/applications.md`, and 1202
  lines in `data/scan-history.tsv`. Initial authenticated bridge health found
  no listener on `127.0.0.1:47319`.
- 2026-04-24: Started `npm run ext:bridge` in real Codex mode on
  `127.0.0.1:47319`; authenticated bridge health passed with tracker,
  CV/profile, Codex CLI, and Playwright Chromium OK. `npm run newgrad-scan`
  completed successfully. JobRight API source returned 133 rows within 24
  hours, promoted 44, filtered 89, enriched 44 with 0 failures, then bridge
  enrich added 3 candidates and skipped 41. Skip breakdown: 3
  `experience_too_high`, 8 `site_signal_mixed`, 22 `site_match_below_bar`, 1
  `already_evaluated_report`, 6 `no_sponsorship`, and 1
  `pipeline_threshold`.
- 2026-04-24: Direct evaluation queued 3 candidates and completed all 3 with no
  queue failures or timeouts. Generated reports/tracker rows: Grant Street
  Group `377` (`3.1/5`), State of Arkansas `378` (`3.4/5`), and
  GlobalFoundries `379` (`3.4/5`). Run artifacts were written to
  `data/scan-runs/newgrad-20260425T002055Z-986953ee.jsonl` and
  `data/scan-runs/newgrad-20260425T002055Z-986953ee-summary.json`.
- 2026-04-24: Counts after the run: 345 markdown report files under `reports/`,
  122 JD cache files, 607 lines in `data/pipeline.md`, 257 lines in
  `data/applications.md`, and 1217 lines in `data/scan-history.tsv`. Rebuilt
  `web/index.html` with `npm run dashboard:build`; dashboard output reported
  345 parsed reports, 248 applications, 450 pipeline rows, and 1216
  scan-history rows. Verification passed: `npm run newgrad-scan -- --help`,
  `npm run verify` (0 errors, same 2 duplicate warnings for RemoteHunter
  Software Engineer and Anduril Industries Software Engineer), and
  `git diff --check`.
