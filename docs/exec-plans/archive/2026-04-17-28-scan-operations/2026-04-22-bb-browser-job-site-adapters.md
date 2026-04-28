# bb-browser Job Site Adapters

## Background

The repository already keeps a versioned `bb-browser/sites/jobright/newgrad.js`
adapter and installs it into `~/.bb-browser/sites/` for `bb-browser site`.
Built In is supported by Career-Ops scan flows, but there is no direct
`bb-browser site builtin/...` adapter. Indeed has no local adapter.

## Goal

Make Built In and Indeed usable through `bb-browser site` as read-only job
search commands.

## Scope

In scope:
- Add versioned local site adapters under `bb-browser/sites/`.
- Install the adapters into `~/.bb-browser/sites/` so `bb-browser site` can run
  them immediately.
- Return structured JSON job rows with title, company, location, URL, and
  useful metadata.
- Return explicit login/anti-bot hints when the site blocks access.

Out of scope:
- Applying to jobs, saving jobs, uploading resumes, or creating alerts.
- Replacing `scan.mjs`, `/career-ops builtin-scan`, or extension scanners.
- Adding a generalized job-site framework.

## Assumptions

- "CLI 化" means adding `bb-browser site` adapters, not changing the
  Career-Ops scan pipeline.
- A search/list command per site is the smallest useful interface.
- Built In and Indeed can be read from browser-authenticated pages with
  `fetch(..., { credentials: "include" })` or current-page DOM parsing.
- If Indeed presents a CAPTCHA/login wall during verification, that is a user
  action and should be reported instead of bypassed.

## Uncertainties

- Indeed may intermittently require verification even when the current browser
  page is readable.
- Both sites can change DOM structure; adapters should prefer semantic anchors
  and stable attributes over CSS class names.

## Simplest Viable Path

Add `builtin/jobs` and `indeed/jobs` adapters that build the search URL,
fetch or parse the current page, extract job cards, and cap results with a
`limit` argument.

## Implementation Steps

1. [x] Add `bb-browser/sites/builtin/jobs.js`.
   Verify: `bb-browser site info builtin/jobs --json` exposes the adapter.
2. [x] Add `bb-browser/sites/indeed/jobs.js`.
   Verify: `bb-browser site info indeed/jobs --json` exposes the adapter.
3. [x] Install both adapters into `~/.bb-browser/sites/`.
   Verify: `bb-browser site list --json` includes local `builtin/jobs` and
   `indeed/jobs`.
4. [x] Run real read-only searches.
   Verify: Built In and Indeed commands return non-empty JSON job arrays, or an
   explicit login/verification hint if blocked.

## Verification Approach

- Use `node --check` on both adapter files.
- Use `bb-browser site info ... --json` for metadata parsing.
- Use `bb-browser site ... --json` against live search pages.

## Progress Log

- 2026-04-22: Read repository instructions, `bb-browser` site system docs,
  existing `jobright/newgrad` adapter, and live Built In/Indeed pages.
- 2026-04-22: Confirmed Built In currently exposes 25 job cards with
  `data-id="job-card"` and Indeed exposes readable `.job_seen_beacon` cards in
  the browser without requiring login.
- 2026-04-22: Added `builtin/jobs` and `indeed/jobs` adapters under
  `bb-browser/sites/`, then installed both to `~/.bb-browser/sites/`.
- 2026-04-22: Ran `node --check` on both adapter files: passed.
- 2026-04-22: Ran `bb-browser site info builtin/jobs --json` and
  `bb-browser site info indeed/jobs --json`: both adapters were discovered as
  read-only local adapters.
- 2026-04-22: Ran `bb-browser site builtin/jobs "Software Engineer" 5 --json`:
  returned 5 jobs from 25 parsed Built In cards.
- 2026-04-22: Ran `bb-browser site indeed/jobs "Software Engineer" Remote 5 --json`:
  returned 5 jobs from 16 parsed Indeed cards. No login or verification was
  required.

## Key Decisions

- Use `builtin/jobs` and `indeed/jobs` names so both commands are discoverable
  as job search/list adapters.
- Keep adapters read-only and return direct detail URLs only.

## Risks And Blockers

- Installing into `~/.bb-browser/sites/` writes outside the repository and may
  require approval.
- Indeed verification walls cannot be solved safely by automation; the adapter
  should report them with a human-readable hint.

## Final Outcome

Completed. Built In and Indeed are available through:

- `bb-browser site builtin/jobs "Software Engineer" 20 --json`
- `bb-browser site indeed/jobs "Software Engineer" Remote 20 --json`

Both adapters are read-only and return structured job rows. Indeed did not
require login during verification.
