# Own-Browser Design — Replace bb-browser

**Date:** 2026-05-03
**Branch:** `feat/own-browser`
**Status:** Brainstorming output, awaiting OpenSpec landing
**Author:** Hongxi Chen (with Claude Code)

---

## Background

`auto-job` currently depends on `bb-browser` (an upstream tool by epiral) for
all browser-mediated job operations. The dependency is consumed in three
places:

- `scripts/linkedin-scan-bb-browser.ts`
- `scripts/job-board-scan-bb-browser.ts` (BuiltIn + Indeed)
- `scripts/newgrad-scan-autonomous.ts` (JobRight)

The dependency is invoked as a PATH binary (`bb-browser`) via `child_process`
spawn, returning JSON envelopes `{success, data | error}`. A nested fork of
the bb-browser source tree lives at `./bb-browser/` (separate git repo,
pnpm workspace, ~36 platforms / 103 commands of which auto-job uses ~6).

The previous architecture-independence migration
(`docs/exec-plans/active/2026-04-27-auto-job-architecture-independence.md`)
explicitly listed "Replacing bb-browser" and "Automated application
submission" as **out of scope**. This spec reverses both decisions.

## Goal

Replace the bb-browser dependency with a self-owned in-process TypeScript
library, so that:

1. **Phase 1 (this spec):** All four scan flows continue to work without
   `./bb-browser/`. The nested directory becomes deletable.
2. **Phase 2 (separate spec, separate OpenSpec change):** The same library is
   extended to perform automated job applications (auto-fill, auto-submit) on
   the user's behalf. This requires explicit revision of `CLAUDE.md`'s
   ethical "never submit" clause.

This spec covers Phase 1 only. Phase 2 is referenced for forward
compatibility but is not implemented here.

## Anchor Decisions (locked during brainstorming)

| ID | Decision | Rationale |
|----|----------|-----------|
| **A1** | Read-replacement first, then write capability | Minimum-risk strangler pattern; ethics revision deferred to Phase 2 |
| **A2** | Dedicated isolated Chrome profile, not user's daily Chrome | Auto-submit safety; daily-browser cookie pollution risk; testing isolation |
| **A3** | Pure TypeScript in-process library; no daemon, no CLI | Auto-job's consumers are long-running TS processes — no shared-CDP need |
| **A4** | Playwright `connectOverCDP` as the protocol-layer driver | Zero new deps (already root dep); battle-tested; we own the API layer above |

## Sub-Decisions

| ID | Decision |
|----|----------|
| **D1** | New workspace package `packages/browser/`, name `@auto-job/browser` |
| **D2** | Site adapters as hardcoded TS files under `packages/browser/src/sites/{builtin,indeed,jobright,linkedin}/`. No dynamic loader. |
| **D3** | Library exposes `ensureChrome()` — idempotent: launch if down, attach if up |
| **D4** | Profile path: `~/.auto-job/chrome-profile/` (gitignored) |
| **D5** | CDP debug port: `47320` (one above bridge port `47319`) |
| **D6** | Chrome binary auto-detected: Chrome for Testing → Google Chrome → Chromium → error |
| **D7** | Multi-tab via tab-pool API (`controller.openTab` returns `Tab` instance) |
| **D8** | Keep `./bb-browser/` during transition; delete only after Phase 1 acceptance + 7-day stability window |
| **D9** | No MCP server mode in Phase 1 |
| **D10** | OpenSpec landing: one change `add-own-browser` for Phase 1; Phase 2 gets its own change |

## Scope

**In scope:**

- New workspace package `packages/browser/` exposing `BrowserController`, `Tab`, and four site adapters
- Chrome lifecycle management (`ensureChrome`, attach via `connectOverCDP`)
- Rewrite of three consumer scripts to import the new library:
  - `scripts/linkedin-scan-bb-browser.ts` → `scripts/linkedin-scan.ts`
  - `scripts/job-board-scan-bb-browser.ts` → `scripts/job-board-scan.ts`
  - `scripts/newgrad-scan-autonomous.ts` → updated in place
- Unit tests (adapter parsers via fixtures) and one integration test (real Chrome lifecycle)
- Update `package.json` scripts: `linkedin-scan`, `builtin-scan`, `indeed-scan`, `newgrad-scan`
- Update `verify-pipeline.mjs` to test the new package
- Update `CLAUDE.md` "Hot file map" and run-flow sections
- Add `docs/architecture/own-browser.md` describing the runtime layer

**Out of scope (Phase 1):**

- Auto-apply / auto-submit / auto-click on Apply (Phase 2)
- MCP server mode
- bb-browser-style site/* dispatch CLI
- Daemon process or HTTP API
- Removing `./bb-browser/` directory (deferred to post-acceptance cleanup)
- Editing `CLAUDE.md` ethical clauses (Phase 2)

## Assumptions

- Playwright `^1.58.1` (current root dep) supports `connectOverCDP` against
  Chrome 119+; verified by Playwright docs.
- The user has Google Chrome (or Chromium / Chrome for Testing) installed in a
  standard location.
- The user accepts a one-time manual login session to populate the dedicated
  profile's cookies for LinkedIn, Indeed, BuiltIn, and JobRight.
- LinkedIn / Indeed / BuiltIn / JobRight have not changed their internal API
  contracts since the bb-browser adapters were last verified (2026-04-28
  per scan-operations summary).
- `apps/server` and `packages/shared` workspace conventions (TS, vitest,
  package.json `type: module`) are the right template for `packages/browser`.

## Architecture

```text
                        ~/.auto-job/chrome-profile/
                                  │
                       (persistent cookies, sessions)
                                  │
                                  ▼
            ┌─────────────────────────────────────────┐
            │   Dedicated Chrome (port 47320)         │
            │   started/attached by ensureChrome()    │
            └─────────────────────────────────────────┘
                                  ▲
                       CDP via playwright connectOverCDP
                                  │
            ┌─────────────────────────────────────────┐
            │   @auto-job/browser   (NEW package)     │
            │                                         │
            │   - BrowserController                   │
            │   - Tab (open/eval/snapshot/click/      │
            │           fill/fetch/screenshot/        │
            │           waitForNetwork)               │
            │   - sites/builtin    (search list)      │
            │   - sites/indeed     (search list)      │
            │   - sites/jobright   (recommend)        │
            │   - sites/linkedin   (search/detail)    │
            └─────────────────────────────────────────┘
                                  ▲
                                  │  TS import
                                  │
            ┌─────────────────────────────────────────┐
            │   scripts/                              │
            │   - linkedin-scan.ts        (rewritten) │
            │   - job-board-scan.ts       (rewritten) │
            │   - newgrad-scan-autonomous (rewritten) │
            └─────────────────────────────────────────┘

      [./bb-browser/ stays until Phase 1 acceptance + 7-day window]
```

## Public API Surface

```ts
// packages/browser/src/index.ts

export interface ControllerOptions {
  profileDir?: string;         // default: ~/.auto-job/chrome-profile
  port?: number;               // default: 47320
  chromeBinary?: string;       // default: auto-detect
  headed?: boolean;            // default: true (CDP attach implies visible)
}

export class BrowserController {
  static async ensure(opts?: ControllerOptions): Promise<BrowserController>;

  async openTab(url: string): Promise<Tab>;
  async listTabs(): Promise<TabInfo[]>;

  async close(): Promise<void>;       // disconnect, leave Chrome running
  async shutdown(): Promise<void>;    // disconnect + kill Chrome
}

export interface TabInfo {
  id: string;
  url: string;
  title: string;
}

export interface Tab {
  readonly id: string;
  readonly url: string;

  navigate(url: string, opts?: NavigateOptions): Promise<void>;
  evaluate<T>(fn: string | Function, ...args: unknown[]): Promise<T>;
  snapshot(): Promise<AccessibilitySnapshot>;
  click(selector: string): Promise<void>;
  fill(selector: string, value: string): Promise<void>;
  fetch(url: string, init?: FetchInit): Promise<FetchResult>;
  screenshot(opts?: ScreenshotOptions): Promise<Buffer>;
  waitForNetwork(matcher: RequestMatcher, opts?: WaitOptions): Promise<NetworkRecord>;
  close(): Promise<void>;
}

// Site adapters — typed functions, not generic dispatch
export { searchBuiltIn } from './sites/builtin';
export { searchIndeed } from './sites/indeed';
export {
  recommendJobright,
  jobrightDetail,
  jobrightDismissPopups,
} from './sites/jobright';
export {
  searchLinkedIn,
  linkedInJobDetail,
  detectLinkedInAuthBlock,
} from './sites/linkedin';

// Errors (named, not stringly-typed)
export class ChromeNotFoundError extends Error {}
export class ProfileLockedError extends Error {}
export class NotAuthenticatedError extends Error {
  constructor(public readonly site: string) { super(`Not authenticated: ${site}`); }
}
export class TabClosedError extends Error {}
export class AdapterParseError extends Error {
  constructor(message: string, public readonly rawSnippet: string) { super(message); }
}
```

## Data Flow (LinkedIn scan example)

```text
1. scripts/linkedin-scan.ts launches.
2. const controller = await BrowserController.ensure()
   - Probe 47320: if no live process, launch Chrome with profile + port.
   - playwright.chromium.connectOverCDP('http://127.0.0.1:47320')
3. const tab = await controller.openTab('about:blank')
4. const cards = await searchLinkedIn(tab, {
     keywords, location, pageSize: 25, pages: 6,
   })
   - Adapter calls tab.fetch('https://www.linkedin.com/voyager/...')
   - Returns typed LinkedInVisibleJobCard[]
5. Existing normalize / score / filter / enrich / evaluate pipeline runs
   unchanged (these live in apps/server/src/adapters/* and don't know about
   the browser layer).
6. controller.close()  — disconnect; do not kill Chrome.
```

## Error Handling Matrix

| Failure | Detection | Handling |
|---------|-----------|----------|
| Chrome not installed | All binary probes fail | Throw `ChromeNotFoundError` with install hint |
| Profile already in use by another Chrome | CDP attach gets port-conflict / locked-profile | Throw `ProfileLockedError` with PID info |
| Site not logged in | Adapter call returns 401/302 to login | Throw `NotAuthenticatedError(siteName)` with login URL |
| CDP socket dropped (Chrome crashed) | Playwright `disconnected` event | Library attempts ONE auto-restart + reconnect; on failure rethrow |
| Tab closed mid-operation | Playwright tab `close` event | Tab-method calls throw `TabClosedError` |
| Site API schema changed | Adapter parse fails | Throw `AdapterParseError` with truncated raw payload |

**No silent degradation.** Every failure surfaces a named error so consumer
scripts can decide retry vs abort.

## Test Strategy

| Layer | Tool | Coverage target |
|-------|------|-----------------|
| Unit | vitest (matches `apps/server`) | Each site adapter's parse layer with HTML/JSON fixtures captured from real bb-browser runs |
| Integration | vitest + real Chrome | `BrowserController.ensure()` → `openTab` → `evaluate('1+1')` → `close()` end-to-end |
| Smoke | manual + CI | All four `npm run *-scan -- --score-only --limit 10` pass |
| Regression | `npm run verify` | Add `npm --prefix packages/browser run test/typecheck` to verify-pipeline |

**Explicitly NOT tested:**
- CDP protocol itself (Playwright owns this)
- Chrome process internals (kept simple enough not to mock)
- `./bb-browser/` (slated for deletion)

## Phase 1 Acceptance Criteria

All must hold before Phase 1 is considered done:

1. `packages/browser` unit + integration tests pass (`npm --prefix packages/browser run test`).
2. All four scan commands run with `--score-only --limit 10` and exit 0.
3. For each of the four scan sources, a side-by-side dual-run produces results that match the old bb-browser path on these axes:
   - **Required fields present:** every field consumers downstream rely on (canonical URL, company, role, location, posted-at) is non-null in the new output for ≥95% of rows.
   - **Row count:** within ±5% of the old path on the same query (variance from server-side ranking is acceptable; large drops are not).
   - **Per-row identity:** ≥90% of rows in the smaller of (old, new) outputs map to the same `createJobIdentity()` key in the other output.
4. `npm run verify` passes (existing pipeline + new package gates).
5. At least one full real (non-score-only) run of each of the four scans produces a sensible report.
6. Seven calendar days of daily use with no regression on any of the four scans.

Only after all six are met do we proceed to delete `./bb-browser/` and the `*-bb-browser.ts` script names.

## Migration Plan

| Step | Action | Verification |
|------|--------|--------------|
| 1 | Create `packages/browser/` skeleton (package.json, tsconfig, vitest.config) | `npm --prefix packages/browser run typecheck` |
| 2 | Implement `BrowserController` + `Tab` against playwright `connectOverCDP` | Integration test: ensure → openTab → evaluate → close |
| 3 | Port `sites/builtin` adapter from `./bb-browser/sites/builtin/`. **Fixture capture:** invoke `bb-browser site builtin/search ...` once with `--json`, save raw response under `packages/browser/test/fixtures/builtin/`, then port the parser. | Unit tests vs captured fixtures |
| 4 | Port `sites/indeed` adapter (same fixture-capture pattern) | Unit tests vs captured fixtures |
| 5 | Port `sites/jobright` adapter (same fixture-capture pattern) | Unit tests vs captured fixtures |
| 6 | Port `sites/linkedin` adapter (same fixture-capture pattern; LinkedIn requires logged-in session) | Unit tests vs captured fixtures |
| 7 | Rewrite `scripts/job-board-scan.ts` (drop `-bb-browser` suffix) | `npm run builtin-scan -- --score-only --limit 10` |
| 8 | Rewrite `scripts/linkedin-scan.ts` | `npm run linkedin-scan -- --score-only --limit 10` |
| 9 | Update `scripts/newgrad-scan-autonomous.ts` | `npm run newgrad-scan -- --score-only --limit 10` |
| 10 | Update `package.json` script entries (point at new files) | All four scan commands listed by `npm run` |
| 11 | Wire `packages/browser` test/typecheck into `verify-pipeline.mjs` | `npm run verify` |
| 12 | Update `CLAUDE.md` Hot file map; add `docs/architecture/own-browser.md` | `npm run verify:repo-guard`; grep confirms no stale references to `*-bb-browser.ts` in active docs |
| 13 | Live for 7 days; package.json points at new files, **old `*-bb-browser.ts` files remain on disk** so user can invoke them manually (`npx tsx scripts/linkedin-scan-bb-browser.ts ...`) if the new path fails | Daily scan logs; if old fallback needed even once, fix root cause and reset 7-day clock |
| 14 | Delete `./bb-browser/`, the three `*-bb-browser.ts` files, and bb-browser PATH dependency note in CLAUDE.md / docs | `npm run verify`; `git grep -i bb-browser` returns only attribution/archive contexts; final spec close-out |

## Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Adapter parse drift between bb-browser fixtures and live site response | Medium | Medium | Capture fresh fixtures per adapter at port time; unit tests compare to captured shape |
| Playwright `connectOverCDP` regressions on Chrome 130+ | Low | High | Pin Chrome for Testing version in `ensureChrome` if needed; fall back to user-installed Chrome |
| One-time profile login is more painful than estimated | Medium | Low | Provide `npm run own-browser:login-helper` that opens each site in the dedicated Chrome and walks the user through |
| Scan scripts had hidden coupling to bb-browser-specific JSON envelope quirks | Medium | Medium | Side-by-side dual-run during step 13 catches diffs before deletion |
| Chrome lock contention if the dedicated profile is opened manually by the user | Low | Medium | `ProfileLockedError` with clear remediation; document in `docs/architecture/own-browser.md` |

## Phase 2 Forward-Look (NOT implemented in this spec)

Phase 2 will require its own OpenSpec change. Range:

- Auto-fill ATS forms (Workday / Greenhouse / Lever): per-ATS adapter under `packages/browser/src/apply/`
- LinkedIn Easy Apply auto-submit
- Mandatory pre-submit screenshot + audit log to `data/applications/{id}/submission-evidence/`
- Per-application explicit user authorization gate (no implicit "auto on all postings")
- **Revision of `CLAUDE.md` ethical clause** — separate user-approved doc PR before any auto-submit code merges

## Open Questions

None at spec time. All anchor decisions and sub-decisions are committed.

## References

- bb-browser README (`./bb-browser/README.md`) — surface area being replaced
- `docs/exec-plans/active/2026-04-27-auto-job-architecture-independence.md` — prior architectural ground; this spec is a deliberate scope expansion
- `docs/architecture/scanner-lifecycle.md` — where this library plugs into the scan pipeline
- Playwright `BrowserType.connectOverCDP` — primary API used as foundation
