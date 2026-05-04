## Context

PR #8 (merged 2026-05-04 as `011caf8`) established `@auto-job/browser` with the SiteAdapter framework — a typed `SearchAdapter<TOptions, TResult>` interface, a registry, four bb-browser-ported adapters (BuiltIn / Indeed / JobRight / LinkedIn), and one new reference adapter (Greenhouse) proving the framework. The architecture spec at `docs/superpowers/specs/2026-05-04-auto-job-architecture-design.md` lays out the long-term roadmap; this change implements its Phase 1.5 slice: read-only enterprise ATS support via Workday and iCIMS adapters.

The two ATS together cover most large enterprises (Workday: ~30-40% — Amazon, Salesforce, Adobe, Cisco, Walmart; iCIMS: ~10-15% — Disney, Comcast). They are read-only here; auto-apply / auto-signup / credential-vault / email-bot are deferred to private-fork phases.

## Goals / Non-Goals

**Goals:**

- Workday adapter is **generic across tenants** — one implementation handles `<tenant>.<wd>.myworkdayjobs.com` for any tenant, auto-detecting `wdCenter` and `sitePath` when omitted
- iCIMS adapter is **two-mechanism** — v3 JSON API first, HTML scrape fallback
- **Three-state error semantics** for both — distinguish "genuinely empty board" (success) from "parser found nothing in non-empty response" (throws schema-drift error) from "HTTP failure" (throws)
- Both adapters integrate into the existing `SITE_ADAPTERS` registry without changes to the framework
- Per-tenant scan scripts (`workday-scan.ts` / `icims-scan.ts`) mirror the simple Greenhouse style, not the per-query `job-board-scan.ts` style — Workday/iCIMS are per-company, not per-keyword
- Smoke tests against real tenants (Amazon Workday, Disney iCIMS) validate the implementation end-to-end before merge

**Non-Goals:**

- Auto-apply, auto-submit, signup, vault, email-bot, or risk telemetry (all Phase 2+ in the private fork)
- Refactoring the existing 5 adapters or the SiteAdapter framework
- Adding a third ATS in this change (Lever / Ashby etc. live in their own future change)
- Per-tenant code branching — the adapters are tenant-agnostic
- CAPTCHA bypass — if Workday or iCIMS surface a CAPTCHA, the adapter throws cleanly (no retry, no automation evasion)

## Decisions

### D1 — Workday: generic-across-tenant, with explicit overrides

The adapter accepts either a parsed input (`{tenant, wdCenter?, sitePath?}`) or a full board URL (`{url}`) and reconciles to a canonical API URL: `https://<tenant>.<wdCenter>.myworkdayjobs.com/wday/cxs/<tenant>/<sitePath>/jobs`.

When `sitePath` is omitted, the adapter probes common values in order: `External_Career_Site`, `Careers`, `External`. First HTTP 200 wins. If all fail, throws `AdapterParseError("workday: could not auto-detect sitePath")`.

When `wdCenter` is omitted, defaults to `wd5` (most common in 2026) — user can override.

**Alternative considered:** require user to always pass tenant + wdCenter + sitePath explicitly. Rejected — the auto-probe gives 80% out-of-box coverage; explicit override remains for the long tail.

### D2 — iCIMS: v3 API first, HTML fallback, three-state errors

Modern iCIMS tenants (~60% in 2026) expose v3 JSON API at `https://careers-<tenant>.icims.com/api/v3/jobs`. Older tenants (~40%) only render HTML. The adapter tries v3 first; on any v3 failure (404 / non-JSON / parse error) it falls back to scraping `https://careers-<tenant>.icims.com/jobs/search`.

Result includes a `resolvedVia: "v3-api" | "html-scrape"` field for telemetry.

Three error states (per architecture spec ambiguity-resolution):
1. **Empty board (success)** — response valid, explicit `totalCount: 0` or "No jobs found" → return `{count: 0, jobs: []}`
2. **Parser found nothing in non-empty response (throw)** — likely tenant schema drift → `AdapterParseError("icims: response present but parser found no jobs — likely schema drift on tenant <slug>")`
3. **Both mechanisms failed (throw)** — `AdapterParseError("icims: tried v3 API and HTML scrape, both failed")`

**Alternative considered:** v3-only, no fallback. Rejected — would silently miss ~40% of tenants.

### D3 — Per-tenant scan scripts (not extending `job-board-scan.ts`)

`scripts/workday-scan.ts` and `scripts/icims-scan.ts` mirror the per-tenant pattern (similar shape to the future Greenhouse scan): take `--tenant`, optional `--query`, return rows. They are NOT integrated into `job-board-scan.ts --source workday` because that script is per-keyword (BuiltIn / Indeed model) and Workday/iCIMS are per-company.

**Alternative considered:** add `--source workday` to `job-board-scan.ts`. Rejected — overloading the script with conflicting input models (per-keyword vs per-tenant) hurts clarity. Two small focused scripts beat one fat one.

### D4 — fakeTab pattern for parser tests, no live mocks

Both adapters reuse the fakeTab pattern from `greenhouse.test.ts` — synthetic HTTP responses fed into the parser, asserting typed output shape. No live network mocking, no nock. Real-site smoke is a separate manual step (acceptance criterion 4 + 5).

### D5 — Documentation update

`docs/architecture/own-browser-add-site.md` gets a new "ATS-specific tips" section covering: per-tenant input model, multi-mechanism fallback pattern (iCIMS v3+HTML), site-path probing pattern (Workday). Future ATS adapters (Lever, Ashby) will follow these tips.

## Risks / Trade-offs

- **Workday tenant variability** → `sitePath` probe handles 80% of tenants; long tail needs explicit `--site-path` flag. Mitigation: clear error message when auto-probe fails, points user to docs. Acceptable.
- **iCIMS HTML scrape brittleness** → DOM parser breaks when iCIMS updates templates. Mitigation: three-state errors fail loudly with tenant identity, no silent degradation. User sees `AdapterParseError("icims: schema drift on tenant disney")` and reports it; we patch.
- **Workday rate limiting** → high-volume queries (>100/day from one IP) may trigger soft block. Mitigation: this change is read-only and intended for low-volume scans (≤10/day per tenant). If detection arrives, Phase 5 telemetry (private fork) will catch it.
- **Real-site smoke depends on third-party state** → if Amazon's Workday tenant changes shape between spec time and CI time, smoke might fail unrelated to our code. Mitigation: acceptance criterion permits substituting an equivalent stable Workday tenant.

## Migration Plan

Pure-additive. No migration required — existing 5 adapters and consumer scripts unchanged.

Rollout: merge after smoke passes locally. No staged rollout needed.

Rollback: revert this PR's commits — no schema migrations, no data changes, no on-disk artifacts to clean up.

## Open Questions

None at design time. Architecture spec resolved all higher-level questions.
