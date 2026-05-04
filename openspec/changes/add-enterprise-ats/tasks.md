## 1. Workday adapter

- [ ] 1.1 Create `packages/browser/src/sites/workday/index.ts` with types: `WorkdaySearchOptions`, `WorkdayJob`, `WorkdaySearchResult`
- [ ] 1.2 Implement `parseWorkdayUrl(url)` helper that extracts `{tenant, wdCenter, sitePath}` from a board URL
- [ ] 1.3 Implement `probeWorkdaySitePath(tab, tenant, wdCenter)` — tries `External_Career_Site` → `Careers` → `External` via HEAD/GET, returns first 200
- [ ] 1.4 Implement `searchWorkday(tab, opts)` — reconciles input, builds API URL, POSTs, parses, returns typed result
- [ ] 1.5 Three-state error handling: HTTP non-OK throws `AdapterParseError`; schema mismatch throws; sitePath probe exhaustion throws with helpful message
- [ ] 1.6 Export `WORKDAY_ADAPTER` SearchAdapter constant with proper meta
- [ ] 1.7 Verify file compiles via `npm --prefix packages/browser run typecheck`

## 2. Workday tests

- [ ] 2.1 Create `packages/browser/test/sites/workday.test.ts` with `fakeTab` that returns canned HTTP responses
- [ ] 2.2 Test happy path — parsed components input, returns typed jobs
- [ ] 2.3 Test happy path — full URL input parsed correctly
- [ ] 2.4 Test sitePath auto-probe — first probe 404, second 200, uses second
- [ ] 2.5 Test sitePath probe exhaustion — all 404, throws with tenant in message
- [ ] 2.6 Test HTTP non-OK — throws `AdapterParseError("workday HTTP <status>")`
- [ ] 2.7 Test schema mismatch — 200 with bad body, throws
- [ ] 2.8 Test empty board — 200 with `total: 0, jobPostings: []`, returns `{count: 0, jobs: []}`
- [ ] 2.9 Verify all pass via `npm --prefix packages/browser run test -- workday`

## 3. iCIMS adapter

- [ ] 3.1 Create `packages/browser/src/sites/icims/index.ts` with types: `ICIMSSearchOptions`, `ICIMSJob`, `ICIMSSearchResult` (with `resolvedVia` field)
- [ ] 3.2 Implement `tryICIMSv3(tab, tenant, opts)` — GETs `/api/v3/jobs`, returns parsed result or null on failure
- [ ] 3.3 Implement `tryICIMSHtml(tab, tenant, opts)` — GETs `/jobs/search` HTML, parses via injected page-context script (`tab.evaluate`), returns parsed result or null
- [ ] 3.4 Implement `searchICIMS(tab, opts)` — orchestrates v3 → HTML fallback, distinguishes empty/drift/failure per the three-state semantics
- [ ] 3.5 Export `ICIMS_ADAPTER` SearchAdapter constant with proper meta
- [ ] 3.6 Verify file compiles via typecheck

## 4. iCIMS tests

- [ ] 4.1 Create `packages/browser/test/sites/icims.test.ts` with `fakeTab` for both v3 and HTML responses
- [ ] 4.2 Test v3 happy path — JSON response, `resolvedVia: "v3-api"`
- [ ] 4.3 Test fallback — v3 returns 404, HTML succeeds, `resolvedVia: "html-scrape"`
- [ ] 4.4 Test empty board — v3 returns `{totalCount: 0}`, returns success
- [ ] 4.5 Test schema drift — v3 returns 200 with unexpected shape, HTML rendered but parser finds no jobs, throws schema-drift error with tenant in message
- [ ] 4.6 Test both fail — v3 4xx + HTML 4xx, throws "tried v3 API and HTML scrape, both failed"
- [ ] 4.7 Verify all pass

## 5. Registry + re-exports

- [ ] 5.1 Edit `packages/browser/src/sites/registry.ts` — import `WORKDAY_ADAPTER` and `ICIMS_ADAPTER`, add to `SITE_ADAPTERS` map
- [ ] 5.2 Verify the existing `registry.test.ts` loop now covers both new entries (no test changes needed; loop is generic)
- [ ] 5.3 Edit `packages/browser/src/index.ts` — re-export `searchWorkday`, `WORKDAY_ADAPTER`, types; same for iCIMS
- [ ] 5.4 Edit `packages/browser/package.json` — add `./sites/workday` and `./sites/icims` to `exports` map
- [ ] 5.5 Verify typecheck + full test run still pass

## 6. Scan scripts

- [ ] 6.1 Create `scripts/workday-scan.ts` — parses `--tenant`, `--query`, `--limit`, `--site-path` (optional), `--wd-center` (optional), `--url` (optional alternative input); calls `searchWorkday`, prints results to stdout
- [ ] 6.2 Create `scripts/icims-scan.ts` — parses `--tenant`, `--query`, `--limit`, `--url` (optional alternative input); calls `searchICIMS`, prints results to stdout including `resolvedVia` indicator
- [ ] 6.3 Both scripts use `BrowserController.ensure()` and reuse the dedicated profile (no separate Chrome launch)
- [ ] 6.4 Both scripts gracefully handle adapter `AdapterParseError` — print clear message, exit non-zero
- [ ] 6.5 Verify both scripts compile and `--help` runs

## 7. Wire commands + docs

- [ ] 7.1 Add to root `package.json`: `"workday-scan": "./apps/server/node_modules/.bin/tsx scripts/workday-scan.ts"` and `"icims-scan": "./apps/server/node_modules/.bin/tsx scripts/icims-scan.ts"`
- [ ] 7.2 Update `docs/architecture/own-browser-add-site.md` — new "ATS-specific tips" section with per-tenant input model, multi-mechanism fallback (iCIMS), site-path probing (Workday)
- [ ] 7.3 Update `docs/architecture/own-browser.md` — add Workday + iCIMS to the supported ATS list
- [ ] 7.4 Run `npm run verify` — must exit 0

## 8. Smoke tests against real tenants

- [ ] 8.1 Run `npm run workday-scan -- --tenant amazon --query "software engineer" --limit 10`; assert exit 0 and ≥5 rows. If Amazon is unreachable, substitute Salesforce, Adobe, or Cisco; same threshold.
- [ ] 8.2 Run `npm run icims-scan -- --tenant disney --query "engineer" --limit 10`; assert exit 0 with ≥1 row OR clean `AdapterParseError` identifying schema drift. Note which `resolvedVia` mechanism succeeded.
- [ ] 8.3 If smoke tests reveal real-world issues (auto-probe coverage, schema variance), iterate on the adapter; do not silently lower acceptance criteria.

## 9. Commit + PR

- [ ] 9.1 Commit on `feat/enterprise-ats` branch with detailed message
- [ ] 9.2 Push to `origin`
- [ ] 9.3 Open PR #9 stacked on main (PR #8 already merged)
- [ ] 9.4 Verify CI passes; address any failures before requesting review
