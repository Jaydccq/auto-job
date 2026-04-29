# LinkedIn Job Board Live Login

## Background

The user asked to complete live verification for LinkedIn/job-board flows that
require a logged-in `bb-browser` profile. The originally provided cwd,
`/Users/hongxichen/Desktop/career-ops`, currently contains only automation logs
and is not a Git checkout; the active repository with the scanner code is
`/Users/hongxichen/Desktop/auto-job`.

## Goal

Establish and verify a LinkedIn login state in the managed `bb-browser` browser,
then run bounded read-only scanner checks for LinkedIn and browser-backed
job-board flows.

## Scope

In scope:
- Use `bb-browser` to open LinkedIn login/search pages.
- Let the user complete credential, MFA, or CAPTCHA steps manually.
- Verify login state with harmless page signals.
- Run bounded read-only scan commands after login is confirmed.

Out of scope:
- Asking for credentials in chat.
- Bypassing CAPTCHA, MFA, bot checks, or verification walls.
- Clicking Easy Apply, saving jobs, creating alerts, uploading resumes, or
  submitting applications.
- Recreating the missing `career-ops` checkout.

## Assumptions

- `auto-job` is the current repository source of truth for the renamed/migrated
  scanner implementation.
- The managed `bb-browser` profile can persist LinkedIn cookies after the user
  completes manual login.
- A visible authenticated LinkedIn Jobs page, account navigation, or absence of
  login/checkpoint blocks is enough to proceed to bounded live scans.

## Implementation Steps

1. Inspect current scanner commands and login recovery docs.
   Verify: LinkedIn and job-board commands are read-only or stop before any
   application mutation.
2. Open LinkedIn in the managed `bb-browser` browser.
   Verify: `bb-browser` reports a reachable tab.
3. Wait for user-only login/MFA/CAPTCHA completion.
   Verify: credentials are handled only in the browser.
4. Check LinkedIn auth state with harmless DOM/page signals.
   Verify: no login/checkpoint wall is detected.
5. Run bounded live scanner checks.
   Verify: commands either extract rows successfully or record exact site/login
   blockers.

## Verification Approach

- `bb-browser status`, `bb-browser tab list`, `bb-browser open`, and harmless
  `bb-browser eval` checks.
- `npm run linkedin-scan -- --score-only ...` for a bounded LinkedIn read-only
  scanner check.
- `npm run builtin-scan -- --score-only ...` and/or
  `npm run indeed-scan -- --score-only ...` only if needed for the job-board
  side of the request.

## Progress Log

- 2026-04-29 12:13 EDT: Confirmed `/Users/hongxichen/Desktop/career-ops` is not
  a Git checkout and the active scanner implementation is in
  `/Users/hongxichen/Desktop/auto-job`.
- 2026-04-29 12:13 EDT: Read `scripts/linkedin-scan-bb-browser.ts`,
  `scripts/job-board-scan-bb-browser.ts`, manual recovery docs, and the prior
  `bb-browser` job-site login plan. Safety boundary remains read-only for
  job-board list/detail scans and non-submitting for LinkedIn external JD
  probing.
- 2026-04-29 12:14 EDT: `bb-browser status` showed daemon/CDP connected with a
  managed `about:blank` tab. A sandboxed `npm run linkedin-scan -- --help`
  failed with `listen EPERM` on the `tsx` IPC pipe; rerunning outside the
  sandbox passed.
- 2026-04-29 12:15 EDT: Opened LinkedIn login in `bb-browser`; the managed
  browser already had an authenticated LinkedIn session and redirected to
  `https://www.linkedin.com/feed/`.
- 2026-04-29 12:15 EDT: Opened a LinkedIn Jobs search page and verified no
  login/checkpoint wall. The page showed authenticated Jobs navigation and
  visible search results.
- 2026-04-29 12:15 EDT: Ran
  `npm run linkedin-scan -- --url "https://www.linkedin.com/jobs/search-results/?keywords=software%20engineer%20new%20grad&location=United%20States&origin=JOB_SEARCH_PAGE_SEARCH_BUTTON&f_TPR=r86400" --score-only --pages 1 --limit 10 --scroll-steps 0`.
  Result: bridge health ok; extracted 23 raw rows, 10 unique rows, promoted 9,
  filtered 1; no bridge write endpoints were called. Summary:
  `data/scan-runs/linkedin-20260429T161500Z-1b2e782b-summary.json`.
- 2026-04-29 12:16 EDT: Ran
  `npm run builtin-scan -- --score-only --include-older --pages 1 --limit 5`.
  Result: parsed 2 Built In rows, promoted 2, filtered 0; no bridge write
  endpoints were called.
- 2026-04-29 12:16 EDT: Ran
  `npm run indeed-scan -- --score-only --include-older --pages 1 --limit 5 --query "software engineer new grad" --location "United States"`.
  Result: blocked with `HTTP 403 | Please log in to https://www.indeed.com in
  your browser first, then retry.`
- 2026-04-29 12:17 EDT: Opened `https://www.indeed.com` in `bb-browser`.
  Harmless DOM check showed `Additional Verification Required` and Cloudflare
  verification text, so Indeed is waiting on a user-only verification step.
- 2026-04-29 12:24 EDT: After the user completed the first Indeed verification,
  `https://www.indeed.com/` showed normal authenticated UI including `Welcome,
  Hongxi`. Re-running the bounded scanner still returned `HTTP 403`.
- 2026-04-29 12:25 EDT: Direct `bb-browser site indeed/jobs "software engineer
  new grad" "United States" 5 1` also returned `HTTP 403`. Inspecting
  `bb-browser/sites/indeed/jobs.js` showed the adapter uses page-context
  `fetch(url, { credentials: "include" })`; the failure is at the read request
  path.
- 2026-04-29 12:26 EDT: Opened
  `https://www.indeed.com/jobs?q=software+engineer+new+grad&l=United+States`;
  the search page itself showed `Additional Verification Required`, so Indeed
  needs another user-only verification before a search-page live smoke can
  succeed.
- 2026-04-29 13:05 EDT: After the user completed the Indeed search-page
  verification, the same page showed 32 job-card/query elements. Re-running
  `npm run indeed-scan -- --score-only --include-older --pages 1 --limit 5 --query "software engineer new grad" --location "United States"`
  passed: parsed 16 Indeed cards, returned 5 raw/unique rows, promoted 2, and
  filtered 3. No bridge write endpoints were called.

## Key Decisions

- Use the active `auto-job` checkout for this verification because the provided
  `career-ops` path is not currently a repository.
- Keep all credential, MFA, and CAPTCHA work manual in the managed browser.

## Risks and Blockers

- LinkedIn may require MFA, CAPTCHA, or checkpoint verification that only the
  user can complete.
- Indeed currently requires user-only Cloudflare/additional verification before
  the `indeed-scan` smoke can pass.
- If `bb-browser` has no managed page target, the daemon or tab may need
  recovery before login verification can proceed.

## Final Outcome

Completed for the requested live login verification. LinkedIn, Built In, and
Indeed all have working `bb-browser` live verification paths after user-only
login/verification steps. All scanner checks were bounded `--score-only` runs,
so they did not write pipeline/tracker state or queue evaluations.
