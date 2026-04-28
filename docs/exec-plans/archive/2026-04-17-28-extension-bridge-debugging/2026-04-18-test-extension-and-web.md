# Test extension and web index

## Background

The user asked to test the Chrome extension and `web/index.html`. The extension has TypeScript sources and a build script under `extension/`; the web dashboard is a static generated HTML file under `web/index.html`.

## Goal

Verify that the extension builds and its key HTML pages load, and verify that `web/index.html` loads and supports its core dashboard interactions.

## Scope

- Run extension typecheck.
- Run extension build.
- Smoke test extension static pages from `extension/dist/`.
- Smoke test `web/index.html` in a headless browser.
- Record verification results in this plan.

## Assumptions

- No live bridge server is required for this request.
- Browser smoke tests can use static files and should not submit applications or call external services.
- Console errors on unavailable browser-extension APIs in direct `file://` mode are acceptable only if the DOM still renders and the failure is caused by missing Chrome extension runtime.

## Implementation Steps

1. Inspect scripts and relevant HTML selectors.
   Verify: package scripts and page structure are readable.
2. Run extension compile checks.
   Verify: `npm --prefix extension run typecheck` and `npm --prefix extension run build`.
3. Run browser smoke tests for extension HTML pages.
   Verify: popup, permission, and unsupported pages render expected text and controls.
4. Run browser smoke tests for `web/index.html`.
   Verify: page loads, dashboard counters render, tabs switch, search/filter controls work, and no unexpected page errors occur.
5. Record final result.

## Verification Approach

- Use the existing Node/npm scripts for extension verification.
- Use Playwright in headless Chromium for static-page smoke tests.
- Keep generated screenshots and scratch scripts outside the repository if needed.

## Progress Log

- 2026-04-18: Confirmed the worktree is clean before testing.
- 2026-04-18: Read extension/web local instructions; both contain only recent-activity notes.
- 2026-04-18: Ran `npm --prefix extension run typecheck`; passed.
- 2026-04-18: Ran `npm --prefix extension run build`; passed and regenerated ignored `extension/dist/`.
- 2026-04-18: Initial `file://` browser smoke test was invalid for extension module pages because browsers block module scripts from `file://` origin.
- 2026-04-18: Re-ran smoke tests through a temporary local HTTP server with minimal `chrome.*` stubs for extension pages; popup, permission, unsupported, and `web/index.html` all passed with no console errors or page errors.
- 2026-04-18: Ran `npm run verify`; passed with 0 errors and 3 duplicate warnings.

## Key Decisions

- Use static smoke tests instead of launching the bridge because the request is for extension/web UI validation, not backend evaluation.

## Risks and Blockers

- Directly loading extension pages via `file://` may not provide `chrome.runtime`; tests should distinguish runtime-context limitations from rendering failures.
- `web/index.html` references CDN-hosted libraries, so network restrictions may affect markdown rendering checks.

## Final Outcome

Completed.

Verification passed:

- `npm --prefix extension run typecheck`
- `npm --prefix extension run build`
- Browser smoke test for `extension/dist/popup.html`
- Browser smoke test for `extension/dist/permission.html`
- Browser smoke test for `extension/dist/unsupported.html`
- Browser smoke test for `web/index.html`
- `npm run verify`

Smoke test screenshots:

- `/tmp/career-ops-extension-popup.png`
- `/tmp/career-ops-extension-permission.png`
- `/tmp/career-ops-extension-unsupported.png`
- `/tmp/career-ops-web-index.png`

`npm run verify` reports `0 errors` and keeps 3 pre-existing duplicate warnings:

- PayPal: `#61`, `#46`
- Vast.ai: `#31`, `#32`, `#33`
- Anduril Industries: `#3`, `#8`, `#9`
