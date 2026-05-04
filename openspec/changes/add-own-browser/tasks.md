## 1. Package skeleton

- [ ] 1.1 Create directory `packages/browser/` with `src/`, `test/`, `test/fixtures/`
- [ ] 1.2 Add `packages/browser/package.json` with name `@auto-job/browser`, type `module`, and scripts `typecheck` (`tsc --noEmit`), `test` (`vitest run`), `build` (`tsc`)
- [ ] 1.3 Add `packages/browser/tsconfig.json` extending the repo root config (matching `apps/server` style)
- [ ] 1.4 Add `packages/browser/vitest.config.ts` matching the `apps/server` vitest setup
- [ ] 1.5 Register `packages/browser` in the root `package.json` workspaces array (if not already covered by `packages/*`)
- [ ] 1.6 Verify with `npm install` from repo root and `npm --prefix packages/browser run typecheck`

## 2. Core BrowserController + Tab implementation

- [ ] 2.1 Implement `src/types.ts` with `ControllerOptions`, `TabInfo`, `NavigateOptions`, `FetchInit`, `FetchResult`, `ScreenshotOptions`, `RequestMatcher`, `WaitOptions`, `NetworkRecord`, `AccessibilitySnapshot`
- [ ] 2.2 Implement `src/errors.ts` exporting `ChromeNotFoundError`, `ProfileLockedError`, `NotAuthenticatedError`, `TabClosedError`, `AdapterParseError`
- [ ] 2.3 Implement `src/chrome-binary.ts` — auto-detect Chrome for Testing → Google Chrome → Chromium across macOS / Linux / WSL
- [ ] 2.4 Implement `src/ensure-chrome.ts` — probe port 47320 (idempotent); if down launch Chrome with `--user-data-dir`, `--remote-debugging-port`, `--no-first-run`, `--no-default-browser-check`; if up attach
- [ ] 2.5 Implement `src/browser-controller.ts` — `BrowserController.ensure()`, `openTab()`, `listTabs()`, `close()`, `shutdown()`; uses `playwright.chromium.connectOverCDP`
- [ ] 2.6 Implement `src/tab.ts` — `Tab` class wrapping a playwright `Page` with the spec'd surface (`navigate`, `evaluate`, `snapshot`, `click`, `fill`, `fetch`, `screenshot`, `waitForNetwork`, `close`)
- [ ] 2.7 Implement `src/index.ts` — public exports
- [ ] 2.8 Integration test `test/browser-controller.integration.test.ts` — `ensure → openTab("about:blank") → evaluate("1+1") → close()` against a real Chrome
- [ ] 2.9 Verify: `npm --prefix packages/browser run typecheck && npm --prefix packages/browser run test`

## 3. Site adapter — BuiltIn

- [ ] 3.1 Capture fixtures: invoke existing `bb-browser site builtin/search` with representative query, save raw response under `test/fixtures/builtin/search-{query-slug}.json`
- [ ] 3.2 Read existing `./bb-browser/sites/builtin/` source to understand request/parse logic
- [ ] 3.3 Implement `src/sites/builtin/index.ts` exporting `searchBuiltIn(tab, options)` — uses `tab.fetch()` against BuiltIn's internal API
- [ ] 3.4 Add row-shape adapter aligning output with `apps/server/src/adapters/job-board-scan-normalizer.ts`'s `normalizeBuiltInAdapterRows` consumer
- [ ] 3.5 Unit tests `test/sites/builtin.test.ts` — feed fixtures through parser, assert typed shape
- [ ] 3.6 Verify: `npm --prefix packages/browser run test -- builtin`

## 4. Site adapter — Indeed

- [ ] 4.1 Capture fixtures from `bb-browser site indeed/search` for representative query
- [ ] 4.2 Implement `src/sites/indeed/index.ts` exporting `searchIndeed(tab, options)`
- [ ] 4.3 Align output shape with `normalizeIndeedAdapterRows`
- [ ] 4.4 Unit tests `test/sites/indeed.test.ts`
- [ ] 4.5 Verify: `npm --prefix packages/browser run test -- indeed`

## 5. Site adapter — JobRight

- [ ] 5.1 Capture fixtures from `bb-browser site jobright/recommend` and per-job detail
- [ ] 5.2 Read existing `scripts/extractors/jobright-detail.js` and `scripts/extractors/jobright-dismiss-popups.js` for behavior parity
- [ ] 5.3 Implement `src/sites/jobright/index.ts` exporting `recommendJobright`, `jobrightDetail`, `jobrightDismissPopups`
- [ ] 5.4 Unit tests `test/sites/jobright.test.ts`
- [ ] 5.5 Verify: `npm --prefix packages/browser run test -- jobright`

## 6. Site adapter — LinkedIn

- [ ] 6.1 Capture fixtures from authenticated `bb-browser` LinkedIn calls (search list + job detail + auth-block detection)
- [ ] 6.2 Read existing `apps/extension/src/content/extract-linkedin.ts` and `apps/server/src/adapters/linkedin-scan-normalizer.ts` for compat reference
- [ ] 6.3 Implement `src/sites/linkedin/index.ts` exporting `searchLinkedIn`, `linkedInJobDetail`, `detectLinkedInAuthBlock`
- [ ] 6.4 Ensure `searchLinkedIn` output type is assignable to existing `LinkedInVisibleJobCard`
- [ ] 6.5 Unit tests `test/sites/linkedin.test.ts`
- [ ] 6.6 Verify: `npm --prefix packages/browser run test -- linkedin`

## 7. Rewrite consumer scripts

- [ ] 7.1 Write `scripts/job-board-scan.ts` — copy structure from `scripts/job-board-scan-bb-browser.ts`, replace every `runProcess("bb-browser", ...)` block with the corresponding `@auto-job/browser` adapter call; preserve all CLI flags (`--source`, `--query`, `--location`, `--limit`, `--pages`, `--score-only`, `--evaluate`, etc.)
- [ ] 7.2 Write `scripts/linkedin-scan.ts` — same swap for LinkedIn-specific bb-browser calls; keep `LINKEDIN_SCAN.md` mode behavior intact
- [ ] 7.3 Update `scripts/newgrad-scan-autonomous.ts` in place — swap JobRight bb-browser calls for `@auto-job/browser` adapter calls; preserve dedupe / scan-history / evaluation flow
- [ ] 7.4 Add a small one-time `scripts/own-browser-login-helper.mjs` that opens LinkedIn / Indeed / BuiltIn / JobRight in the dedicated profile and prints "log in, then press Enter to continue" prompts
- [ ] 7.5 Verify each script compiles: `npx tsx --check scripts/job-board-scan.ts scripts/linkedin-scan.ts scripts/newgrad-scan-autonomous.ts` (or equivalent type-check pass)

## 8. Wire commands and verification

- [ ] 8.1 Update root `package.json` script entries:
  - `"linkedin-scan": "tsx scripts/linkedin-scan.ts"`
  - `"builtin-scan": "tsx scripts/job-board-scan.ts --source builtin"`
  - `"indeed-scan": "tsx scripts/job-board-scan.ts --source indeed"`
  - keep `"newgrad-scan"` pointing at the updated `scripts/newgrad-scan-autonomous.ts`
- [ ] 8.2 Add `packages/browser` typecheck + test invocations to `verify-pipeline.mjs`
- [ ] 8.3 Add `~/.auto-job/` ignore line to root `.gitignore` (or equivalent — confirm path is user-home-relative not repo-relative)
- [ ] 8.4 Run `npm run verify` — must pass

## 9. Documentation

- [ ] 9.1 Create `docs/architecture/own-browser.md` — explains the dedicated-profile lifecycle, port choice, login-helper usage, troubleshooting (`ProfileLockedError`, `ChromeNotFoundError`)
- [ ] 9.2 Update `CLAUDE.md` "Hot file map" — add `packages/browser/` entry; note `~/.auto-job/chrome-profile/` as user-machine local
- [ ] 9.3 Update `CLAUDE.md` "Run flow" section — document `npm run own-browser:login-helper` for first-time setup
- [ ] 9.4 Add a one-line note to `docs/exec-plans/active/2026-04-27-auto-job-architecture-independence.md` Progress Log noting that the prior "Replacing bb-browser" out-of-scope decision has been reversed by this OpenSpec change

## 10. Phase 1 acceptance — score-only smoke

- [ ] 10.1 Run `npm run linkedin-scan -- --score-only --limit 10`; assert exit 0 and ≥1 row
- [ ] 10.2 Run `npm run builtin-scan -- --score-only --limit 10`; assert exit 0 and ≥1 row
- [ ] 10.3 Run `npm run indeed-scan -- --score-only --limit 10`; assert exit 0 and ≥1 row
- [ ] 10.4 Run `npm run newgrad-scan -- --score-only --limit 10`; assert exit 0 and ≥1 row

## 11. Phase 1 acceptance — dual-run parity

- [ ] 11.1 For each of the 4 scan sources, run new path and old `*-bb-browser.ts` path on the same query; dump normalized JSON outputs to `/tmp/own-browser-parity/{source}-{old|new}.json`
- [ ] 11.2 Diff per source: required fields present in ≥95% of new rows; row count within ±5%; per-row identity overlap ≥90% via `createJobIdentity()`
- [ ] 11.3 Record results in `docs/exec-plans/active/2026-05-03-own-browser-phase1.md` (new active exec plan tracking this rollout)

## 12. Phase 1 acceptance — full real run

- [ ] 12.1 Run a full (non-`--score-only`) `npm run linkedin-scan` end-to-end; verify report artifacts produced
- [ ] 12.2 Same for `builtin-scan`, `indeed-scan`, `newgrad-scan`
- [ ] 12.3 7-day stability window starts; daily scan logs go into the active exec plan
- [ ] 12.4 If user invokes any old `*-bb-browser.ts` script even once during the window, fix root cause and reset clock

## 13. Phase 1 close-out

- [ ] 13.1 After 7 consecutive days with no fallback usage, mark Phase 1 done in the active exec plan
- [ ] 13.2 Open a follow-up OpenSpec change `remove-bb-browser` covering deletion of `./bb-browser/`, the three `*-bb-browser.ts` files, and PATH dependency notes (NOT part of this change)
- [ ] 13.3 Archive `docs/superpowers/specs/2026-05-03-own-browser-design.md` if appropriate (or leave it as the historical brainstorming record)
- [ ] 13.4 Run `openspec archive add-own-browser` to move this change into archive
