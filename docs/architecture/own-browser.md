# own-browser — runtime layer

`@auto-job/browser` (under `packages/browser/`) is the in-process,
CDP-attached browser automation library that replaces the bb-browser
PATH binary for all scan flows. Phase 1 covers the read path. Phase 2
(separate OpenSpec change) will add write capability for auto-applying.

## Components

| Component | File | Role |
|-----------|------|------|
| `BrowserController` | `src/browser-controller.ts` | Owns the playwright Browser instance bound to the dedicated Chrome via CDP. |
| `Tab` | `src/tab.ts` | Per-tab API: navigate, evaluate, snapshot, click, fill, fetch, screenshot, waitForNetwork, close. |
| `ensureChrome()` | `src/ensure-chrome.ts` | Idempotent: probe port 47320 → if down, launch Chrome with the dedicated profile; if up, attach. |
| `detectChromeBinary()` | `src/chrome-binary.ts` | Auto-detects Chrome for Testing → Google Chrome → Chromium. Throws `ChromeNotFoundError` if none. |
| Site adapters | `src/sites/{builtin,indeed,jobright,linkedin}/` | Typed wrappers that run the bb-browser site source verbatim via `tab.evaluate`. |
| `bb-shim` | `src/bb-shim.ts` | Drop-in replacements for the legacy `openBbTab/closeBbTab/listBbTabs/evaluateBrowserJson/bbFetch/assertBbBrowserAvailable` helpers. Backed by a single in-process controller. |

## Dedicated Chrome profile

- Path: `~/.auto-job/chrome-profile/` (user home, NOT in repo)
- CDP debug port: `47320` (one above the bridge port `47319`)
- Auto-launched on first `BrowserController.ensure()` call when no
  Chrome instance is listening on that port.

This profile is **separate from the user's daily Chrome** so that:
1. Daily browsing and automation cannot share cookie/session state by accident.
2. Phase 2 auto-submit cannot reach the user's logged-in Gmail / payment cards / private tabs.
3. The profile can be wiped without affecting daily browsing.

The cost is one-time logins to LinkedIn / Indeed / BuiltIn / JobRight.
Use the helper to walk through them:

```bash
npm run own-browser:login-helper
```

Cookies persist across runs.

## Lifecycle

```
First scan of the day
  └─ BrowserController.ensure()
     ├─ probe port 47320 → no listener
     ├─ detectChromeBinary() → e.g. /Applications/Google Chrome.app/...
     ├─ spawn Chrome with --user-data-dir + --remote-debugging-port + --no-first-run
     ├─ poll until /json/version responds (up to 30s)
     └─ playwright.chromium.connectOverCDP("http://127.0.0.1:47320")

Subsequent scans (or parallel)
  └─ BrowserController.ensure()
     ├─ probe port 47320 → existing listener
     └─ playwright.chromium.connectOverCDP — attach to running instance
```

`controller.close()` disconnects from CDP but leaves Chrome running.
`controller.shutdown()` additionally kills the Chrome process if this
controller launched it.

## Site adapters — the embed-source approach

Each `src/sites/{builtin,indeed,jobright}/index.ts` carries the original
bb-browser site source as a string constant. The wrapper:

1. Navigates the tab to the site's domain (so `location.href` and
   credentials are correct).
2. Evaluates `(${SOURCE})(${JSON.stringify(opts)})` via `tab.evaluate`.
3. Returns the typed result; throws `AdapterParseError` if the
   adapter returned an `{error, hint?, action?}` payload.

Consequences:
- 100% behavioral parity with bb-browser (same DOMParser, same fetch
  credentials, same edge-case handling).
- Zero new Node-side dependencies (no cheerio, no happy-dom in
  production).
- Source updates from upstream bb-browser require manual sync (acceptable —
  bb-browser is being deleted at the end of Phase 1).

LinkedIn does NOT carry embedded source because bb-browser never had a
LinkedIn adapter; the existing LinkedIn extractors live in
`apps/extension/src/content/extract-linkedin.ts` and are passed into the
`searchLinkedIn / linkedInJobDetail` wrappers as parameters.

## Error handling — no silent degradation

All anticipated failure modes throw distinct named classes:

| Class | When |
|-------|------|
| `ChromeNotFoundError` | No Chrome / Chrome for Testing / Chromium found in standard locations. |
| `ProfileLockedError` | The dedicated profile is already opened by another Chrome process. |
| `NotAuthenticatedError` | Site responded with 401 / 302-to-login. Carries `site` field for branching. |
| `TabClosedError` | Operation invoked on a Tab whose page has been closed. |
| `AdapterParseError` | Site adapter returned an error payload (typically site schema change or HTTP failure). Carries truncated raw payload. |

The library performs ONE automatic retry of the CDP attach if playwright
fires a `disconnected` event. Beyond that, errors propagate.

## Troubleshooting

**"Chrome process is alive but `ensureChrome()` keeps timing out"** — check
that the running instance was launched with `--remote-debugging-port=47320`.
If a manual `Google Chrome` window is using the dedicated profile without
the debug port, you'll get `ProfileLockedError`. Close that window.

**"LinkedIn / Indeed scan returns zero rows"** — the dedicated profile
probably needs re-login. Run `npm run own-browser:login-helper`.

**"Chrome binary not found" on Linux/WSL** — install Google Chrome or
Chromium, or pass `chromeBinary` explicitly via `BrowserController.ensure({ chromeBinary: "/usr/bin/google-chrome" })`.

## Anti-bot posture

Architectural defenses (the bulk of the protection):

| Defense | Why it matters |
|---------|----------------|
| Attach via `connectOverCDP` to a user-launched real Chrome (not `playwright.launch`) | Skips the `--enable-automation` flag and `--disable-blink-features=AutomationControlled` that playwright's launch path injects by default. These are the #1 thing bot detectors look for. |
| Real Google Chrome binary, not Chromium / Chrome for Testing only when present | UA, plugins, WebGL vendor strings all match a real user. Chromium has tells (`HeadlessChrome` UA fragment, distinct WebGL vendor) that real Chrome does not. |
| Persistent profile (`~/.auto-job/chrome-profile/`) | Cookies, localStorage, browsing history accumulate naturally across sessions. Sites see a returning user, not a fresh visitor every time. |
| User performs real interactive logins via `npm run own-browser:login-helper` | Login completion proves to the site that this profile is human-driven. Subsequent automated reads inherit that trust. |
| No `--disable-popup-blocking` (real users have popup blocking on) | Removed from the launch args because it was a fingerprintable deviation from default Chrome. |

Defensive patches (`src/stealth.ts`, applied via `context.addInitScript()` on every new page):

- Re-asserts `navigator.webdriver = false` even if a hostile page script tries to redefine the property. Empirically, our default already returns `false` (verified by `test/_manual-leak-check.mjs`); this is belt-and-suspenders.
- Adds a benign descriptor for `Navigator.prototype.webdriver` so detectors that check for the descriptor's existence don't trip.

What we deliberately do NOT do:

- Fake `window.chrome.runtime` — vanilla Chrome with no extensions returns `undefined` for `chrome.runtime`, so leaving it alone is correct. Faking can backfire when sites probe specific properties like `chrome.runtime.id` or `chrome.runtime.connect`.
- Fake `navigator.plugins` / `languages` / `WebGL` fingerprint — already realistic on real Chrome.
- Inject fake mouse-movement noise — not needed for Phase 1's read-only flows (we only call `tab.fetch()` from inside the page; no clicks). Phase 2 (auto-apply) will revisit this.

Diagnostic tool: `test/_manual-leak-check.mjs` opens a tab and dumps every property anti-bot detectors typically inspect. Run it any time you suspect a leak:

```bash
./apps/server/node_modules/.bin/tsx packages/browser/test/_manual-leak-check.mjs
```

Verified clean against Chrome 147 on macOS as of 2026-05-03:
`navigator.webdriver: false`, real plugins, real UA, real M3 GPU fingerprint.

## Migration from bb-browser

Phase 1 (this layer) is in production-ready state when:

- `npm run linkedin-scan / builtin-scan / indeed-scan / newgrad-scan -- --score-only --limit 10` all pass
- 7 days of daily use with no need to fall back to the old `*-bb-browser.ts` scripts

Phase 1 deletion of `./bb-browser/` and the old `*-bb-browser.ts` files
happens in a follow-up OpenSpec change (`remove-bb-browser`) once the
acceptance window holds.

Phase 2 (auto-apply) lives in a separate OpenSpec change. It will add
ATS adapters under `packages/browser/src/apply/` and require explicit
revision of `CLAUDE.md`'s "never submit" clause.
