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

## Final Outcome

Completed. The LinkedIn scan finished with 37 completed evaluations and 1
failed evaluation in scanner accounting; the MITRE artifact for the missing
completed listing exists in both reports and tracker. Relevant review-worthy
scores from this run include eClerx
Junior AI Engineer 4.4, Rocket Machine Learning Engineer 4.4, Amazon Science
Applied Scientist I 4.4, GSK Applied AI Engineer 4.2, Anika Systems AI Engineer
4.2, Amazon Applied Scientist I 4.2, AMD AI & DevOps Software Development
Engineer 4.2, Jobgether Software Engineer (AI Platform) 4.1, Twitch Software
Engineer I Monetization ML 4.0, ServiceNow Software Engineer Agentic AI Systems
4.0, Kforce Python AI/ML Developer 4.0, Serve AI Backend Engineer 4.0, and
NVIDIA AI Chip Design Engineer New College Grad 2026 4.0.
