# bb-browser Job Site Login

## Background

Career-Ops uses `bb-browser` for browser-backed job-board scans. Built In and
Indeed already have read-only `bb-browser site` adapters, but authenticated
browser sessions may be needed for reliable scans.

## Goal

Open Indeed and Built In in the managed `bb-browser` browser and establish
logged-in sessions without automating applications, saves, alerts, or any other
mutating job-board action.

## Scope

In scope:
- Use `bb-browser` to open Indeed and Built In login pages.
- Let the user enter credentials directly in the browser.
- Verify login state with non-sensitive page signals.

Out of scope:
- Asking for credentials in chat.
- Bypassing CAPTCHA, MFA, bot checks, or verification walls.
- Applying to jobs, saving jobs, creating alerts, or uploading resumes.

## Assumptions

- The managed `bb-browser` browser is available locally.
- Credentials, MFA, and CAPTCHA are user-only steps.
- A visible account menu, profile link, or absence of sign-in prompts is enough
  to verify an authenticated browser session.

## Implementation Steps

1. Open the target login pages with `bb-browser`.
   Verify: browser tabs exist for Indeed and Built In.
2. Wait for the user to complete any credential/MFA/CAPTCHA steps manually.
   Verify: no credentials are handled in chat or scripts.
3. Check login state from page snapshots or harmless DOM signals.
   Verify: each site shows authenticated navigation or account UI.

## Verification Approach

- `bb-browser status` and `bb-browser tab list` for browser/tab state.
- `bb-browser snapshot` or a harmless `bb-browser eval` query for login UI
  signals after the user signs in.

## Progress Log

- 2026-04-23: Created plan after reading project instructions and existing
  Built In/Indeed scanner docs.
- 2026-04-23: Verified `bb-browser` daemon is running and created managed
  browser tabs for Indeed and Built In login pages.
- 2026-04-23: Paused for user-only credential/MFA/CAPTCHA steps in the browser.
- 2026-04-23: The original login tabs were no longer visible to `bb-browser`
  after manual login, so reopened neutral home pages in managed tabs.
- 2026-04-23: Verified Built In shows authenticated job-match/tracker surfaces
  and Indeed shows authenticated navigation including My Jobs, Messages,
  Notifications, and Account.

## Key Decisions

- Keep login credential entry manual in the browser, not in chat or scripts.

## Risks and Blockers

- Indeed or Built In may require MFA/CAPTCHA. That blocks automation and must
  be resolved by the user in the browser.

## Final Outcome

Completed. Managed `bb-browser` tabs for Built In and Indeed show authenticated
UI without any application, save, alert, resume upload, or other mutating job
action.
