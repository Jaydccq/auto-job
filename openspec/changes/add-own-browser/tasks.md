## 1. Package skeleton

- [x] 1.1 Create directory `packages/browser/` with `src/`, `test/`, `test/fixtures/`
- [x] 1.2 Add `packages/browser/package.json` with name `@auto-job/browser`, type `module`, and scripts `typecheck` (`tsc --noEmit`), `test` (`vitest run`), `build` (`tsc`)
- [x] 1.3 Add `packages/browser/tsconfig.json` extending the repo root config (matching `apps/server` style)
- [x] 1.4 Add `packages/browser/vitest.config.ts` matching the `apps/server` vitest setup
- [x] 1.5 Register `packages/browser` in the root `package.json` workspaces array (if not already covered by `packages/*`) — auto-covered by `pnpm-workspace.yaml`'s `packages/*` entry; no edit needed
- [x] 1.6 Verify with `npm install` from repo root and `npm --prefix packages/browser run typecheck`

## 2. Core BrowserController + Tab implementation

- [x] 2.1 Implement `src/types.ts` with `ControllerOptions`, `TabInfo`, `NavigateOptions`, `FetchInit`, `FetchResult`, `ScreenshotOptions`, `RequestMatcher`, `WaitOptions`, `NetworkRecord`, `AccessibilitySnapshot`
- [x] 2.2 Implement `src/errors.ts` exporting `ChromeNotFoundError`, `ProfileLockedError`, `NotAuthenticatedError`, `TabClosedError`, `AdapterParseError`
- [x] 2.3 Implement `src/chrome-binary.ts` — auto-detect Chrome for Testing → Google Chrome → Chromium across macOS / Linux / WSL
- [x] 2.4 Implement `src/ensure-chrome.ts` — probe port 47320 (idempotent); if down launch Chrome with `--user-data-dir`, `--remote-debugging-port`, `--no-first-run`, `--no-default-browser-check`; if up attach
- [x] 2.5 Implement `src/browser-controller.ts` — `BrowserController.ensure()`, `openTab()`, `listTabs()`, `close()`, `shutdown()`; uses `playwright.chromium.connectOverCDP`
- [x] 2.6 Implement `src/tab.ts` — `Tab` class wrapping a playwright `Page` with the spec'd surface (`navigate`, `evaluate`, `snapshot`, `click`, `fill`, `fetch`, `screenshot`, `waitForNetwork`, `close`). Note: `snapshot()` uses `locator(":root").ariaSnapshot()` since `page.accessibility` was removed in playwright v1.50+; none of the Phase 1 site adapters exercise this path.
- [x] 2.7 Implement `src/index.ts` — public exports
- [x] 2.8 Integration test `test/browser-controller.integration.test.ts` — `ensure → openTab("about:blank") → evaluate("1+1") → close()` against a real Chrome. Skips when `SKIP_BROWSER_INTEGRATION=1` (set by `npm run verify` since CI has no Chrome).
- [x] 2.9 Verify: `npm --prefix packages/browser run typecheck && npm --prefix packages/browser run test` — 15 unit tests pass, 1 integration test correctly skips.

## 3. Site adapter — BuiltIn

- [~] 3.1 Capture fixtures — **deferred / superseded**: chose to embed bb-browser source verbatim and run via `tab.evaluate()` instead of fetching+parsing in Node. No captured fixtures needed; behavioral parity comes from running identical source. Parity verification happens in Group 11.
- [x] 3.2 Read existing `./bb-browser/sites/builtin/` source to understand request/parse logic
- [x] 3.3 Implement `src/sites/builtin/index.ts` exporting `searchBuiltIn(tab, options)` — uses `tab.evaluate()` against the embedded bb-browser source (which itself uses `tab.fetch()` semantics via `fetch(url, {credentials:include})`)
- [x] 3.4 Add row-shape adapter — typed return `BuiltInSearchResult` is identical to the bb-browser envelope's `data`, so consumer `normalizeBuiltInAdapterRows` accepts it via `as unknown as AdapterResult` widening at the call site.
- [x] 3.5 Unit tests `test/sites/adapters.test.ts` — covers exports + source-string syntax sanity. Real parsing is covered by parity tests in Group 11.
- [x] 3.6 Verify: tests included in the `npm --prefix packages/browser run test` run

## 4. Site adapter — Indeed

- [~] 4.1 Capture fixtures — **deferred / superseded** (same rationale as 3.1)
- [x] 4.2 Implement `src/sites/indeed/index.ts` exporting `searchIndeed(tab, options)`
- [x] 4.3 Align output shape with `normalizeIndeedAdapterRows` (same widening pattern as 3.4)
- [x] 4.4 Unit tests covered by `test/sites/adapters.test.ts`
- [x] 4.5 Verify: included in package test run

## 5. Site adapter — JobRight

- [~] 5.1 Capture fixtures — **deferred / superseded** (same rationale as 3.1)
- [x] 5.2 Read existing `scripts/extractors/jobright-detail.js` and `scripts/extractors/jobright-dismiss-popups.js` for behavior parity
- [x] 5.3 Implement `src/sites/jobright/index.ts` exporting `recommendJobright`, `jobrightDetail`, `jobrightDismissPopups`
- [x] 5.4 Unit tests covered by `test/sites/adapters.test.ts`
- [x] 5.5 Verify: included in package test run

## 6. Site adapter — LinkedIn

- [~] 6.1 Capture fixtures — **N/A**: LinkedIn never had a bb-browser site adapter to capture. The wrapper takes a caller-provided extractor function (existing `extractLinkedInList` / `extractLinkedInDetail` from `apps/extension/src/content/extract-linkedin.ts`).
- [x] 6.2 Read existing `apps/extension/src/content/extract-linkedin.ts` and `apps/server/src/adapters/linkedin-scan-normalizer.ts` for compat reference
- [x] 6.3 Implement `src/sites/linkedin/index.ts` exporting `searchLinkedIn`, `linkedInJobDetail`, `detectLinkedInAuthBlock`, `captureLinkedInAuthState`
- [x] 6.4 `searchLinkedIn` is generic over the row type, so output assignability to `LinkedInVisibleJobCard` is preserved at the call site through the extractor parameter
- [x] 6.5 Unit tests covered by `test/sites/adapters.test.ts` (export shape)
- [x] 6.6 Verify: included in package test run

## 7. Rewrite consumer scripts

- [x] 7.1 Wrote `scripts/job-board-scan.ts` — port of `scripts/job-board-scan-bb-browser.ts` with `runProcess("bb-browser", ...)` swapped for in-process `searchBuiltIn` / `searchIndeed` calls and `runProcessToStdoutFile("bb-browser", ["fetch", url])` swapped for `bbFetch(url)`. All CLI flags preserved.
- [x] 7.2 Wrote `scripts/linkedin-scan.ts` — port of `scripts/linkedin-scan-bb-browser.ts` with the local helpers (`assertBbBrowserAvailable`, `openBbTab`, `closeBbTab`, `listBbTabs`, `evaluateBrowserJson`, `runBb`, `runBbJson`) replaced by imports from `@auto-job/browser/bb-shim`. The 1900-line script lost only ~90 lines of helper definitions; in-page extractors and business logic unchanged.
- [x] 7.3 `scripts/newgrad-scan-autonomous.ts` — **N/A**: this script already uses playwright directly (no bb-browser dependency). No change required for Phase 1.
- [x] 7.4 Added `scripts/own-browser-login-helper.mjs` that opens LinkedIn / Indeed / BuiltIn / JobRight in the dedicated profile and prompts the user.
- [x] 7.5 Both new scripts compile cleanly: `npx tsx scripts/{linkedin-scan,job-board-scan}.ts --help` runs and prints usage.

## 8. Wire commands and verification

- [x] 8.1 Updated root `package.json`:
  - `linkedin-scan` → `scripts/linkedin-scan.ts`
  - `builtin-scan` → `scripts/job-board-scan.ts --source builtin`
  - `indeed-scan` → `scripts/job-board-scan.ts --source indeed`
  - new `own-browser:login-helper` → `scripts/own-browser-login-helper.mjs`
- [x] 8.2 Added `packages/browser` typecheck + tests to `verify-pipeline.mjs`
- [x] 8.3 `.gitignore`: added `packages/browser/{node_modules,dist,package-lock.json,.test-chrome-profile}/` (the `~/.auto-job/` path is user-home-relative and does not need a repo gitignore entry — noted in the comment block).
- [x] 8.4 `npm run verify` passes (0 errors, 1 pre-existing duplicate warning).

## 9. Documentation

- [x] 9.1 Created `docs/architecture/own-browser.md` with components, lifecycle, error model, troubleshooting.
- [x] 9.2 Updated `CLAUDE.md` Hot file map: added `packages/browser/` entry referencing the architecture doc.
- [x] 9.3 Updated `CLAUDE.md` Run flow: documented `npm run own-browser:login-helper` for first-time setup; noted the 7-day fallback to `*-bb-browser.ts`.
- [x] 9.4 Added a 2026-05-03 entry to `docs/exec-plans/active/2026-04-27-auto-job-architecture-independence.md` Progress Log reversing the prior "Replacing bb-browser" out-of-scope decision.

## 10. Phase 1 acceptance — score-only smoke

- [ ] 10.1 Run `npm run linkedin-scan -- --score-only --limit 10`; assert exit 0 and ≥1 row  *(USER-DRIVEN: needs logged-in dedicated Chrome profile; run after `npm run own-browser:login-helper`)*
- [ ] 10.2 Run `npm run builtin-scan -- --score-only --limit 10`; assert exit 0 and ≥1 row  *(USER-DRIVEN)*
- [ ] 10.3 Run `npm run indeed-scan -- --score-only --limit 10`; assert exit 0 and ≥1 row  *(USER-DRIVEN)*
- [ ] 10.4 Run `npm run newgrad-scan -- --score-only --limit 10`; assert exit 0 and ≥1 row  *(USER-DRIVEN — uses playwright directly, no bb-browser dependency, should already work)*

## 11. Phase 1 acceptance — dual-run parity

- [ ] 11.1 For each of the 4 scan sources, run new path and old `*-bb-browser.ts` path on the same query; dump normalized JSON outputs to `/tmp/own-browser-parity/{source}-{old|new}.json`  *(USER-DRIVEN)*
- [ ] 11.2 Diff per source: required fields present in ≥95% of new rows; row count within ±5%; per-row identity overlap ≥90% via `createJobIdentity()`  *(USER-DRIVEN)*
- [ ] 11.3 Record results in `docs/exec-plans/active/2026-05-03-own-browser-phase1.md` (new active exec plan tracking this rollout)  *(USER-DRIVEN)*

## 12. Phase 1 acceptance — full real run

- [ ] 12.1 Run a full (non-`--score-only`) `npm run linkedin-scan` end-to-end; verify report artifacts produced  *(USER-DRIVEN)*
- [ ] 12.2 Same for `builtin-scan`, `indeed-scan`, `newgrad-scan`  *(USER-DRIVEN)*
- [ ] 12.3 7-day stability window starts; daily scan logs go into the active exec plan  *(USER-DRIVEN — calendar window, cannot be compressed)*
- [ ] 12.4 If user invokes any old `*-bb-browser.ts` script even once during the window, fix root cause and reset clock  *(USER-DRIVEN)*

## 13. Phase 1 close-out

- [ ] 13.1 After 7 consecutive days with no fallback usage, mark Phase 1 done in the active exec plan  *(USER-DRIVEN)*
- [ ] 13.2 Open a follow-up OpenSpec change `remove-bb-browser` covering deletion of `./bb-browser/`, the three `*-bb-browser.ts` files, and PATH dependency notes (NOT part of this change)  *(USER-DRIVEN)*
- [ ] 13.3 Archive `docs/superpowers/specs/2026-05-03-own-browser-design.md` if appropriate (or leave it as the historical brainstorming record)  *(USER-DRIVEN)*
- [ ] 13.4 Run `openspec archive add-own-browser` to move this change into archive  *(USER-DRIVEN)*
