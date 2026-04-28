# Gmail Scan Noise Filtering

## Background

The Action Center is showing non-application emails as urgent Gmail signals.
Examples include marketing offers, Reddit digests, utility alerts, shopping
promotions, and rent/payment emails being classified as `offer` and promoted to
the Offered stage.

## Goal

Make Gmail scanning conservative enough that ordinary mailbox noise does not
create application rows or Offered-stage cards.

## Scope

- Tighten the standalone Gmail OAuth scanner.
- Add regression coverage for marketing/newsletter false positives.
- Update Gmail scan documentation to describe the stricter read path.
- Refresh local Gmail signals after the fix if OAuth access works.

Out of scope:

- Sending, archiving, labeling, or deleting Gmail messages.
- Mutating `data/applications.md` from Gmail alone.
- Redesigning the dashboard layout.

## Assumptions

- `data/applications.md` remains the source of truth.
- Gmail-derived rows are display-only unless later reconciled through the
  tracker flow.
- The immediate bug is caused by broad Gmail discovery and loose keyword
  classification, not by the dashboard stage renderer alone.

## Uncertainties

- Whether the local OAuth token is still valid enough to refresh Gmail during
  this run.
- Whether some legitimate direct-recruiter emails have sparse wording and may
  need a future allowlist or company-specific query.

## Implementation Steps

1. Narrow Gmail discovery queries.
   Verify: default query strings no longer include bare `offer` or generic
   single-word application scans.
2. Add hiring-context validation before producing a signal.
   Verify: marketing, newsletter, Reddit digest, and utility-alert examples
   return no signal.
3. Prune previously stored signals that fail the stricter validation when a
   scan refresh succeeds.
   Verify: merge keeps valid hiring signals and drops stale noisy rows.
4. Run targeted syntax and regression checks.
   Verify: `node --check`, targeted Gmail assertions, and relevant dashboard
   parser tests pass.
5. Refresh local Gmail signals if possible.
   Verify: refreshed `data/gmail-signals.jsonl` no longer includes the reported
   false-positive examples.

## Verification Approach

- Static syntax checks for modified scripts.
- Existing `test-all.mjs` Gmail parser block, extended with false-positive
  fixtures.
- A targeted Node assertion script for the new classifier behavior.
- `bun run gmail:update` for live refresh if the OAuth environment allows it.

## Progress Log

- 2026-04-27: Reproduced the failure from local `data/gmail-signals.jsonl`.
  Current false positives are dominated by bare `offer` matching and generic
  company/role extraction from promotional copy.
- 2026-04-27: Replaced the broad keyword query with phrase-based Gmail search
  that excludes promotional/social categories for non-ATS discovery.
- 2026-04-27: Added classifier gates for personal hiring context, trusted ATS
  senders, marketing/newsletter noise, and subject-level talent-community
  newsletters.
- 2026-04-27: Added regression fixtures for JetBlue-style marketing offers,
  Reddit digest interview chatter, Northern Trust talent-community newsletters,
  and a real offer-letter signal.
- 2026-04-27: Refreshed Gmail through the OAuth scanner. Local
  `data/gmail-signals.jsonl` now has 299 parsed signals with 0 parse errors.
  The reported false-positive examples have 0 matches in the refreshed signal
  file.
- 2026-04-27: Verification run:
  `node --check scripts/gmail-oauth-refresh.mjs`, `node --check test-all.mjs`,
  `node --check web/build-dashboard.mjs`, targeted classifier assertions,
  `bun run gmail:update`, `node verify-pipeline.mjs`, and scoped
  `git diff --check` passed. `node test-all.mjs --quick` still fails on the
  repository's existing absolute-path findings outside this Gmail change; its
  Gmail regression block passes.
- 2026-04-27: User reported a Davis Wright Tremaine Jobvite application receipt
  was still shown as Interviewing because the template body said the hiring
  team was reviewing and might later schedule interviews. Added review-only
  receipt detection so these stay `applied`, plus company/role extraction for
  `application for {role} at {company}`.
- 2026-04-27: Added regressions for Davis Wright Tremaine review-only receipt,
  Greenhouse conditional future-interview receipt, and eFinancialCareers weekly
  newsletter. Refreshed Gmail signals again: Davis Wright Tremaine now appears
  as `applied`, `AI Developer`, and eFinancialCareers / Jobvite / unattended
  mailbox false positives are absent from the focused checks.
- 2026-04-27: Fixed the dashboard `Show stage` buttons to scroll to the
  filtered application list after applying the stage filter, so the action is
  visible instead of appearing to do nothing.

## Key Decisions

- Prefer stricter extraction over dashboard-side hiding. Bad rows should not be
  written into the signal artifact in the first place.
- Keep Gmail read-only and derived-fact-only.
- Prune invalid previously stored signals during refresh so already-written
  noise does not stay visible forever.

## Risks and Blockers

- A very terse legitimate recruiter email may be skipped if it lacks a clear
  hiring phrase. This is acceptable for now because the current failure mode is
  much worse: ordinary mailbox noise creates urgent application actions.

## Final Outcome

Implemented. Gmail scan now uses a stricter read path and classifier:

- ATS/recruiting sender search remains available for real application systems.
- Direct-recruiter search is phrase-based instead of broad single-word search.
- `offer` requires job/employment-offer language, not promotional offers.
- Application receipt/review-only templates remain Applied, even if the body
  mentions a possible future interview.
- Talent-community newsletters, marketing offers, Reddit digests, utility
  alerts, shopping mail, and rent/payment notices are rejected before writing
  signals.
- Previously stored invalid signals are pruned on refresh.

The local Gmail signal cache was regenerated from the final scanner and no
longer contains the reported false-positive examples.
