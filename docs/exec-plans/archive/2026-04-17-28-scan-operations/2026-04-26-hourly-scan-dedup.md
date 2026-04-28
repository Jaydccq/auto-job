# Hourly Scan Dedup

## Background

The hourly automation runs multiple discovery sources and then may run capped
`newgrad_quick` evaluations. Existing deduplication covers many single-source
cases, but repeated hourly runs can still re-evaluate the same posting when it
appears through a different source URL or a URL variant.

## Goal

Prevent hourly scans from spending evaluation capacity on jobs already evaluated
or tracked by the repository.

## Scope

- Reuse existing scanner, bridge, tracker, and report artifacts.
- Add repository-backed duplicate detection across report URLs and
  company-role identities.
- Apply the duplicate check before direct evaluations are queued.
- Add focused regression coverage.

Out of scope:
- Submitting applications or interacting with apply/save/upload controls.
- Replacing the scanner architecture.
- Broad cleanup of existing active execution plans.

## Assumptions

- A normalized company + normalized role match is an acceptable duplicate signal
  for hourly automation, even when source URLs differ.
- Reports and `data/applications.md` are durable evidence that a role has
  already consumed evaluation attention.
- Manual/policy reruns should remain possible through existing explicit rerun
  signals.

## Implementation Steps

1. Add evaluated-job identity loading from reports.
   Verify: unit test covers URL canonicalization and company-role extraction.
2. Feed evaluated identities into scanner/pending/enrich dedup checks.
   Verify: targeted adapter tests pass.
3. Filter direct-evaluation candidates against evaluated reports and tracker
   rows before queueing.
   Verify: script type checks pass.
4. Update this plan with verification and outcome.
   Verify: progress log and final outcome are current.

## Verification Approach

- Run focused bridge adapter/lib tests for report identity and scan history.
- Run TypeScript checks for scanner scripts if available through the existing
  package scripts or `tsx` compiler path.
- Run the most relevant existing test command that does not require live login.

## Progress Log

- 2026-04-26: Read `CLAUDE.md`, hourly automation script, scanner scripts,
  bridge enrichment, pending readers, report URL dedup, and scan-history dedup.
  Found URL-only evaluated-report checks plus tracker company-role checks, but
  no report-derived company-role identity used before direct evaluation queueing.
- 2026-04-26: Added report-derived evaluated job identities: canonical URLs and
  normalized company-role keys.
- 2026-04-26: Wired evaluated identities into scan-history seen keys, pending
  readers, bridge enrichment skips, SDK enrichment skips, `scan.mjs` seen sets,
  and direct-evaluation candidate filtering for newgrad, Built In/Indeed, and
  LinkedIn scanners.
- 2026-04-26: Added regression coverage for report company-role extraction and
  report-derived duplicate suppression in pending readers.
- 2026-04-26: Verification passed:
  - `npm --prefix bridge test -- evaluated-report-urls.test.ts newgrad-scan-history.test.ts newgrad-pending.test.ts builtin-pending.test.ts claude-pipeline.test.ts`
  - `npm --prefix bridge run typecheck`
  - `node --check scan.mjs`
  - `git diff --check`
  - `./bridge/node_modules/.bin/tsx scripts/job-board-scan-bb-browser.ts --help`
  - `./bridge/node_modules/.bin/tsx scripts/linkedin-scan-bb-browser.ts --help`
  - `./bridge/node_modules/.bin/tsx scripts/newgrad-scan-autonomous.ts --help`
- 2026-04-26: Extended pre-pipeline dedup to check all apply-link aliases
  captured during enrichment: selected pipeline URL, company apply URL, apply
  flow redirects, and source job URLs. Added a regression where an existing
  LinkedIn pipeline URL suppresses a later Greenhouse company-apply alias before
  it is appended to `data/pipeline.md`.
- 2026-04-26: Follow-up verification passed:
  - `npm --prefix bridge test -- newgrad-links.test.ts claude-pipeline.test.ts evaluated-report-urls.test.ts newgrad-scan-history.test.ts newgrad-pending.test.ts builtin-pending.test.ts`
  - `npm --prefix bridge run typecheck`
  - `node --check scan.mjs`
  - `git diff --check`

## Key Decisions

- Use the repository's existing normalized job identity helpers instead of
  adding a parallel dedup format.
- Keep duplicate suppression local to discovery/evaluation queueing; do not
  change apply behavior.

## Risks and Blockers

- Company-role dedup can suppress two distinct postings with identical company
  and title. This is acceptable for hourly automation because avoiding repeated
  evaluations is the higher-priority constraint.

## Final Outcome

Hourly scan dedup now treats evaluated reports and tracker rows as durable
evaluation identities before spending new `newgrad_quick` capacity. Repeated
jobs are suppressed by canonical URL, normalized company-role identity, and
captured apply-link aliases across scanner seen sets, pending reads, enrich
writes, and direct evaluation queueing.
