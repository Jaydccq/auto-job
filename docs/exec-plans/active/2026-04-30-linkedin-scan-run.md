# LinkedIn Scan Run

## Background

The user asked to run a LinkedIn scan from the local `auto-job` checkout. The
repository owns the scanner workflow through `npm run linkedin-scan`, which
uses `scripts/linkedin-scan-bb-browser.ts` and the configured LinkedIn search
URL when no URL is provided.

## Goal

Run the repo-native LinkedIn scanner and capture the concrete outcome.

## Scope

In scope:
- Confirm required local profile files exist.
- Run `npm run linkedin-scan` from this checkout.
- Preserve unrelated dirty worktree changes.
- Record scanner output, blockers, and verification in this plan.

Out of scope:
- Submitting applications or clicking Easy Apply.
- Editing user profile data or tracker rows by hand.
- Changing scanner implementation unless the run exposes a code defect.

## Assumptions

- The configured `linkedin_scan.search_url` in `config/profile.yml` is the
  intended search target.
- Default scanner behavior is acceptable: evaluate promoted candidates unless
  the user explicitly asks for `--score-only` or `--no-evaluate`.
- Any LinkedIn login, checkpoint, or CAPTCHA step must be completed manually in
  the managed browser by the user.

## Implementation Steps

1. Read scanner command and local requirements.
   Verify: `npm run linkedin-scan -- --help` works and required user-layer
   files exist.
2. Run LinkedIn scan.
   Verify: command exits successfully or reports a precise recoverable blocker.
3. Review generated scan artifacts.
   Verify: identify summary path, promoted/filtered/evaluation counts, and any
   failures.
4. Update this plan.
   Verify: progress log and final outcome reflect the actual command result.

## Verification Approach

- `npm run linkedin-scan`
- Inspect `data/scan-runs/` summary paths reported by the scanner.
- If tracker additions are created, use the scanner output and relevant repo
  verification rather than editing tracker rows directly.

## Progress Log

- 2026-04-30: Created this run plan. Required onboarding files exist:
  `cv.md`, `config/profile.yml`, `modes/_profile.md`, and `portals.yml`.
  `npm run linkedin-scan -- --help` passed.
- 2026-04-30: First `npm run linkedin-scan` attempt failed before discovery
  because no bridge was listening on `127.0.0.1:47319`. Summary:
  `data/scan-runs/linkedin-20260430T013159Z-f7364ccd-summary.json`.
- 2026-04-30: Started the local bridge with `npm run server` outside the
  sandbox after the sandboxed start hit the known `tsx` IPC `listen EPERM`
  failure.
- 2026-04-30: Re-ran `npm run linkedin-scan`. The scanner used configured URL
  `https://www.linkedin.com/jobs/search-results/?keywords=software%20engineer%20AI%20engineer%20new%20graduate&f_TPR=r86400`,
  discovered 100 unique rows, promoted 76, filtered 24, enriched 76, added 35
  detail-backed pipeline candidates, skipped 41, queued 38 evaluations,
  completed 37, failed 1, and timed out 0. Summary:
  `data/scan-runs/linkedin-20260430T013237Z-fcfbeaa9-summary.json`.
- 2026-04-30: Checked the missing completed item. MITRE Associate Autonomous
  Systems Engineer has report `reports/533-mitre-2026-04-29.md` and tracker row
  534 despite the scanner accounting one failed evaluation.
- 2026-04-30: `npm run verify` passed outside the sandbox: 0 errors, 6 duplicate
  warnings. A sandboxed verification attempt failed only on a server SSE test
  that could not bind `127.0.0.1` (`listen EPERM`).
- 2026-05-01: User requested another `linkedin scan`. Required onboarding
  files still exist. `npm run linkedin-scan -- --help` passed. Initial bridge
  health was unreachable, and sandboxed `npm run server` failed on the known
  `tsx` IPC `listen EPERM` issue, so the bridge was started outside the
  sandbox in real Codex mode.
- 2026-05-01: Re-ran `npm run linkedin-scan` with the configured URL. The scan
  discovered 100 unique rows, promoted 72, filtered 28, enriched 72, failed 0
  enrichments, added 11 detail-backed pipeline candidates, skipped 61, queued
  46 evaluations, completed 46, failed 0, and timed out 0. Summary:
  `data/scan-runs/linkedin-20260501T021018Z-e51b97fe-summary.json`.
- 2026-05-01: `npm run verify` inside the sandbox failed only on the server SSE
  bind test (`listen EPERM: operation not permitted 127.0.0.1`). Re-ran
  `npm run verify` outside the sandbox: passed with 0 errors and 15 duplicate
  warnings.
- 2026-05-02: User requested another `linkedin scan` from the local
  `auto-job` checkout. Required onboarding files still exist. Read the
  repo-local `auto-job` skill plus `modes/_shared.md` to confirm the default
  `linkedin-scan` mode and tracker/report contracts. `npm run linkedin-scan --
  --help` passed; next step is the full repo-native scan run.
- 2026-05-02: First full run attempt reached bridge health `ok` and created
  `data/scan-runs/linkedin-20260502T044127Z-a1945a18.jsonl`, but I interrupted
  it too early while checking for a stall before the first extraction event
  landed. That attempt should not be treated as a scanner verdict.
- 2026-05-02: Re-ran `npm run linkedin-scan` from a warm managed-browser
  session. The scan extracted page 1 through page 4 (20, 43, 64, then 86
  unique rows so far) but failed on page 5 with a `bb-browser eval` timeout
  while extracting visible LinkedIn rows. Failed summary:
  `data/scan-runs/linkedin-20260502T044352Z-b0ce7a5d-summary.json`.
- 2026-05-02: Cleaned the managed browser back to a single `about:blank` tab
  and restarted the `bb-browser` daemon, then retried the full default scan.
  The rerun failed immediately after `source_page_open_started` on page 1 with
  `Runtime.evaluate: Cannot find default execution context`. Failed summary:
  `data/scan-runs/linkedin-20260502T050053Z-7dd25062-summary.json`.
- 2026-05-02: Re-ran `npm run linkedin-scan` again after confirming bridge
  health. This run completed successfully despite a slow first-page extract and
  intermittent authenticated-detail fallbacks. Summary:
  `data/scan-runs/linkedin-20260502T121857Z-acb0cae0-summary.json`.
- 2026-05-02: Successful run counts: discovered 100 rows, promoted 69,
  filtered 31, enriched 69, enrichment failures 0, detail-backed pipeline
  additions 37, detail skips 32, queued 34 evaluations, completed 34, failed
  0, timed out 0. Reports and tracker merges were produced for all 34 queued
  evaluations.

## Key Decisions

- Use the default LinkedIn scanner behavior because the user requested
  "linkedin scan" without narrowing it to a smoke test or score-only run.
- Treat the first failed scan as an environment startup failure, not a LinkedIn
  or scanner defect, because the bridge health check could not reach the local
  server and the rerun completed after the bridge was started.

## Risks and Blockers

- LinkedIn may require manual login, MFA, CAPTCHA, or checkpoint recovery.
- Bridge startup or evaluation backends may block the evaluation phase.
- Tracker verification currently reports duplicate warnings for several
  company-role pairs, including some created by this run, but they are warnings
  rather than verification failures.
- During the 2026-05-01 enrichment pass, some LinkedIn authenticated detail
  reads failed with `Cannot find default execution context`, and several ATS
  pages returned JSON/string parse warnings. The scanner recovered through
  guest LinkedIn detail or skipped external apply probing without failing the
  run.
- On 2026-05-02 the managed `bb-browser` session itself became the blocker:
  one full scan failed on a daemon timeout during list extraction, and the
  clean rerun failed during the initial auth-state `Runtime.evaluate` probe.
  No LinkedIn rows were promoted or evaluated on those failed runs.
- The successful 2026-05-02 rerun still showed repeated authenticated-detail
  `Runtime.evaluate: Cannot find default execution context` fallbacks for some
  listings, but the scanner recovered via guest detail or external ATS detail
  and finished the run.

## Final Outcome

The latest 2026-05-02 LinkedIn scan completed successfully in
`data/scan-runs/linkedin-20260502T121857Z-acb0cae0-summary.json`. The scanner
discovered 100 unique rows, promoted 69, filtered 31, enriched all 69
promoted rows without enrichment failure, added 37 detail-backed pipeline
candidates, skipped 32 at the detail gate, queued 34 direct evaluations, and
finished all 34 with 0 failed and 0 timed out. Earlier failed attempts on
2026-05-02 remain useful diagnostics for managed-browser instability, but they
are no longer the latest scan verdict for this checkout.
