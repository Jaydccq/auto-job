## ADDED Requirements

### Requirement: Workspace package `@auto-job/browser`

The system SHALL provide a TypeScript workspace package located at `packages/browser/` and published internally as `@auto-job/browser`. The package SHALL be consumable via standard workspace import from any other workspace package (`apps/server`, `apps/desktop`, `packages/shared`) and from root-level `scripts/*.ts` files.

#### Scenario: Importable from another workspace package

- **WHEN** an `apps/server` source file declares `import { BrowserController } from "@auto-job/browser"`
- **THEN** TypeScript resolves the import without error and the `npm --prefix apps/server run typecheck` command succeeds

#### Scenario: Importable from root scripts via tsx

- **WHEN** a script under `scripts/` declares `import { BrowserController } from "@auto-job/browser"` and is invoked via `tsx`
- **THEN** the script executes and the import resolves to the package's compiled or source `index.ts`

### Requirement: Chrome lifecycle management

The package SHALL expose an `ensureChrome` operation (typically via `BrowserController.ensure()`) that idempotently makes a CDP-attached Chrome browser available. If no Chrome instance is currently running on the configured debug port, the operation SHALL launch one using the configured profile directory. If an instance is already running on that port, the operation SHALL attach to it without launching a duplicate.

The default profile directory SHALL be `~/.auto-job/chrome-profile/` and the default debug port SHALL be `47320`. Both SHALL be overridable via `ControllerOptions`.

The Chrome binary SHALL be auto-detected in priority order: Chrome for Testing → Google Chrome → Chromium. If none is found, the operation SHALL throw `ChromeNotFoundError`.

#### Scenario: Cold-start launches Chrome

- **WHEN** `BrowserController.ensure()` is called and no process is listening on port 47320
- **THEN** a new Chrome process is started with `--user-data-dir=~/.auto-job/chrome-profile --remote-debugging-port=47320`
- **AND** the controller successfully attaches via `playwright.chromium.connectOverCDP("http://127.0.0.1:47320")`

#### Scenario: Warm-start attaches to existing Chrome

- **WHEN** `BrowserController.ensure()` is called and a Chrome process is already listening on port 47320 with the configured profile
- **THEN** no second Chrome process is started
- **AND** the controller attaches to the existing instance

#### Scenario: Chrome binary missing

- **WHEN** `BrowserController.ensure()` is called and no Chrome / Chrome for Testing / Chromium binary is discoverable on the system
- **THEN** the call throws `ChromeNotFoundError` with a message that includes installation guidance

#### Scenario: Profile already locked by another Chrome

- **WHEN** `BrowserController.ensure()` is called and the configured profile directory is already opened by a different Chrome process not on port 47320
- **THEN** the call throws `ProfileLockedError` with a message that identifies the conflicting process

### Requirement: Tab API

The controller SHALL expose a `Tab` abstraction representing a single browser tab. Each `Tab` SHALL provide at minimum the operations: `navigate`, `evaluate`, `snapshot`, `click`, `fill`, `fetch`, `screenshot`, `waitForNetwork`, and `close`. The `fetch` operation SHALL execute in the tab's page context so that requests carry the tab's authenticated cookies for the current origin.

Tabs SHALL support concurrent operation across multiple `Tab` instances within a single `BrowserController` (no implicit serialization).

#### Scenario: Tab fetch carries cookies for the logged-in origin

- **WHEN** a tab is opened on a site where the dedicated Chrome profile holds an authenticated session
- **AND** `tab.fetch()` is called against an authenticated endpoint of that origin
- **THEN** the response is returned without a 401/302-to-login redirect

#### Scenario: Tab operation after close throws

- **WHEN** a tab has been closed via `tab.close()`
- **AND** any of `navigate`, `evaluate`, `snapshot`, `click`, `fill`, `fetch`, `screenshot`, `waitForNetwork` is invoked on it
- **THEN** the call throws `TabClosedError`

#### Scenario: Concurrent tabs operate independently

- **WHEN** two tabs are opened on different URLs
- **AND** both tabs run a long-running `evaluate` simultaneously
- **THEN** both calls return their respective results without one blocking the other

### Requirement: Site adapter — BuiltIn

The package SHALL expose a `searchBuiltIn(tab, options)` function that, given an authenticated tab, returns a typed list of BuiltIn job rows matching the query. The shape of each row SHALL be compatible with `apps/server/src/adapters/job-board-scan-normalizer.ts` consumers.

#### Scenario: Successful BuiltIn search

- **WHEN** `searchBuiltIn(tab, { query: "...", location: "...", page: 1 })` is called against a tab on `builtin.com`
- **THEN** the function returns an array of typed job rows
- **AND** each row contains at minimum a canonical URL, company, role, and location field

#### Scenario: BuiltIn API schema change is detected

- **WHEN** `searchBuiltIn` receives a response whose shape no longer matches the captured fixture's schema
- **THEN** the function throws `AdapterParseError` with a truncated raw payload included for debugging

### Requirement: Site adapter — Indeed

The package SHALL expose a `searchIndeed(tab, options)` function that, given an authenticated tab, returns a typed list of Indeed job rows matching the query.

#### Scenario: Successful Indeed search

- **WHEN** `searchIndeed(tab, { query: "...", location: "...", page: 1 })` is called against a tab on `indeed.com`
- **THEN** the function returns an array of typed job rows compatible with the existing Indeed normalizer

### Requirement: Site adapter — JobRight

The package SHALL expose `recommendJobright(tab, options)`, `jobrightDetail(tab, jobId)`, and `jobrightDismissPopups(tab)` functions covering the recommendation feed, per-job detail fetch, and the popup dismissal sequence currently performed by `scripts/extractors/jobright-*.js`.

#### Scenario: Recommendation feed returns typed rows

- **WHEN** `recommendJobright(tab, { limit: 25 })` is called against a tab on `jobright.ai/jobs/recommend` with an authenticated session
- **THEN** the function returns an array of typed JobRight recommendation rows

#### Scenario: Popup dismissal is idempotent

- **WHEN** `jobrightDismissPopups(tab)` is called repeatedly on the same tab
- **THEN** every call returns successfully without throwing, regardless of whether popups are present

### Requirement: Site adapter — LinkedIn

The package SHALL expose `searchLinkedIn(tab, options)`, `linkedInJobDetail(tab, jobId)`, and `detectLinkedInAuthBlock(tab)` functions covering the visible-jobs search, per-job detail, and authentication-state detection currently used by `scripts/linkedin-scan-bb-browser.ts`.

#### Scenario: Detect LinkedIn auth-wall block

- **WHEN** `detectLinkedInAuthBlock(tab)` is called against a tab whose URL or content indicates LinkedIn has blocked the session (e.g., login wall, captcha)
- **THEN** the function returns a structured indicator identifying the block type

#### Scenario: Search returns visible job cards

- **WHEN** `searchLinkedIn(tab, { keywords, location, pageSize: 25, pages: 1 })` is called against a tab with an authenticated LinkedIn session
- **THEN** the function returns an array of typed `LinkedInVisibleJobCard` objects compatible with the existing normalizer at `apps/server/src/adapters/linkedin-scan-normalizer.ts`

### Requirement: Named error types, no silent degradation

All anticipated failure modes SHALL surface as distinct named error classes exported from the package: `ChromeNotFoundError`, `ProfileLockedError`, `NotAuthenticatedError`, `TabClosedError`, `AdapterParseError`. The library SHALL NOT silently retry, silently fall back to a degraded mode, or swallow errors.

The single permitted automatic recovery SHALL be ONE retry of the CDP attach step if the playwright `disconnected` event fires during a tab operation. If that retry also fails, the original error SHALL be rethrown.

#### Scenario: Adapter parse error surfaces, not crashes

- **WHEN** an adapter parser fails because the upstream site changed schema
- **THEN** an `AdapterParseError` is thrown
- **AND** consumer code can catch it by class without string-matching on the message

#### Scenario: Authentication failure is distinguishable

- **WHEN** an adapter receives a response indicating the user is not logged in to the target site
- **THEN** a `NotAuthenticatedError` is thrown carrying the site name
- **AND** consumer code can branch on `error.site === "linkedin"` etc.

### Requirement: Test coverage and verification

The package SHALL include unit tests covering the parse layer of each site adapter against captured fixtures, and SHALL include at least one integration test covering the full `BrowserController.ensure()` → `openTab()` → `evaluate()` → `close()` lifecycle against a real Chrome instance.

The package's typecheck and test commands SHALL be wired into the repository's existing `npm run verify` pipeline (via `verify-pipeline.mjs`).

#### Scenario: Per-adapter unit tests run under vitest

- **WHEN** `npm --prefix packages/browser run test` is executed
- **THEN** unit tests for builtin, indeed, jobright, and linkedin adapters all run and pass against their captured fixtures

#### Scenario: verify-pipeline includes the new package

- **WHEN** `npm run verify` is executed at the repo root
- **THEN** the pipeline runs `packages/browser` typecheck and tests in addition to the existing checks
- **AND** failure of either causes `npm run verify` to exit non-zero

### Requirement: Consumer scripts use the new library

The four scan commands `npm run linkedin-scan`, `npm run builtin-scan`, `npm run indeed-scan`, and `npm run newgrad-scan` SHALL invoke scripts that import `@auto-job/browser` instead of spawning the `bb-browser` PATH binary. The output row shape produced by each command SHALL remain compatible with the existing downstream pipeline (normalize → score → enrich → evaluate).

The old `scripts/*-bb-browser.ts` files and the `./bb-browser/` directory SHALL remain on disk during this change; their removal is deferred to a follow-up OpenSpec change after a 7-day stability window.

#### Scenario: linkedin-scan no longer requires bb-browser on PATH

- **WHEN** the `bb-browser` binary is not available on PATH
- **AND** `npm run linkedin-scan -- --score-only --limit 5` is executed
- **THEN** the command exits 0 and produces normalized scan output

#### Scenario: Output compatibility with downstream pipeline

- **WHEN** any of the four scan commands runs end-to-end via the new library
- **THEN** the scored/filtered/enriched row shape matches what the existing `apps/server/src/adapters/*` consumers expect, with no schema changes required downstream

#### Scenario: Old scripts remain available as manual fallback

- **WHEN** during the 7-day stability window the user invokes `npx tsx scripts/linkedin-scan-bb-browser.ts ...` directly (bypassing `npm run`)
- **THEN** the old script still runs successfully against the bb-browser PATH binary
