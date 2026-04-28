# LinkedIn Scan Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `/career-ops linkedin-scan` for LinkedIn Jobs discovery through `bb-browser`, reusing the existing newgrad scanner bridge, scoring, pipeline, and evaluation flow.

**Architecture:** Keep durable scanner logic in this repository. Use `bb-browser` only as the logged-in browser transport for LinkedIn, then normalize LinkedIn list/detail data into the existing `NewGradRow` and `NewGradDetail` contracts.

**Tech Stack:** TypeScript, Node.js, `bb-browser` CLI, Fastify bridge endpoints, existing `newgrad-scan` contracts, Vitest, Markdown mode files.

---

## Background

The user wants to use the bundled `bb-browser` project to search LinkedIn Jobs
with this 24-hour search URL:

```text
https://www.linkedin.com/jobs/search-results/?currentJobId=4347121472&keywords=software%20ai%20engineer%20new%20graduate%20job%20posted%20in%20the%20past%2024%20hours&origin=JOB_SEARCH_PAGE_JOB_FILTER&referralSearchId=AGHvJSQGboSyT24DsI0dwg%3D%3D&f_TPR=r86400
```

The existing `newgrad-scan` path already solves most downstream work:

```text
source list rows
  -> /v1/newgrad-scan/score
  -> detail enrichment
  -> /v1/newgrad-scan/enrich
  -> pipeline/history/direct evaluation
```

Live `bb-browser` inspection on 2026-04-21 confirmed:

- The `bb-browser` profile is logged into LinkedIn after the user authenticated.
- Existing community adapters are `linkedin/profile` and `linkedin/search`; they
  do not cover LinkedIn Jobs search.
- LinkedIn Jobs result cards expose `data-job-id`.
- The detail pane exposes title, company, location/posted metadata, full JD text,
  and Apply buttons.

## Goal

Implement a source-specific `/career-ops linkedin-scan` mode that:

1. Opens or reads a LinkedIn Jobs search URL through `bb-browser`.
2. Extracts visible job rows without clicking mutating LinkedIn controls.
3. Scores and deduplicates rows through the existing bridge.
4. Enriches promoted LinkedIn job detail pages.
5. When explicitly enabled, probes non-Easy-Apply external Apply links, captures
   the external ATS URL, and reads visible ATS/JD text without submitting or
   advancing an application.
6. Writes qualifying rows as `linkedin-scan` pipeline/history entries.
7. Optionally queues direct evaluations using the existing `newgrad_quick` path.

## Scope

In scope:

- Add a LinkedIn DOM extractor file.
- Add a `bb-browser` autonomous scanner script.
- Add `linkedin-scan` source tag support to existing bridge adapters.
- Add targeted unit tests for source mapping, URL selection, pending parsing, and
  LinkedIn text normalization.
- Add `/career-ops linkedin-scan` router and mode documentation.
- Add concise discoverability docs and npm script alias.
- Add read-only external Apply probing behind an explicit flag, excluding Easy
  Apply and mutating controls.

Out of scope:

- Applying, Easy Apply, saving jobs, dismissing jobs, messaging recruiters, form
  filling, or advancing any external application workflow.
- A public LinkedIn API client.
- A private `~/.bb-browser` adapter as the durable implementation.
- Pagination beyond visible/infinite-scroll first-page collection in the first
  version.
- Replacing `newgrad-scan` or `builtin-scan`.

## Assumptions

- `bb-browser` is installed and available on `PATH`.
- The user can log into LinkedIn manually in the `bb-browser` managed browser.
- The bridge server is running before the scanner posts rows.
- `linkedin-scan` can reuse `config/profile.yml -> newgrad_scan` scoring for the
  first version.
- If no `--url` is passed, the script reads `config/profile.yml ->
  linkedin_scan.search_url`; if neither exists, it fails with a clear message.

## Uncertainties

- LinkedIn may change DOM shape or card class names; selectors must use semantic
  anchors and tests must cover pure normalization helpers.
- Some LinkedIn result rows are promoted or related results, not exact matches.
  Existing scoring should filter them.
- The Apply button often hides external ATS URLs behind a click. The first
  version kept LinkedIn job-view URLs as pipeline URLs; on 2026-04-22 the user
  explicitly expanded scope to allow read-only non-Easy-Apply click-through,
  external ATS URL capture, and visible ATS/JD text extraction.
- 2026-04-23 routing review: Playwright may be technically possible, but it
  would require a separate persistent LinkedIn profile or session-cookie import,
  has higher checkpoint/bot-detection risk, and would duplicate the existing
  `bb-browser` authenticated-tab cleanup and external apply safeguards.

## Simplest Viable Path

Build one source adapter over `bb-browser`, map it into existing scanner
contracts, and add only the bridge/source plumbing needed for a new
`linkedin-scan` tag.

```text
bb-browser tab
  |
  | eval extractLinkedInList()
  v
NewGradRow[]
  |
  | existing score endpoint
  v
ScoredRow[]
  |
  | open LinkedIn job detail URLs with bb-browser
  v
EnrichedRow[]
  |
  | existing enrich endpoint
  v
PipelineEntry[] tagged linkedin-scan
```

## Runtime Decision

Use `bb-browser` rather than Playwright for `linkedin-scan`.

Reasons:

- LinkedIn's hard part is authenticated session continuity, checkpoint recovery,
  and manual MFA/CAPTCHA handling. `bb-browser` uses the managed browser where
  the user logs in manually; Playwright would need a separate profile or cookie
  transfer.
- The current scanner already opens list/detail/external tabs through
  `bb-browser` and closes only the tabs it opened in `finally` blocks.
- `bb-browser` keeps login recovery explicit:
  `bb-browser open https://www.linkedin.com/login`, with no credentials or
  session tokens in chat.
- The implementation already has LinkedIn-specific safety boundaries for Easy
  Apply, Save, Dismiss, messaging, and external apply probing.

Playwright remains useful for JobRight/newgrad because that flow can rely on a
public paginated API and a headless bundled Chromium context. It is not the
better default for LinkedIn.

## What Already Exists

- `modes/newgrad-scan.md`: scanner workflow to imitate.
- `scripts/newgrad-scan-autonomous.ts`: autonomous scan/evaluate runner pattern.
- `extension/src/content/extract-newgrad.ts`: self-contained DOM extractor
  pattern.
- `extension/src/content/extract-builtin.ts`: source adapter that maps another
  job board into `NewGradRow` / `NewGradDetail`.
- `bridge/src/adapters/newgrad-scorer.ts`: scoring and hard filters.
- `bridge/src/adapters/newgrad-scan-history.ts`: history persistence.
- `bridge/src/adapters/newgrad-pending.ts`: pending pipeline parser.
- `bridge/src/adapters/newgrad-source.ts`: source-to-pipeline-tag mapping.
- `bridge/src/adapters/newgrad-links.ts`: URL choice for pipeline entries.

## NOT In Scope

- LinkedIn profile/post search: existing bb-browser adapters already cover that.
- LinkedIn account automation: login, checkpoint, CAPTCHA, and 2FA stay manual.
- Apply URL probing by clicking Apply: this could change application state and is
  excluded.
- Extension UI support: useful later, but the first path should use the
  authenticated `bb-browser` profile already confirmed by the user.

## Implementation Steps

1. [x] Create `extension/src/content/extract-linkedin.ts`.
   Verify: the file exports self-contained `extractLinkedInList` and
   `extractLinkedInDetail` functions that can be stringified and executed in a
   browser tab.

2. [x] Add pure LinkedIn normalization helpers under `bridge/src/adapters/`.
   Verify: tests cover job id extraction, job-view URL canonicalization,
   reposted-age normalization, work-model parsing, and login/checkpoint
   detection text.

3. [x] Extend source tag plumbing for `linkedin-scan`.
   Verify: `bridge/src/adapters/newgrad-source.ts`,
   `newgrad-scan-history.ts`, and `newgrad-pending.ts` accept
   `linkedin-scan`; tests prove existing `newgrad-scan` and `builtin-scan`
   behavior is unchanged.

4. [x] Harden pipeline URL selection for LinkedIn job views.
   Verify: `newgrad-links.test.ts` proves `https://www.linkedin.com/jobs/view/{id}/`
   is accepted as a job URL fallback, while LinkedIn company/profile/social URLs
   remain noise.

5. [x] Add `scripts/linkedin-scan-bb-browser.ts`.
   Verify: `--help` documents `--url`, `--score-only`, `--no-evaluate`,
   `--limit`, `--enrich-limit`, bridge host/port, and login recovery; the script
   exits cleanly before writes in `--score-only`.

6. [x] Add npm and mode routing.
   Verify: `package.json` has `linkedin-scan`; `.claude/skills/career-ops/SKILL.md`
   routes `linkedin-scan` / `linkedin`; discovery lists the command; shared
   context loading includes the mode.

7. [x] Add `modes/linkedin-scan.md`.
   Verify: mode docs include bridge check, LinkedIn login check, the supplied
   search URL shape, safe read-only boundaries, useful options, and result
   reporting.

8. [x] Update concise navigation docs.
   Verify: `CLAUDE.md`, `docs/CODEX.md`, and optional OpenCode command docs mention
   the new mode without expanding top-level files into long references.

9. [x] Run targeted verification.
   Verify:
   - `npm --prefix bridge run test -- src/adapters/newgrad-source.test.ts src/adapters/newgrad-links.test.ts src/adapters/newgrad-pending.test.ts src/adapters/newgrad-scan-history.test.ts src/adapters/linkedin-scan-normalizer.test.ts`
   - `npm --prefix bridge run typecheck`
   - `npm run linkedin-scan -- --url "<LinkedIn URL>" --score-only --limit 5`
   - `npm run linkedin-scan -- --url "<LinkedIn URL>" --no-evaluate --enrich-limit 2`
   - `npm run verify`

## Test Coverage Diagram

```text
CODE PATH COVERAGE
==================
[+] extract-linkedin.ts
    |
    +-- [GAP] login/checkpoint detection -> unit helper + live score-only check
    +-- [GAP] result card extraction -> live bb-browser score-only check
    +-- [GAP] detail pane extraction -> live no-evaluate enrich check
    +-- [GAP] Apply buttons are not clicked -> script test/inspection requirement

[+] newgrad-source.ts
    |
    +-- [GAP] linkedin.com -> linkedin-scan
    +-- [GAP] existing Built In and newgrad mappings unchanged

[+] newgrad-scan-history.ts
    |
    +-- [GAP] history rows persist portal=linkedin-scan
    +-- [GAP] seen-key dedupe handles LinkedIn job-view URLs

[+] newgrad-pending.ts
    |
    +-- [GAP] rich pipeline rows with (via linkedin-scan, score: ...)
    +-- [GAP] pending entries expose source=linkedin.com

[+] newgrad-links.ts
    |
    +-- [GAP] linkedin jobs/view URL accepted as fallback
    +-- [GAP] linkedin company/profile URLs ignored as noise

[+] linkedin-scan-bb-browser.ts
    |
    +-- [GAP] missing bb-browser -> clear setup error
    +-- [GAP] LinkedIn login redirect -> clear login recovery
    +-- [GAP] --score-only does not write files
    +-- [GAP] --no-evaluate writes pipeline/history but queues no evaluation
```

```text
USER FLOW COVERAGE
==================
/career-ops linkedin-scan
    |
    +-- [GAP] bridge offline -> tell user to start bridge
    +-- [GAP] LinkedIn not logged in -> tell user to run bb-browser open login URL
    +-- [GAP] logged in + score-only -> rows extracted and scored
    +-- [GAP] logged in + no-evaluate -> detail pages enriched and pipeline updated
    +-- [GAP] default path -> direct evaluations queued for enrich survivors
```

Current planned coverage: 0/20 paths tested because this is a pre-implementation
plan. All gaps above are required implementation verification items.

## Verification Approach

- Prefer focused bridge tests for deterministic source, URL, parser, and
  normalization behavior.
- Use `bb-browser` only for live LinkedIn integration checks that require login.
- Use `--score-only` before any write path.
- For write-path verification, use `--no-evaluate --enrich-limit 2` first so the
  scanner can prove pipeline/history writes without queueing applications or
  formal evaluations.
- Run `npm run verify` last to catch tracker and report integrity regressions.

## Key Decisions

- Use `bb-browser` as the primary LinkedIn transport because the user's
  authenticated LinkedIn state is already there.
- Keep extractor logic in the repo, not in `~/.bb-browser/sites`, because the repo
  is the durable system of record.
- Reuse `newgrad_scan` scoring rather than inventing `linkedin_scan` scoring for
  the first version.
- Use LinkedIn job-view URLs as pipeline URLs when external ATS URLs are hidden
  behind Apply buttons.
- Do not click Apply, Save, Dismiss, or message controls.
- For LinkedIn rows only, allow enriched rows that fail solely on the local
  `detail_value_threshold` gate to proceed to `newgrad_quick` evaluation as
  review fallback candidates. Keep seniority, sponsorship, clearance, salary,
  duplicate, and pipeline-threshold blockers intact; Apply Next remains governed
  by tracker status and model score.

## Risks And Blockers

- LinkedIn can change DOM structure. Mitigation: anchor on `data-job-id`,
  `/jobs/view/`, headings, and visible text rather than generated classes.
- LinkedIn can show login, checkpoint, or account-verification pages. Mitigation:
  detect those states and stop with manual recovery instructions.
- The current worktree has many unrelated uncommitted changes. Mitigation: keep
  implementation edits surgical and do not revert existing work.
- The `bb-browser` CLI is an external local dependency. Mitigation: check
  availability before running and fail clearly if absent.

## Failure Modes

| Codepath | Production failure | Test/error handling requirement | User-visible result |
|----------|--------------------|---------------------------------|---------------------|
| `bb-browser open/eval` | CLI missing or daemon unavailable | Script checks `bb-browser --version` before scan | Clear setup error |
| LinkedIn auth | Login redirect or checkpoint | Detect login/checkpoint text/title/URL | Manual login instruction |
| List extraction | No cards due DOM change | Score-only live check and zero-row diagnostic | Page title/URL in error |
| Detail extraction | Some job detail pages fail | Continue per-row, count failures | Summary with failed count |
| Source tagging | LinkedIn rows parsed as newgrad | Unit tests for `linkedin-scan` mapping | Prevented by tests |
| URL selection | Company homepage chosen over job view | Unit tests for LinkedIn job-view fallback | Prevented by tests |
| Apply safety | Scanner clicks mutating Apply button | Code review and integration inspection | Must never happen |

No planned failure mode should be silent; all have either a test or an explicit
error path.

## Progress Log

- 2026-04-21: Read project rules, existing `newgrad-scan`, `builtin-scan`,
  bridge adapters, extension extractors, and `bb-browser` docs.
- 2026-04-21: Confirmed `bb-browser` 0.11.3 is installed.
- 2026-04-21: Confirmed community LinkedIn adapters are profile/post search only,
  not Jobs search.
- 2026-04-21: Confirmed the user's `bb-browser` profile can access LinkedIn after
  login.
- 2026-04-21: Inspected the supplied LinkedIn Jobs page with `bb-browser` and
  captured stable first-version DOM anchors.
- 2026-04-21: Wrote this plan before implementation.
- 2026-04-21: Ran plan self-review and engineering review. Complexity is above
  the nominal 8-file smell threshold, but reducing scope would create parallel
  scanner logic or leave source tags untested. Scope remains accepted as the
  smallest complete repo-integrated path.
- 2026-04-21: Began implementation on `codex/linkedin-scan` because the current
  workspace had prerequisite uncommitted scanner work that a clean worktree would
  not contain.
- 2026-04-21: Added self-contained LinkedIn list/detail DOM extractors and
  verified `npm --prefix extension run typecheck`.
- 2026-04-21: Added LinkedIn normalizer helpers and verified
  `npm --prefix bridge run test -- src/adapters/linkedin-scan-normalizer.test.ts`.
- 2026-04-21: Added `linkedin-scan` source tag plumbing, pending/history parser
  support, and LinkedIn job-view URL selection.
- 2026-04-21: Verified shared source/link/pending/history coverage with
  `npm --prefix bridge run test -- src/adapters/newgrad-source.test.ts src/adapters/newgrad-links.test.ts src/adapters/newgrad-pending.test.ts src/adapters/newgrad-scan-history.test.ts src/adapters/linkedin-scan-normalizer.test.ts`.
- 2026-04-21: Added `scripts/linkedin-scan-bb-browser.ts`, `npm run
  linkedin-scan`, `/career-ops linkedin-scan` routing, mode docs, Codex docs,
  and OpenCode command discoverability.
- 2026-04-21: Verified `npm run linkedin-scan -- --help` after rerunning outside
  the sandbox because `tsx` needed a local IPC pipe.
- 2026-04-21: Live `--score-only --limit 5` smoke succeeded against the supplied
  LinkedIn URL with 5 rows extracted and 2 promoted, and no bridge write
  endpoints called.
- 2026-04-21: Live `--no-evaluate --enrich-limit 2` smoke succeeded against the
  supplied LinkedIn URL with 6 rows extracted, 2 detail pages enriched, and no
  evaluation jobs queued; the bridge skipped both rows at
  `detail_value_threshold`, so no live pipeline entry was added.
- 2026-04-21: Added a bridge adapter regression test proving a passing LinkedIn
  enriched row writes a `linkedin-scan` pipeline entry.
- 2026-04-21: Final verification passed: focused bridge tests, bridge
  typecheck, extension typecheck, script-level `tsc --noEmit`, live score-only
  smoke, live no-evaluate enrichment smoke, and `npm run verify`.
- 2026-04-21: Started a live Apply Next validation run at user request. Goal:
  prove whether `npm run linkedin-scan` can take real LinkedIn rows through
  extraction, scoring, detail enrichment, bridge write/evaluation, tracker merge,
  dashboard rebuild, and visible Apply Next data. Success criteria: score-only
  preview extracts/scored rows without writes; a capped live run either creates
  at least one evaluated tracker/report item visible in `web/index.html` Apply
  Next or reports the exact blocking filter; `data/pipeline.md`,
  `data/scan-history.tsv`, tracker/report changes, and dashboard rebuild are
  inspected; verification is recorded. Assumptions: the default mode may queue
  `newgrad_quick` evaluations, but it must never click LinkedIn Apply/Easy Apply
  or submit any application; if no candidate clears the enrichment/evaluation
  gates, the scanner can still be working but not feeding Apply Next. Uncertainty:
  the current LinkedIn search result set may only contain low-value or already
  seen roles. Simplest viable path: run `--score-only --limit 20`, then a small
  default run with `--enrich-limit`/`--evaluate-limit`, then rebuild the static
  dashboard and inspect its embedded data.
- 2026-04-21: Live Apply Next validation result: the LinkedIn scanner can
  extract, score, and enrich real LinkedIn Jobs rows, but the tested result sets
  did not enter Apply Next. Supplied 24h URL score-only extracted 6 rows and
  promoted 2 (`PwC - AI Engineer - Experienced Associate`, `Markel - Software
  Engineer`) with no writes. The capped write/evaluation run enriched both
  detail pages successfully, then bridge enrichment skipped both at
  `detail_value_threshold`, so `added=0`, `candidates=0`, and no evaluations
  were queued. A broader 24h `software engineer new grad` LinkedIn URL extracted
  6 rows and promoted 3; the capped write/evaluation run enriched all 3 and
  again skipped all 3 at `detail_value_threshold`. `data/pipeline.md` and
  `data/applications.md` were unchanged; `data/scan-history.tsv` recorded one
  additional filtered LinkedIn scan-history row (`Newmark - GIS Platform and
  Data Engineer`, `below_threshold`) from the broader search. Dashboard rebuild
  succeeded with 183 applications, 259 reports, 381 pipeline rows, and 836
  scan-history rows; Apply Next currently computes 14 priority and 17 selective
  rows, but none came from this `linkedin-scan` validation because no LinkedIn
  candidate survived to tracker/report evaluation. `npm run verify` passed with
  the existing duplicate warnings for RemoteHunter and Anduril.
- 2026-04-22: User flagged that 6 LinkedIn rows is too small and requested more
  realistic coverage with duplicate prevention and pagination/scrolling. New
  goal: improve the LinkedIn list collector so it accumulates rows while
  scrolling a virtualized results list instead of extracting only the final DOM
  window, reports raw-vs-deduped counts, and then run larger live score-only and
  capped write/evaluation tests. Success criteria: a larger LinkedIn query
  extracts substantially more than 6 unique rows when LinkedIn exposes them,
  duplicate row counts are visible, bridge score/history/pipeline/tracker
  dedupe gates still prevent repeated processing, and no mutating LinkedIn
  controls are clicked.
- 2026-04-22: Implemented larger LinkedIn collection without adding a parallel
  pipeline. Changes: added `buildLinkedInSearchPageUrls` with tests; added
  `--pages`, `--page-size`, and `--scroll-steps` to
  `scripts/linkedin-scan-bb-browser.ts`; defaulted LinkedIn `search-results`
  pagination to 6-result `start` offsets after live inspection showed
  `start=25` skipped past the available 18 results; moved per-page scrolling to
  short runner-level eval calls so bb-browser does not time out on one long page
  eval; added a zero-row retry for slow LinkedIn page hydration; updated
  `modes/linkedin-scan.md`.
- 2026-04-22: Larger live score-only passed. Command:
  `npm run linkedin-scan -- --url "https://www.linkedin.com/jobs/search-results/?keywords=software%20engineer%20new%20grad&location=United%20States&origin=JOB_SEARCH_PAGE_SEARCH_BUTTON&f_TPR=r86400" --score-only --pages 4 --limit 100`.
  Result: page counts 12 raw, 6 raw, 6 raw, 0 raw; 24 raw rows collapsed to 18
  unique rows after canonical LinkedIn URL dedupe; scoring promoted 5 and
  filtered 13. Top promoted rows were PwC AI Engineer, two Markel Software
  Engineer postings, and two Capital One Lead Software Engineer postings.
- 2026-04-22: Broader score-only volume check passed without writes. Command:
  `npm run linkedin-scan -- --url "https://www.linkedin.com/jobs/search-results/?keywords=software%20engineer&location=United%20States&origin=JOB_SEARCH_PAGE_SEARCH_BUTTON&f_TPR=r86400" --score-only --pages 8 --limit 60 --scroll-steps 0`.
  Result: pages returned 7, 7, 7, 7, 7, 6, 6, and 4 raw rows; 51 raw rows
  collapsed to 46 unique LinkedIn job URLs after dedupe; scoring promoted 11
  and filtered 35. This verifies pagination on a materially larger sample while
  still avoiding bridge write endpoints.
- 2026-04-22: Larger capped write/evaluation run passed but still did not add
  Apply Next candidates. Command:
  `npm run linkedin-scan -- --url "https://www.linkedin.com/jobs/search-results/?keywords=software%20engineer%20new%20grad&location=United%20States&origin=JOB_SEARCH_PAGE_SEARCH_BUTTON&f_TPR=r86400" --pages 4 --limit 100 --enrich-limit 5 --evaluate-limit 3`.
  Result: 30 raw rows collapsed to 18 unique rows; scoring promoted 5 and
  filtered 13; detail enrichment succeeded for all 5 promoted rows; bridge
  enrichment added 0 and skipped 5 (`detail_value_threshold`: 3,
  `seniority_too_high`: 2), so no direct evaluations were queued and no tracker
  rows entered Apply Next. `data/pipeline.md` and `data/applications.md` hashes
  stayed unchanged. `data/scan-history.tsv` now has 13 `linkedin-scan` rows with
  no duplicate LinkedIn URLs. Dashboard rebuild succeeded with 183 applications,
  259 reports, 381 pipeline rows, and 844 scan-history rows.
- 2026-04-22: Verification: focused normalizer tests passed (7 tests); bridge
  typecheck passed; extension typecheck passed; `npm run linkedin-scan -- --help`
  passed and documents the new pagination/scroll options. `npm run verify` ran
  after dashboard rebuild but failed because two existing batch-runner e2e tests
  exceeded Vitest's default 5s timeout; rerunning
  `npm --prefix bridge exec -- vitest run src/batch/batch-runner.e2e.test.ts --testTimeout=20000`
  passed 2/2 tests. Recorded that timeout mismatch in
  `docs/exec-plans/tech-debt-tracker.md`.
- 2026-04-22: User requested a fix so LinkedIn rows stopped by the bridge
  enrichment gate can still enter Apply Next. Goal: let LinkedIn-enriched rows
  that only miss the local detail value threshold proceed to real
  `newgrad_quick` evaluation, where the model/report/tracker path decides
  whether they appear in Apply Next. Scope: do not lower global scanner
  thresholds, do not bypass clear hard blockers, do not click LinkedIn Apply,
  and do not fabricate tracker scores. Success criteria: LinkedIn rows skipped
  specifically by `detail_value_threshold` are queued as review candidates for
  evaluation; rows with `seniority_too_high`, sponsorship, clearance, duplicate,
  or below-pipeline blockers remain filtered; tracker/report/dashboard output
  proves whether the evaluated rows enter Apply Next.
- 2026-04-22: Implemented the LinkedIn review fallback in
  `scripts/linkedin-scan-bb-browser.ts`. The fallback reuses existing profile
  scoring, constructs candidates only from enriched LinkedIn rows that miss the
  detail value threshold, keeps hard-blocker penalties filtered, and dedupes
  evaluation candidates by both canonical URL and normalized company/role.
- 2026-04-22: Live fallback verification against the `software engineer new
  grad` LinkedIn search succeeded. Command:
  `npm run linkedin-scan -- --url "https://www.linkedin.com/jobs/search-results/?keywords=software%20engineer%20new%20grad&location=United%20States&origin=JOB_SEARCH_PAGE_SEARCH_BUTTON&f_TPR=r86400" --pages 4 --limit 100 --enrich-limit 5 --evaluate-limit 3`.
  Result: 30 raw rows collapsed to 18 unique rows; 5 detail pages enriched; the
  bridge still skipped all 5 (`detail_value_threshold`: 3,
  `seniority_too_high`: 2), then the fallback queued the 3 value-threshold rows
  for direct evaluation. All 3 evaluations completed and tracker merge reported
  success. Model scores were PwC 2/5, Markel 1.4/5, and Markel 1.4/5, so the
  generated tracker rows were SKIP/low-score records rather than Apply Next
  records.
- 2026-04-22: Added same-company/same-role evaluation dedupe after the first
  fallback run showed duplicate Markel Software Engineer cards could consume
  evaluation slots.
- 2026-04-22: Larger live fallback verification against the broader `software
  engineer` LinkedIn search succeeded. Command:
  `npm run linkedin-scan -- --url "https://www.linkedin.com/jobs/search-results/?keywords=software%20engineer&location=United%20States&origin=JOB_SEARCH_PAGE_SEARCH_BUTTON&f_TPR=r86400" --pages 8 --limit 60 --scroll-steps 0 --enrich-limit 10 --evaluate-limit 5`.
  Result: 51 raw rows collapsed to 45 unique rows; 7 detail pages enriched; the
  bridge skipped all 7 (`detail_value_threshold`: 2, `salary_below_minimum`: 1,
  `seniority_too_high`: 2, `pipeline_threshold`: 2), then the fallback queued
  the 2 value-threshold rows for direct evaluation. Both evaluations completed
  and tracker merge reported success. Model scores were Capital One
  Distinguished AI Engineer 1/5 and Morton Software Engineer III 1.2/5, so they
  also remained SKIP/low-score records.
- 2026-04-22: Dashboard rebuild after the live fallback runs succeeded with 264
  reports, 187 applications, 381 pipeline rows, and 865 scan-history rows.
  `data/applications.md` now contains LinkedIn-sourced tracker rows for PwC,
  Markel, Capital One, and Morton, proving LinkedIn fallback rows now enter the
  report/tracker path. Apply Next still has 31 rows, and none of the newly
  evaluated LinkedIn rows qualifies because their model scores are below 3.5 or
  their status is SKIP.
- 2026-04-22: Verification for the fallback change: `npm --prefix bridge run
  typecheck` passed; `npm run linkedin-scan -- --help` passed;
  `npm --prefix bridge run test --
  src/adapters/linkedin-scan-normalizer.test.ts
  src/adapters/claude-pipeline.test.ts
  src/adapters/newgrad-value-scorer.test.ts` passed with 27 tests.
- 2026-04-22: User requested `/career-ops linkedin-scan`. Goal: run the existing
  LinkedIn Jobs scanner against the documented 24-hour search path and report
  concrete extraction, scoring, enrichment, write, evaluation, and dashboard
  results. Success criteria: bridge health is verified; `bb-browser` is
  available and LinkedIn is not blocked by login/checkpoint; `--score-only`
  preview runs before writes; bounded enrich/write records either qualifying
  `linkedin-scan` candidates or exact skip reasons; dashboard and relevant
  verification complete; this plan records the final outcome. Assumptions: no
  `config/profile.yml -> linkedin_scan.search_url` is configured, so use the
  documented 24-hour LinkedIn Jobs URL; follow the mode's conservative
  `--no-evaluate --enrich-limit 5` write path for this run; do not click any
  LinkedIn Apply, Easy Apply, Save, Dismiss, message, or recruiter controls.
- 2026-04-22: Operational recovery before the run: `bb-browser` 0.11.3 was
  available, but the managed browser initially had no page targets, causing
  `bb-browser open` to fail with `No page target found`. Created a blank managed
  tab with `bb-browser tab new --json`, then reran the scanner. The first bridge
  instance was started without `CAREER_OPS_BRIDGE_MODE=real`, so its enrich
  summary was fake/non-durable; restarted the bridge as
  `CAREER_OPS_BRIDGE_MODE=real npm --prefix bridge run start` and reran the
  documented preview/write sequence before relying on results.
- 2026-04-22: Real-mode no-write preview passed. Command:
  `npm run linkedin-scan -- --url "https://www.linkedin.com/jobs/search-results/?currentJobId=4347121472&keywords=software%20ai%20engineer%20new%20graduate%20job%20posted%20in%20the%20past%2024%20hours&origin=JOB_SEARCH_PAGE_JOB_FILTER&f_TPR=r86400" --score-only --limit 20`.
  Result: 18 raw LinkedIn rows, 6 unique after canonical URL dedupe, 1 promoted,
  5 filtered, no bridge write endpoints called. Promoted row: Capital One -
  Machine Learning Engineering - Intelligent Foundations and Experiences (IFX),
  score 5/9, `https://www.linkedin.com/jobs/view/4405249033/`.
- 2026-04-22: Real-mode bounded enrich/write run completed without pipeline
  additions. Command:
  `npm run linkedin-scan -- --url "https://www.linkedin.com/jobs/search-results/?currentJobId=4347121472&keywords=software%20ai%20engineer%20new%20graduate%20job%20posted%20in%20the%20past%2024%20hours&origin=JOB_SEARCH_PAGE_JOB_FILTER&f_TPR=r86400" --no-evaluate --enrich-limit 5`.
  Result: 12 raw rows, 6 unique after dedupe, 1 promoted, 5 filtered; detail
  enrichment succeeded for the 1 promoted row; bridge enrich reported
  `added=0`, `skipped=1`, `candidates=0`, skip breakdown
  `{"detail_value_threshold":1}`. Direct evaluation was disabled by
  `--no-evaluate`, so no tracker/report evaluation was queued. `data/pipeline.md`
  stayed at 389 dashboard entries; `data/applications.md` and reports stayed at
  193 and 273 dashboard entries. `data/scan-history.tsv` gained 3 durable
  LinkedIn filtered rows from this search: Capital One Manager, Ontology & Data
  Modeling; Deloitte Cyber Fullstack Senior Engineer/Senior Consultant; and PwC
  AI Engineer / Data Scientist, AI Senior Associate, all as `negative_title`.
- 2026-04-22: Dashboard rebuild and verification passed. `npm run dashboard`
  wrote `web/index.html` with reports=273, applications=193, pipeline=389, and
  scan-history=932. `npm run linkedin-scan -- --help` passed. `npm run verify`
  passed with 0 errors and 2 pre-existing duplicate warnings:
  RemoteHunter - Software Engineer (#271/#272) and Anduril Industries -
  Software Engineer (#3/#8/#9).
- 2026-04-22: User asked why the LinkedIn scan found so few rows and requested a
  larger scan. Diagnosis: the previous command intentionally used the documented
  narrow 24-hour LinkedIn URL, one LinkedIn result page, and the conservative
  `--no-evaluate` path; LinkedIn `search-results` exposes only a small
  virtualized page window per offset, and existing scan-history/pipeline dedupe
  plus new-grad fit filters reduce promoted rows further. New goal: scan a
  larger paginated LinkedIn sample while preserving safety and repo durability.
  Success criteria: run larger no-write previews with `--pages`/`--limit`, use
  the query with better volume and relevance for bounded write/evaluation, never
  click mutating LinkedIn controls, rebuild the dashboard, run verification, and
  record exact counts and blockers here.
- 2026-04-22: Larger preview and interrupted write/evaluation attempt before
  user correction. New-grad query
  `software engineer new grad` with `--score-only --pages 8 --limit 100
  --scroll-steps 1` produced 16 raw rows, 15 unique rows, 4 promoted, and 11
  filtered. Broader entry-level query `software engineer` with `f_E=2` and
  `--score-only --pages 10 --limit 120 --scroll-steps 0` produced 62 raw rows,
  55 unique rows, 9 promoted, and 46 filtered. A bounded real/Claude run on the
  broader query produced 69 raw rows, 61 unique rows, 9 promoted, 52 filtered,
  and 9/9 enriched details; bridge enrich skipped all 9 (`seniority_too_high`:
  4, `detail_value_threshold`: 4, `pipeline_threshold`: 1), then queued 4
  fallback evaluations. All 4 evaluations failed under the accidentally selected
  real/Claude bridge. User then interrupted and clarified two requirements:
  click non-Easy-Apply Apply to discover ATS URLs, and run enrich/evaluation
  through Codex rather than Claude.
- 2026-04-22: Updated implementation plan for the correction. Scope: add an
  explicit `--open-external-apply` option that may click only LinkedIn
  non-Easy-Apply Apply controls, records any external ATS URL, closes any opened
  tab after URL capture, and never submits, fills, or advances an external
  application form. Also update the mode to start `npm run ext:bridge`, which
  runs the bridge in `real/codex` mode. Success criteria: help text documents
  the option, mode docs encode the new safety rule, typecheck/help verification
  pass, live bridge health shows `realExecutor=codex`, and a bounded live scan
  proves whether external Apply URLs are captured.
- 2026-04-22: Implemented the correction. `scripts/linkedin-scan-bb-browser.ts`
  now supports `--open-external-apply`, clicks only visible non-Easy-Apply Apply
  controls, captures external URLs from direct hrefs, opened tabs, current-tab
  navigation, nested redirect parameters, and post-click resource URLs, then
  closes any opened tab. `modes/linkedin-scan.md` now requires `npm run
  ext:bridge` and records the safety rule: no Easy Apply, no form fill, no form
  submit, and no external form advancement. `bridge/src/adapters/newgrad-links.ts`
  now prefers non-LinkedIn Apply-flow URLs over LinkedIn job-view fallbacks, with
  tests for Truist and Appcast/Prng-style Apply redirect URLs.
- 2026-04-22: Live smoke in `real/codex` mode passed. Health showed
  `execution.mode=real` and `execution.realExecutor=codex`. Command:
  `npm run linkedin-scan -- --url "https://www.linkedin.com/jobs/search-results/?keywords=software%20engineer&location=United%20States&origin=JOB_SEARCH_PAGE_SEARCH_BUTTON&f_TPR=r86400&f_E=2" --pages 3 --limit 30 --scroll-steps 0 --open-external-apply --no-evaluate --enrich-limit 2`.
  Result: 21 raw rows, 19 unique rows, 4 promoted, 15 filtered; detail
  enrichment succeeded for 2/2; external Apply URLs were captured for Jobs via
  Dice and Capital One; bridge enrich skipped both (`detail_value_threshold`: 1,
  `seniority_too_high`: 1); no evaluation was queued because `--no-evaluate`
  was set.
- 2026-04-22: Final larger `real/codex` scan passed. Command:
  `npm run linkedin-scan -- --url "https://www.linkedin.com/jobs/search-results/?keywords=software%20engineer&location=United%20States&origin=JOB_SEARCH_PAGE_SEARCH_BUTTON&f_TPR=r86400&f_E=2" --pages 10 --limit 120 --scroll-steps 0 --open-external-apply --enrich-limit 9 --evaluate-limit 5`.
  Result: 55 raw rows, 51 unique rows, 7 promoted, 44 filtered; detail
  enrichment succeeded for 7/7; external Apply URLs were captured for all 7
  promoted rows: Capital One Back End (`https://dsp.prng.co/kgvoqtb`), Jobs via
  Dice (`https://click.appcast.io/t/orxmr7zovw5kwrxqxs59tkxrb40gyhc5e4lxuxd0rd4=`),
  Morton (`https://jobs.themortonway.com/full-stack-engineer-8826-jobs-in-richmond-virginia/14030146`),
  Truist (`https://careers.truist.com/us/en/job/tbjtbfusr0103225externalenus/software-engineer-iii-real-estate-mortgage-servicing?source=linkedin&utm_medium=phenom-feeds&utm_source=linkedin`),
  Capital One Bank Tech (`https://dsp.prng.co/zqlu7rb`), Capital One Cyber
  (`https://dsp.prng.co/j3vog8b`), and Genworth
  (`https://careers.genworth.com/us/en/job/gfogfyusreq250526externalenus/cloud-solutions-architect?utm_medium=phenom-feeds&utm_source=linkedin`).
  Bridge enrich skipped all 7 (`seniority_too_high`: 3,
  `detail_value_threshold`: 3, `pipeline_threshold`: 1), then LinkedIn fallback
  sent 3 value-threshold rows through Codex quick evaluation. Codex completed
  3/3: Jobs via Dice 1.6/5 report 306, Morton 1.2/5 report 307, Truist 1.2/5
  report 308. Tracker merge succeeded for all three as `SKIP`, so no new Apply
  Next rows were created.
- 2026-04-22: Corrected generated report URL metadata for reports 306-308 to
  the captured external Apply URLs after the URL selector fix. Dashboard rebuild
  passed with reports=276, applications=196, pipeline=389, scan-history=970.
  Verification passed: focused link/normalizer tests passed (20 tests), bridge
  typecheck passed, extension typecheck passed, script ESM typecheck passed,
  `npm run linkedin-scan -- --help` passed, and final `npm run verify` passed
  with 0 errors and the same 2 pre-existing duplicate warnings:
  RemoteHunter - Software Engineer (#271/#272) and Anduril Industries -
  Software Engineer (#3/#8/#9).
- 2026-04-22: User challenged that external ATS URL capture is still
  under-enriched because ATS pages often contain fuller JD text, and requested
  Codex as the default executor for both LinkedIn scan and newgrad scan. Goal:
  after capturing a non-Easy-Apply external ATS URL, open that external page,
  read its job-description text, merge that text into `NewGradDetail`, and use
  the merged detail for bridge enrich and Codex evaluation. Also make
  `CAREER_OPS_BRIDGE_MODE=real` default to `CAREER_OPS_REAL_EXECUTOR=codex`
  when the executor env var is omitted, and update newgrad/linkedin mode docs to
  start `npm run ext:bridge`. Success criteria: external ATS detail character
  counts appear in live scan logs, evaluation page text contains external ATS
  detail, real bridge health defaults to Codex, focused tests/typechecks pass,
  and no application form is filled/submitted/advanced.
- 2026-04-22: Implemented external ATS detail enrichment and Codex defaults.
  After `--open-external-apply` captures an external URL, the scanner now opens
  that URL in `bb-browser`, reads generic ATS/job-page text, extracts title,
  location, salary, work model, requirements, responsibilities, and skill tags
  where visible, then merges the external ATS text ahead of the LinkedIn detail
  excerpt before bridge enrich/evaluation. Short redirect pages that expose no
  readable JD remain URL-only. `CAREER_OPS_BRIDGE_MODE=real` now defaults
  `CAREER_OPS_REAL_EXECUTOR` to `codex` when unset; `claude` remains available
  only by explicit `CAREER_OPS_REAL_EXECUTOR=claude`. Updated
  `modes/newgrad-scan.md`, `modes/linkedin-scan.md`, and
  `docs/BROWSER_EXTENSION.md` to reflect Codex-default bridge startup and the
  external ATS detail behavior.
- 2026-04-22: Verification for the correction passed. Focused tests passed:
  `npm --prefix bridge run test -- src/adapters/newgrad-links.test.ts
  src/adapters/linkedin-scan-normalizer.test.ts src/adapters/claude-pipeline.test.ts`
  with 36 tests. `npm --prefix bridge run typecheck` passed. Script ESM
  typecheck passed. `npm run linkedin-scan -- --help` passed and documents that
  `--open-external-apply` opens the external ATS URL and reads JD text. Starting
  the bridge with only `CAREER_OPS_BRIDGE_MODE=real npm --prefix bridge run
  start` produced health `execution.realExecutor=codex`, proving the new default.
- 2026-04-22: Live external ATS detail smoke passed. Query:
  `cloud solutions architect genworth`, `--pages 2 --limit 20 --scroll-steps 0
  --open-external-apply --no-evaluate --enrich-limit 3`. Result: 13 raw rows,
  13 unique, 3 promoted, 10 filtered; external Apply URLs were captured for two
  Jobs via Dice rows and Genworth. The Genworth ATS page was opened and yielded
  `External ATS detail: 402 chars` from the employer careers URL, then bridge
  enrich skipped all 3 (`detail_value_threshold`: 2, `seniority_too_high`: 1).
  No evaluation was queued because `--no-evaluate` was set. Dashboard rebuild
  passed with reports=276, applications=196, pipeline=389, scan-history=972.
  Final `npm run verify` passed with 0 errors and the same 2 pre-existing
  duplicate warnings.
- 2026-04-22: User requested a fresh rerun experiment after the external ATS
  detail and Codex-default changes. Goal: run the latest LinkedIn scanner
  end-to-end enough to prove the corrected behavior, not merely inspect code.
  Success criteria: bridge health shows `execution.mode=real` and
  `execution.realExecutor=codex` with no executor env override; score-only
  preview confirms realistic row volume; bounded live run uses
  `--open-external-apply`, captures external Apply URLs, logs external ATS
  detail character counts when JD text is available, sends eligible rows through
  Codex evaluation, rebuilds dashboard, runs verification, and records exact
  counts here. Assumption: do not submit, fill, save, Easy Apply, or advance any
  external application form.
- 2026-04-22: Fresh rerun bridge health passed. Started with only
  `CAREER_OPS_BRIDGE_MODE=real npm --prefix bridge run start`; health showed
  `execution.mode=real` and `execution.realExecutor=codex`, proving the Codex
  default without `CAREER_OPS_REAL_EXECUTOR`.
- 2026-04-22: Fresh score-only preview passed. Command:
  `npm run linkedin-scan -- --url "https://www.linkedin.com/jobs/search-results/?keywords=software%20engineer&location=United%20States&origin=JOB_SEARCH_PAGE_SEARCH_BUTTON&f_TPR=r86400&f_E=2" --score-only --pages 10 --limit 120 --scroll-steps 0`.
  Result: 69 raw LinkedIn rows, 61 unique after dedupe, 6 promoted, 55 filtered.
  LinkedIn exposed 6-7 list rows per page through the current virtualized jobs
  result window. No bridge write endpoints were called.
- 2026-04-22: Fresh bounded live run passed. Command:
  `npm run linkedin-scan -- --url "https://www.linkedin.com/jobs/search-results/?keywords=software%20engineer&location=United%20States&origin=JOB_SEARCH_PAGE_SEARCH_BUTTON&f_TPR=r86400&f_E=2" --pages 10 --limit 120 --scroll-steps 0 --open-external-apply --enrich-limit 6 --evaluate-limit 3`.
  Result: same 69 raw / 61 unique / 6 promoted pool. Detail enrichment attempted
  6 promoted rows, enriched 5, and failed 1 LinkedIn detail read with
  `Unterminated string in JSON at position 8192`. The run captured external
  Apply URLs for all 5 enriched rows. Genworth's external Phenom ATS page was
  opened and yielded `External ATS detail: 402 chars` from the employer careers
  URL. Bridge enrich added 0 rows, skipped 5, and produced 0 normal candidates;
  skip breakdown was `seniority_too_high`: 4 and `detail_value_threshold`: 1.
  The LinkedIn review fallback queued the 1 value-threshold row for direct
  Codex evaluation; direct evaluation completed 1/1 and generated
  `reports/309-capital-one-2026-04-22.md` with score 2/5, Decision `skip`, and
  tracker merge `true`.
- 2026-04-22: Fresh rerun interpretation: the small evaluation count came from
  filtering, not from list extraction stopping early. The observed funnel was
  69 raw -> 61 unique -> 6 promoted -> 5 enriched -> 0 normal pipeline
  candidates -> 1 fallback Codex evaluation. For larger useful output, use a
  broader or more entry-level query and/or revisit the seniority/detail-value
  thresholds; the external Apply click-through and ATS/JD text merge now have
  live evidence.
- 2026-04-22: Dashboard rebuild after the rerun succeeded:
  `npm run dashboard` wrote `web/index.html` with reports=277,
  applications=197, pipeline=389, scan-history=975. Verification ultimately
  passed: an initial full `npm run verify` and a second full run hit unrelated
  5s Vitest timeouts under load; the failed tests then passed when rerun
  directly, the real bridge was stopped, and the final full `npm run verify`
  passed with 0 errors and the same 2 pre-existing duplicate warnings.
- 2026-04-22: Post-rerun report review found one remaining URL metadata gap:
  fallback evaluation report 309 used the LinkedIn job-view URL even though the
  row had captured `https://dsp.prng.co/voof7ub`. Root cause: URL selection
  scored LinkedIn job views higher than opaque external Apply redirects when
  both were present in `applyFlowUrls`. Fixed `pickPipelineEntryUrl` to prefer a
  non-LinkedIn Apply-flow URL before scoring mixed Apply-flow candidates, added
  a `dsp.prng.co` regression test, corrected report 309's URL metadata to the
  captured external Apply URL, rebuilt the dashboard, and reran verification.
  `npm --prefix bridge run test -- src/adapters/newgrad-links.test.ts` passed
  14 tests, `npm --prefix bridge run typecheck` passed, and final
  `npm run verify` passed with 0 errors and the same 2 pre-existing duplicate
  warnings.
- 2026-04-23: User reported that `newgrad_quick` prompt `pageText` for LinkedIn
  fallback enrichment can be badly inaccurate: the supplied Capital One sample
  contained mostly LinkedIn shell/footer text (`Looking for talent?`, language
  selector, privacy links) instead of the job description. Goal: find the root
  cause and stop low-quality LinkedIn chrome text from reaching the quick
  screening model. Success criteria: identify the failing extraction path, add a
  targeted guard or regression test, keep changes scoped to LinkedIn detail text
  handling / quick prompt construction, and run focused verification.
  Assumptions: do not browse LinkedIn or submit applications; use repository
  code and the supplied prompt sample as the reproduction. Uncertainties: whether
  the bad text came from the LinkedIn detail extractor, external ATS fallback, or
  the final quick-evaluation prompt assembly. Simplest viable path: trace
  `extractLinkedInDetail -> mergeExternalAtsDetail -> buildEvaluationPageText ->
  buildQuickEvaluationPrompt`, then reject LinkedIn shell-only excerpts at the
  earliest reliable point and add prompt-boundary coverage.
- 2026-04-23: Root cause found. `extractLinkedInDetail` accepted broad fallback
  containers (`.jobs-search__job-details`, then `main`) as `detail.description`
  whenever LinkedIn did not expose a real `.jobs-description...` body. On thin
  LinkedIn detail pages, that fallback can contain title metadata plus LinkedIn
  CTA/footer chrome, and `buildEvaluationPageText` then labeled it as
  `Description excerpt` for `newgrad_quick`. The Capital One sample matches this
  failure mode exactly; it was not a model issue.
- 2026-04-23: Implemented a scoped fix. `extension/src/content/extract-linkedin.ts`
  now cleans candidate description text, stops at LinkedIn footer/chrome lines,
  and only accepts a broad LinkedIn detail container when the remaining text has
  likely JD signals. `bridge/src/adapters/claude-pipeline.ts` now also sanitizes
  quick-evaluation `pageText` at the prompt boundary for LinkedIn job text, so a
  shell-only `Description excerpt` is stripped even if stale or alternate
  extractors provide it. Added a regression test using the supplied Capital One
  shape so LinkedIn chrome/footer text cannot silently re-enter quick prompts.
- 2026-04-23: Verification passed. Focused checks:
  `npm --prefix bridge run test -- src/adapters/claude-pipeline.test.ts` passed
  with 17 tests, `npm --prefix bridge run typecheck` passed,
  `npm --prefix extension run typecheck` passed, `npm run ext:build` passed, and
  `npm run linkedin-scan -- --help` passed. Final `npm run verify` passed with
  0 errors and the same 2 pre-existing duplicate warnings:
  RemoteHunter - Software Engineer (#271/#272) and Anduril Industries -
  Software Engineer (#3/#8/#9). `git diff --check` passed.
- 2026-04-23: User requested a real walkthrough of the LinkedIn scan path after
  the text-cleanup fix, especially the `bb-browser` stages, and explicitly
  asked to verify that after reaching the LinkedIn job page the scanner clicks
  Apply through to the company/ATS JD page to gather useful information. Goal:
  run a bounded live scan with `--open-external-apply`, prove whether useful
  LinkedIn detail and external ATS/company JD text are captured, and avoid
  Easy Apply, form filling, or submission. Success criteria: bridge/bb-browser
  readiness checked, score-only list extraction succeeds or reports a concrete
  auth/runtime blocker, capped detail enrichment logs external Apply URL
  capture, external JD character counts are recorded when available, and any
  remaining extraction gaps are captured here with verification results.
- 2026-04-23: Live `bb-browser` walkthrough found two current-runtime issues.
  First, the managed browser initially had CDP connected but no page target, so
  `bb-browser` commands reported `No page target found`; restarting the daemon
  and opening a seed tab restored normal tab control. Second, the current
  LinkedIn search DOM for the Capital One sample exposed zero `[data-job-id]`
  cards even though the page visibly showed 25 results and a selected
  `currentJobId=4405249033`; this made the list extractor return 0 rows.
  Implemented a selected-job fallback that reconstructs one row from the current
  job id, document title, visible company/location lines, and the selected list
  block. Also added a wait for either `[data-job-id]` cards or the current
  selected-job/search-result state before extraction. Verification:
  `npm run linkedin-scan -- --url "...software engineer new grad..." --score-only
  --pages 1 --limit 5 --scroll-steps 0` now reports 1 raw row / 1 unique row and
  no bridge writes.
- 2026-04-23: Tightened the selected-job fallback after live validation showed
  the first implementation could read into the next visible listing and mark the
  Capital One row as `Remote` from the following Affirm row. The fallback now
  stops at the selected job's posted-age lines and derives work model from the
  selected location/block only. Directly executing the exported extractor in the
  live LinkedIn tab now returns the Capital One row with `location:
  Richmond, VA`, empty `workModel`, and qualifications limited to the selected
  Capital One list block. The row is still filtered in score-only mode because
  it is already tracked in `data/applications.md` as report 309, so the safe
  full CLI run does not enter enrichment for this exact job.
- 2026-04-23: Verified the LinkedIn detail and external Apply path read-only.
  Direct execution of `extractLinkedInDetail` on
  `https://www.linkedin.com/jobs/view/4405249033/` now returns an empty
  description instead of the previous LinkedIn shell/footer text, preventing bad
  `pageText` from reaching quick evaluation. The visible LinkedIn Apply control
  is a non-Easy-Apply company apply link with a LinkedIn safety URL containing
  the nested external target `https://dsp.prng.co/VoOf7Ub`. Opening that target
  resolves to Capital One Careers at
  `capitalonecareers.com/job/-/-/234/94221963088...`; the page has a clean
  `.ats-description` block with 7,299 characters containing responsibilities,
  Basic Qualifications, the explicit no-sponsorship statement, and the
  `$147,100 - $167,900` salary range. Updated the external ATS extractor to
  prefer `ats-description` selectors before broader `job-description` shells.
- 2026-04-23: Verification passed after the live-flow fixes. Commands:
  `npm --prefix extension run typecheck`, `npm --prefix bridge run test --
  src/adapters/claude-pipeline.test.ts`, `npm run linkedin-scan -- --help`,
  `npm run ext:build`, `npm --prefix bridge run typecheck`,
  `npm run linkedin-scan -- --url "...software engineer new grad..."
  --score-only --pages 1 --limit 5 --scroll-steps 0`, `npm run verify`, and
  `git diff --check`. `npm run verify` reports 0 errors and the existing 2
  duplicate warnings for RemoteHunter (#271/#272) and Anduril (#3/#8/#9).
  Remaining gap: LinkedIn's current DOM fallback recovers only the selected job
  when `[data-job-id]` cards are absent; full multi-row extraction from that DOM
  shape remains future work.

## Plan Eng Review

### Step 0: Scope Challenge

Existing code already solves the downstream scanner work:

- `newgrad-scan` provides scoring, enrichment, pipeline writes, history writes,
  and direct evaluation.
- `builtin-scan` provides the precedent for mapping another job source into
  `NewGradRow` and `NewGradDetail`.
- `bb-browser` provides the authenticated LinkedIn browser transport.

The minimum complete implementation is still cross-cutting because a new source
must be recognized by extraction, source tagging, URL selection, pending parsing,
mode routing, docs, and tests. A smaller `bb-browser`-only adapter would be
shorter but would violate the repository-as-source-of-record rule and create a
parallel pipeline.

Search check:

- [Layer 1] Reuse browser DOM extraction and existing bridge endpoints already in
  this repo.
- [Layer 1] Use `bb-browser` as documented: open/eval/fetch against the user's
  real browser login state.
- [Layer 3] Do not click LinkedIn Apply to discover external URLs; preserving
  read-only behavior is more important than extracting every ATS link.

TODOS cross-reference:

- `TODOS.md` has no item blocking this plan.
- No deferred item should be bundled into this work.

Distribution check:

- No new external artifact type is introduced. The scanner is exposed through
  existing npm scripts and `/career-ops` mode routing.

### Architecture Review

No blocking architecture issue found. The plan reuses existing boundaries:

```text
bb-browser transport -> source extractor -> existing bridge scorer/enricher -> pipeline/eval
```

Realistic failure scenario: LinkedIn redirects to login or checkpoint. The plan
accounts for this with explicit login/checkpoint detection before scoring.

Realistic failure scenario: LinkedIn changes result card classes. The plan avoids
generated classes and anchors on `data-job-id`, `/jobs/view/`, headings, and
visible text semantics.

### Code Quality Review

No blocking code-quality issue found. The main DRY risk is duplicating
`newgrad-scan-autonomous.ts`; the plan keeps the LinkedIn runner source-specific
while reusing the same bridge endpoints and contracts. During implementation,
shared helpers should only be extracted if duplication becomes concrete across
the two autonomous scripts.

### Test Review

Coverage diagram is included above. The plan currently identifies 20 required
test/verification paths because no implementation exists yet. This is acceptable
for plan stage; implementation must not be declared complete until those gaps are
closed or explicitly removed from scope.

Test plan artifact:

```text
~/.gstack/projects/Jaydccq-career-ops/hongxichen-main-eng-review-test-plan-20260421-175927.md
```

No prompt/LLM template changes are planned, so no eval suite is required beyond
the existing direct-evaluation smoke path.

### Performance Review

No blocking performance issue found. The plan limits LinkedIn detail enrichment
with `--limit`, `--enrich-limit`, and existing batch-style throttling. Pagination
is intentionally out of scope for the first version to avoid aggressive LinkedIn
traffic and larger blast radius.

### Review Completion Summary

- Step 0: Scope Challenge — scope accepted as-is; complexity smell noted but
  reduction would create weaker parallel logic.
- Architecture Review: 0 blocking issues found.
- Code Quality Review: 0 blocking issues found.
- Test Review: diagram produced, 20 planned verification gaps identified.
- Performance Review: 0 blocking issues found.
- NOT in scope: written.
- What already exists: written.
- TODOS.md updates: 0 items proposed.
- Failure modes: 0 critical silent gaps flagged.
- Outside voice: skipped.
- Lake Score: 1/1 recommendation chose the complete option.

## Final Outcome

Implemented. `/career-ops linkedin-scan` now routes to `modes/linkedin-scan.md`,
`npm run linkedin-scan` runs the `bb-browser` LinkedIn Jobs scanner, LinkedIn
rows flow through the existing newgrad scorer/enricher as `linkedin-scan`, and
targeted tests cover source tags, pending/history parsing, URL selection,
normalization, and pipeline writes for passing LinkedIn rows. The scanner also
supports multi-page LinkedIn search offsets, per-page scroll probes, raw-vs-
unique count reporting, and evaluation candidate dedupe by URL and company/role.

Live verification against the supplied LinkedIn URL succeeded for score-only
list extraction/scoring and bounded no-evaluate detail enrichment. The live
LinkedIn rows observed during the no-evaluate smoke did not pass the existing
`detail_value_threshold`, so that run wrote no pipeline entry; a deterministic
bridge regression test proves pipeline writes for LinkedIn rows that do pass.

Follow-up live verification on 2026-04-22 added a LinkedIn-specific review
fallback for rows that only miss the detail value threshold. Real LinkedIn rows
now enter direct evaluation and tracker/report merge through this fallback. The
tested LinkedIn rows did not enter Apply Next because the model scored them
1.0-2.0/5 and marked them SKIP; Apply Next still requires `Evaluated` tracker
status and score >= 3.5.

Follow-up correction on 2026-04-22 added explicit read-only external Apply
probing with `--open-external-apply`. The scanner skips Easy Apply and mutating
controls, captures non-LinkedIn Apply URLs, opens the external ATS page when
available, and merges readable ATS/JD text into the detail payload before bridge
enrichment/evaluation. Real-mode bridge startup now defaults to Codex when
`CAREER_OPS_REAL_EXECUTOR` is unset; Claude is only selected explicitly.

Fresh rerun verification on 2026-04-22 used a 10-page LinkedIn software
engineer query and observed 69 raw / 61 unique / 6 promoted. The bounded live
run captured external Apply URLs for 5 enriched rows, read 402 characters from a
Genworth external ATS page, completed 1/1 Codex fallback evaluation, generated
`reports/309-capital-one-2026-04-22.md`, then corrected fallback URL selection
so opaque external Apply redirects beat LinkedIn job-view fallbacks. Report 309
now records the captured external Apply URL. The dashboard was rebuilt, and
final `npm run verify` passed with 0 errors and 2 pre-existing duplicate
warnings.

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | - | - |
| Codex Review | `/codex review` | Independent 2nd opinion | 0 | - | - |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 2 | clean | 0 blocking issues, 0 critical gaps |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | - | - |

**VERDICT:** ENG CLEARED - ready to implement the plan.
