## Why

Phase 1 of `@auto-job/browser` (PR #8, merged) replaced bb-browser and added the SiteAdapter framework with five adapters (BuiltIn, Indeed, JobRight, LinkedIn, Greenhouse). The user's job hunt targets enterprise tech companies — most of which use Workday or iCIMS as their applicant-tracking system, neither of which is currently supported. Without these two, the framework's "scan everywhere" promise has a noticeable hole at the enterprise end (Amazon, Salesforce, Adobe, Cisco, Walmart, Goldman Sachs, Disney, Comcast, etc.).

This change closes that hole at the read layer. It is the public, read-only first slice of a longer roadmap; auto-apply / signup / vault / email-bot work lives in a separate private fork (Phase 2+, see architecture spec).

## What Changes

- **NEW** `packages/browser/src/sites/workday/` — generic Workday adapter that works against any `<tenant>.<wd>.myworkdayjobs.com` board (tenants share API shape but use different `wd1`/`wd3`/`wd5` data centers and `sitePath` segments). Adapter accepts `{tenant, wdCenter?, sitePath?, url?, query?, limit?, offset?}`; auto-probes common `sitePath` values when omitted.
- **NEW** `packages/browser/src/sites/icims/` — generic iCIMS adapter with two-mechanism strategy: try v3 JSON API (`https://careers-<tenant>.icims.com/api/v3/jobs`) first, fall back to HTML scrape on failure. Three-state error semantics distinguish empty boards (success), parser-found-nothing (likely schema drift, throws), and HTTP failure (throws).
- Registry entries for both adapters in `packages/browser/src/sites/registry.ts`
- Re-exports from `packages/browser/src/index.ts` and `packages/browser/package.json` exports map
- Unit tests via `fakeTab` pattern with captured fixtures; the existing `registry.test.ts` loop automatically covers new entries
- New scan scripts `scripts/workday-scan.ts` and `scripts/icims-scan.ts` (per-tenant style — mirrors the Greenhouse pattern, not the per-query `job-board-scan.ts` style)
- New npm script entries: `workday-scan` and `icims-scan`
- `docs/architecture/own-browser-add-site.md` updated with ATS-specific notes (per-tenant input shape, sitePath probing, schema-drift detection)

**Not breaking** any existing scan command or adapter. Purely additive.

## Capabilities

### New Capabilities

- `enterprise-ats`: Workday and iCIMS read-only site adapters with per-tenant input, generic across tenants, integrated into the existing SiteAdapter registry. Includes scan-script ergonomics for invoking each per-tenant.

### Modified Capabilities

(none — additive only)

## Impact

- **Affected code:** `packages/browser/src/sites/workday/` (new), `packages/browser/src/sites/icims/` (new), `packages/browser/src/sites/registry.ts` (modified), `packages/browser/src/index.ts` (modified), `packages/browser/package.json` (modified — exports), `scripts/workday-scan.ts` and `scripts/icims-scan.ts` (new), `package.json` (modified — script entries), `docs/architecture/own-browser-add-site.md` (modified)
- **Dependencies:** No new npm packages
- **External systems:** Tenants of Workday and iCIMS — read-only access to their public job-board JSON APIs / rendered HTML pages. Within normal browsing usage; no rate-limit risk at scan-only volume
- **Reversibility:** Pure-additive; revert by removing the new files and reverting registry/index/package.json changes
- **Authoritative spec:** `docs/superpowers/specs/2026-05-04-auto-job-architecture-design.md` (Phase 1.5)
