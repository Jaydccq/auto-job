# auto-job — long-term architecture (post bb-browser replacement)

**Date:** 2026-05-04
**Branch:** `feat/enterprise-ats` (Phase 1.5 starts here; later phases live in private fork)
**Status:** Brainstorming output — full-system architecture; this single doc is the contract that future OpenSpec changes slice out of.
**Author:** Hongxi Chen (with Claude Code)

---

## Background

PR #8 (merged 2026-05-04 as `011caf8`) replaced bb-browser with the in-process `@auto-job/browser` package. Phase 1 covers the read path (scan flows). The user's stated long-term goal is **auto-apply on every job that scored highly enough during evaluation**, including (a) per-company signup if no account yet, (b) automated form fill, (c) Gmail-driven email-verification clicking.

This spec defines the system-level architecture for that goal, decomposed into shippable phases. Phase 1.5 (this OpenSpec change) is read-only adapter expansion. All write/auto-apply phases live in a separate private fork (`Jaydccq/auto-job-private`).

## Goals

1. Continue the existing scan-and-evaluate pipeline — never auto-act on jobs that were not first scored.
2. When a job's evaluation score crosses a user-configured threshold, optionally enqueue an auto-apply.
3. The auto-apply path emulates a real human in the dedicated Chrome — not just `navigator.webdriver=false`, but humanized mouse paths, keystroke dynamics, dwell times, and reading delays — to defeat behavior-fingerprint detectors (Datadome / Akamai Bot Manager / PerimeterX).
4. Credentials live in macOS Keychain only. Never on disk plaintext, never on network.
5. Email verification (and only email verification — not full email automation) reuses the existing Gmail OAuth pipeline.
6. Risk telemetry monitors detection rate per ATS; one captcha or "verification required" hit on an ATS auto-cooldowns that ATS for 7 days.
7. Auto-apply quotas are user-configurable; the plumbing is in place but defaults to **disabled** until the user opts in.

## Non-Goals

- Mass-volume auto-apply. Quality > quantity is preserved as a hard architectural property — the high-score gate enforces it.
- Bypassing CAPTCHA. If a CAPTCHA appears, the entire ATS goes into cooldown; we don't try to solve it.
- Residential proxy rotation. Adds attack surface (proxy logs, leak risk) without proportional benefit.
- Cross-platform (Linux/Windows). macOS is the only supported OS. Keychain integration is macOS-specific.
- Refactoring `@auto-job/browser`'s public API. Phase 1.5 only adds adapters.

## Anchor Decisions (locked)

| ID | Decision | Why |
|----|----------|-----|
| **A1** | Auto-apply is **score-gated**: never fires on jobs not yet evaluated, never fires below user-set `auto_threshold`. | Quality > quantity is the architectural answer to anti-bot detection — low volume is the primary defense. |
| **A2** | Public repo (`Jaydccq/auto-job`) holds **read-only** code. Auto-apply / signup / vault / email-bot live in private fork (`Jaydccq/auto-job-private`). | Public + private separation. Public is open and auditable; private holds operationally sensitive automation. |
| **A3** | Credential vault is **macOS Keychain only** (`security` CLI, 0 deps). User may use the same password across sites (`vaultGenerate` is optional helper, not default). | Keychain is OS-level encrypted. User-chosen password reuse is a UX preference, not a security policy decision. |
| **A4** | Behavior humanizer (Bezier mouse + variable typing + reading delays + tab focus jitter) is the **per-action defense** against Datadome / Akamai BM / PerimeterX. | Architectural-layer defenses (CDP-attach, real Chrome, persistent profile) handle low-level fingerprints; humanizer handles behavior-sequence fingerprints. |
| **A5** | Risk Telemetry phase ships **before** Auto-Signup phase (5 before 4). | Don't fire the highest-risk action without the monitoring that catches its failure mode. |
| **A6** | Daily quotas / `auto_threshold` are **defined in config schema** but **default to disabled** (threshold=`null`, max_per_day=`0`). User opts in by setting concrete values. | Plumbing complete, switch in user's hand. No accidental auto-apply at install time. |
| **A7** | Single device fingerprint + single residential IP is the accepted operational profile. Maximum sustainable auto-apply volume is **~30/week** before device-burn risk dominates. | Acknowledged trade-off — see Threat Model §3. |
| **A8** | Auto-apply targets **only the 4 supported ATS** (Greenhouse, Lever, Ashby, Workday) plus iCIMS. Other ATS = manual. | Scope discipline. Each ATS is engineering investment; expand only after measured success on existing 5. |

## Threat Model

### 1. Behavior-sequence fingerprinting (Datadome / Akamai BM / PerimeterX)

Modern bot detectors past the `navigator.webdriver` era. They look at:

- Mouse movement curvature (humans don't go in straight lines)
- Keystroke dwell time + flight time + typo correction patterns
- Click pre-dwell (humans hover before clicking)
- Element-to-action latency relative to text length (reading time)
- Tab focus changes, ambient signals, time-of-day patterns

**Mitigation:** the `Humanizer` layer (Phase 2A). See §6 Components.

### 2. Device + IP + Behavior triple correlation

Detectors correlate the three. Identical behavior across many sites from one device → anomalous.

**Mitigation:**
- Stable device fingerprint (already locked by dedicated profile)
- Stable residential IP (user's home)
- Behavior randomized per-session via seed: today "fast typer", tomorrow "slow reader"
- Acknowledged limit: ~30 auto-applies/week from single device+IP before signal saturation

### 3. Cross-ATS signal sharing

Workday / iCIMS / Greenhouse / Lever / Ashby may share anti-bot intelligence (Akamai BM is a common vendor across them).

**Mitigation:**
- Risk Telemetry detects first sign of trouble (CAPTCHA, login lockout, "verification required" page) and cools that ATS down for 7 days
- **No retries on detection** — first hit assumed real, not transient
- User informed acceptance: device fingerprint may be permanently burned in 6-12 months. Backup plan = new macOS user account or new Mac.

## Components — full system

```
+----------------------------------------------------------+
|  EXISTING (no change)                                    |
|  scripts/*-scan.ts → /v1/evaluate → reports/ + tracker  |
+----------------------------+-----------------------------+
                             |
                             v
+----------------------------+-----------------------------+
|  [APPLY GATE]   (Phase 2A, private)                      |
|   if score >= auto_threshold AND ats supported           |
|       AND daily_quota not hit AND no cooldown            |
|       enqueue → data/apply-queue.jsonl                   |
|   else                                                   |
|       enqueue → data/manual-review.jsonl (existing)      |
+----------------------------+-----------------------------+
                             |
                             v
+----------------------------+-----------------------------+
|  [APPLY ENGINE]   (Phase 2A→2B, private)                 |
|   per-tick reads queue, dispatches to per-ATS flow       |
|   each flow uses HumanizedTab (not raw Tab)              |
+----------+--------+--------+--------+--------+-----------+
           v        v        v        v        v
     Greenhouse  Lever    Ashby   Workday   iCIMS    (per-ATS apply flows)
     2A          2B       2B      2B        2B
                             |
                             v (each flow may need)
+----------------------------+-----------------------------+
|  [HUMANIZER]   (Phase 2A, private)                       |
|   - mouse: bezier path with jitter (3-segment, 30-60     |
|       steps, 8-16ms each)                                |
|   - keyboard: per-char dwell 250-400ms, ~1% backspace    |
|       correction                                         |
|   - reading: dwell 60ms/char (clamp 200ms..3s) before    |
|       acting on element                                  |
|   - session: 60-120s tab focus jitter, occasional scroll |
|   - per-session "personality" seed                       |
+----------------------------+-----------------------------+
                             |
+----------------------------+-----------------------------+
|  [CREDENTIAL VAULT]   (Phase 2A, private)                |
|   macOS Keychain via `security` CLI                      |
|   key = "auto-job:<ats>-<tenant>"                        |
|   value = { email, password }                            |
|   vaultPut/vaultGet/vaultDelete  (vaultGenerate optional)|
|   never logged, never networked                          |
+----------------------------+-----------------------------+
                             |
+----------------------------+-----------------------------+
|  [EMAIL BOT]   (Phase 3, private)                        |
|   reuses existing Gmail OAuth                            |
|   queries: newer_than:1h from:(*ats*) subject:(verify..) |
|   extracts URL, validates against ATS hostname allowlist |
|   opens in dedicated Chrome via HumanizedTab             |
|   reading delay → click confirm → mark email read        |
|   ONLY clicks links matching pre-defined ATS hosts       |
+----------------------------+-----------------------------+
                             |
+----------------------------+-----------------------------+
|  [AUTO-SIGNUP]   (Phase 4, private — LAST)               |
|   per-ATS signup flow                                    |
|   uses vault.put with user-chosen or generated password  |
|   triggers email verification → handed off to Email Bot  |
|   ABSOLUTE PRECONDITION: Phase 5 telemetry running       |
+----------------------------+-----------------------------+
                             |
+----------------------------+-----------------------------+
|  [RISK TELEMETRY]   (Phase 5, private — BEFORE Phase 4)  |
|   per-ATS counters: success / fail / suspected_ban       |
|   detection rules:                                       |
|     - HTTP 403 with anti-bot fingerprint in body         |
|     - presence of CAPTCHA element in DOM                 |
|     - "Account locked" / "Verification required" pages   |
|     - 5xx burst from single ATS                          |
|   any 1 detection → that ATS into 7-day cooldown         |
|   account lockout signals → 30-day cooldown              |
|   exposes simple dashboard widget                        |
+----------------------------------------------------------+
```

## Phase decomposition

| Phase | OpenSpec change | Repo | Range | Engineering est | This change? |
|---|---|---|---|---|---|
| **1.5** | `add-enterprise-ats` | **public** auto-job | Workday + iCIMS read-only adapters; registry; tests; scan scripts | 3-5 days | ✅ **YES** |
| **2A-bootstrap** | `add-private-fork-bootstrap` | public | README pointer + `.gitattributes` + git remote setup docs | 0.5 day | next |
| **2A** | `add-humanizer-and-vault` | private | HumanizedTab, Keychain vault, apply-queue plumbing, gate config (defaults disabled) | 7-10 days | later |
| **2A-greenhouse** | `add-greenhouse-auto-apply` | private | First reference auto-apply flow (Greenhouse — simplest) | 3-4 days | later |
| **2B** | `add-lever-ashby-auto-apply` | private | Two more ATS auto-apply | 4-6 days | later |
| **2B-enterprise** | `add-workday-icims-auto-apply` | private | Most complex two ATS auto-apply | 5-7 days | later |
| **3** | `add-email-verification-bot` | private | Gmail-driven verification link clicking (existing accounts only) | 3-5 days | later |
| **5** | `add-risk-telemetry` | private | Detection counters + cooldown automation + dashboard | 3-5 days | **before Phase 4** |
| **4** | `add-auto-signup` | private | Per-ATS account creation + new-account email verification handoff | 5-7 days | last |

Total cumulative: ~30-50 working days post-Phase 1.5. Each Phase ships as its own OpenSpec change with its own brainstorm pass.

## This OpenSpec Change — Phase 1.5 scope

**In scope:**
- New `packages/browser/src/sites/workday/` adapter — generic across all `<tenant>.<wd>.myworkdayjobs.com` URLs
- New `packages/browser/src/sites/icims/` adapter — v3 API primary, HTML scrape fallback
- Registry entries for both
- Re-exports from package root
- Unit tests via `fakeTab` + captured fixtures
- Step-by-step real-site smoke (Amazon for Workday, Disney for iCIMS)
- New scan commands: `npm run workday-scan -- --tenant amazon --query "engineer"` and `npm run icims-scan -- --tenant disney`
- Doc updates to `own-browser-add-site.md` covering ATS-specific tips

**Out of scope (deferred to later phases):**
- Anything write/auto-apply (Phase 2+)
- Humanizer (Phase 2A)
- Credential vault (Phase 2A)
- Email bot (Phase 3)
- Auto-signup (Phase 4)
- Risk telemetry (Phase 5)

## Per-adapter design — Workday

### Inputs

```ts
export interface WorkdaySearchOptions {
  /** Tenant slug, e.g. "amazon", "salesforce", "adobe". Required unless `url` is given. */
  tenant?: string;
  /** WD data-center prefix: "wd1" | "wd3" | "wd5". Auto-detected if not set. */
  wdCenter?: "wd1" | "wd3" | "wd5";
  /** Site path, e.g. "External_Career_Site". Auto-probed common ones if not set. */
  sitePath?: string;
  /** Or pass a full board URL and let the adapter parse all three. */
  url?: string;
  /** Free-text search */
  query?: string;
  /** Pagination */
  limit?: number;     // default 20
  offset?: number;    // default 0
}
```

### API contract

`POST https://<tenant>.<wdCenter>.myworkdayjobs.com/wday/cxs/<tenant>/<sitePath>/jobs`

Body:
```json
{
  "appliedFacets": {},
  "limit": 20,
  "offset": 0,
  "searchText": "<query>"
}
```

Response: `{ total, jobPostings: [{title, externalPath, locationsText, postedOn, bulletFields}] }`

### Output

```ts
export interface WorkdayJob {
  id: string;            // from bulletFields[0] when present
  title: string;
  company: string;       // = tenant
  location: string;
  postedAgo: string;     // "Posted 5 Days Ago"
  externalPath: string;
  url: string;           // resolved full URL
  bulletFields: string[];
}
export interface WorkdaySearchResult {
  source: "workday";
  url: string;
  tenant: string;
  count: number;
  totalAvailable: number;
  jobs: WorkdayJob[];
}
```

### Site-path probing

When `sitePath` is omitted, probe common ones in order: `External_Career_Site`, `Careers`, `External`. Stop on first 200. If all fail → `AdapterParseError("workday: could not auto-detect sitePath; pass it explicitly")`.

### Errors

- `AdapterParseError("workday: invalid URL")` — bad input URL
- `AdapterParseError("workday HTTP <status>")` — non-OK response
- `AdapterParseError("workday: schema mismatch")` — response shape unrecognized
- `AdapterParseError("workday: access denied")` — body indicates anti-bot block (will trigger Phase 5 cooldown later)

## Per-adapter design — iCIMS

### Strategy

iCIMS has two generations:
- **v3 API** (newer): GET `https://careers-<tenant>.icims.com/api/v3/jobs?...`
- **HTML scrape** (older / many tenants): GET `https://careers-<tenant>.icims.com/jobs/search` and parse rendered HTML

Adapter tries v3 first; on parse failure or 404, falls back to HTML scrape. If both fail, throws `AdapterParseError("icims: tried v3 API and HTML scrape, both failed")`.

### Inputs / outputs / errors

Mirror the Workday shape (same `tenant` / `url` / `query` / `limit` / `offset` style). Output:

```ts
export interface ICIMSJob {
  id: string;
  title: string;
  company: string;
  location: string;
  postedAt: string;
  url: string;
  category?: string;
}
export interface ICIMSSearchResult {
  source: "icims";
  url: string;
  tenant: string;
  count: number;
  totalAvailable: number;
  jobs: ICIMSJob[];
  /** Which mechanism resolved the data — useful for telemetry. */
  resolvedVia: "v3-api" | "html-scrape";
}
```

### Tenant variability — explicit acceptance

iCIMS schema differs across tenants. The adapter is best-effort. Distinguish three cases:

1. **Genuinely empty board** — API/HTML returns successfully and the response explicitly indicates 0 jobs (e.g. `totalCount: 0` in v3, or "No jobs found" message in HTML). Return `{count: 0, totalAvailable: 0, jobs: []}` — this is success.
2. **Response present but parser yields 0 rows** — the parser couldn't find the expected job containers (likely schema drift). Throw `AdapterParseError("icims: response present but parser found no jobs — likely schema drift on tenant <slug>")`.
3. **HTTP failure / both v3 and HTML failed** — throw `AdapterParseError("icims: tried v3 API and HTML scrape, both failed")`.

The distinction matters: case 1 is a normal operational outcome; cases 2 and 3 are operator-actionable failures. **No silent degradation** for cases 2/3.

## Test strategy (Phase 1.5)

| Layer | Tool | Coverage |
|---|---|---|
| Unit | vitest + fakeTab | Each adapter's parser tested against captured fixtures (one per ATS, plus malformed-response fixture) |
| Registry | existing `registry.test.ts` loop | New entries auto-asserted (id, meta, search function shape) |
| Smoke | manual against real sites | Amazon Workday + Disney iCIMS (or substitute if those break — substitution OK as long as ≥1 row returned) |

## Acceptance criteria (Phase 1.5)

1. `npm --prefix packages/browser run typecheck` passes
2. `npm --prefix packages/browser run test` passes (existing 34 + new ones, ~46 total)
3. `npm run verify` 0 errors
4. `npm run workday-scan -- --tenant amazon --query "software engineer" --limit 10` exits 0 and returns ≥5 rows. If Amazon's tenant configuration changes by spec time, an equivalent stable Workday tenant (Salesforce / Adobe / Cisco) substitutes; same ≥5 row threshold.
5. `npm run icims-scan -- --tenant disney --query "engineer" --limit 10` exits 0 and returns ≥1 row OR a clear `AdapterParseError` identifying the tenant as schema-divergent. v3 API or HTML fallback both acceptable; the script logs which mechanism resolved.
6. New adapter source files have header comments documenting the API contract for future maintainers

## Risks / Trade-offs (Phase 1.5)

- **Workday tenant variability** — different companies use different `sitePath` and `wdCenter`. Auto-probe handles common cases; expect ~80% works out-of-box, the rest need manual `sitePath` arg. Acceptable.
- **iCIMS HTML scrape brittleness** — DOM-based parser will break when iCIMS updates their template. Mitigation: clear `AdapterParseError`, no silent degradation; user can fall back to v3 or report tenant for follow-up.
- **Workday rate-limiting** — high-volume queries (>100/day from one IP) may trigger soft block. Phase 1.5 is read-only and low-volume; not expected to trigger. If it does, Phase 5 telemetry will catch it once we ship.

## Forward look — what changes when Phase 2A lands

- The Tab class gets a `humanized()` decorator producing `HumanizedTab` (drop-in replacement)
- New `packages/credentials/` workspace package
- New `apps/server/src/apply-queue/` module
- New `config/auto-apply-policy.yml` with **defaults disabled**
- All write operations live behind the queue + gate (no direct invocation from scan scripts)

This change (Phase 1.5) sets up nothing for Phase 2 yet — adapter additions are independent.

## Open Questions

None. All anchor decisions locked. Per-adapter design committed. New questions discovered during implementation should be appended here and resolved with user input before continuing.

## References

- PR #8 (merged): bb-browser replacement, framework, Greenhouse reference adapter
- `docs/architecture/own-browser.md` — runtime layer documentation
- `docs/architecture/own-browser-add-site.md` — canonical add-a-site guide
- Yesterday's brainstorm: `docs/superpowers/specs/2026-05-03-own-browser-design.md`
