## ADDED Requirements

### Requirement: Workday adapter — generic across tenants

The package SHALL provide a `searchWorkday(tab, options)` function that, given any Workday tenant board (e.g., `amazon.wd5.myworkdayjobs.com`, `salesforce.wd1.myworkdayjobs.com`), returns a typed list of job postings. The same implementation SHALL work across all tenants without tenant-specific code branches.

The adapter SHALL accept input either as parsed components (`{tenant, wdCenter?, sitePath?, query?, limit?, offset?}`) or as a full board URL (`{url, query?, limit?, offset?}`). When `wdCenter` is omitted, the adapter SHALL default to `wd5`. When `sitePath` is omitted, the adapter SHALL probe common values (`External_Career_Site`, `Careers`, `External`) and use the first that returns HTTP 200; if none succeed, the adapter SHALL throw `AdapterParseError`.

The adapter SHALL register in `SITE_ADAPTERS` with id `"workday"`, meta `{requiresAuth: false, domain: "myworkdayjobs.com"}`, and SHALL be exported from the package root.

#### Scenario: Successful search via parsed components

- **WHEN** `searchWorkday(tab, { tenant: "amazon", query: "software engineer", limit: 20 })` is called
- **THEN** the function POSTs to `https://amazon.wd5.myworkdayjobs.com/wday/cxs/amazon/<probed-sitePath>/jobs` with body `{appliedFacets: {}, limit: 20, offset: 0, searchText: "software engineer"}`
- **AND** returns a typed `WorkdaySearchResult` with `source: "workday"`, `tenant: "amazon"`, and a `jobs` array

#### Scenario: Successful search via full URL

- **WHEN** `searchWorkday(tab, { url: "https://salesforce.wd1.myworkdayjobs.com/External_Career_Site", query: "engineer" })` is called
- **THEN** the adapter parses tenant, wdCenter, and sitePath from the URL
- **AND** the resulting API call uses `salesforce`, `wd1`, and `External_Career_Site` accordingly

#### Scenario: sitePath auto-probe finds first 200

- **WHEN** `searchWorkday(tab, { tenant: "amazon" })` is called and `sitePath` is omitted
- **AND** `External_Career_Site` returns 404 but `Careers` returns 200
- **THEN** the adapter uses `Careers` for the API call

#### Scenario: sitePath auto-probe exhausts all candidates

- **WHEN** `searchWorkday(tab, { tenant: "unknownco" })` is called and all probed sitePaths return non-200
- **THEN** the adapter throws `AdapterParseError` with a message identifying the tenant and naming the probed paths

#### Scenario: HTTP non-OK response

- **WHEN** the Workday API returns 5xx or other non-OK status
- **THEN** the adapter throws `AdapterParseError("workday HTTP <status>")`

#### Scenario: Schema mismatch in response

- **WHEN** the Workday API returns 200 but the response body lacks the expected `jobPostings` array
- **THEN** the adapter throws `AdapterParseError("workday: schema mismatch")` with a truncated raw payload

### Requirement: iCIMS adapter — v3 API primary, HTML scrape fallback

The package SHALL provide a `searchICIMS(tab, options)` function that retrieves jobs from any iCIMS tenant board (e.g., `careers-disney.icims.com`, `comcast.icims.com`). The adapter SHALL try the v3 JSON API first; on failure it SHALL fall back to HTML scraping. The result SHALL include a `resolvedVia: "v3-api" | "html-scrape"` field identifying which mechanism succeeded.

The adapter SHALL register in `SITE_ADAPTERS` with id `"icims"`, meta `{requiresAuth: false, domain: "icims.com"}`, and SHALL be exported from the package root.

The adapter SHALL distinguish three response states:
- **Empty board (success):** valid response indicating zero jobs → return `{count: 0, jobs: []}`
- **Parser yielded zero rows from non-empty response (throw):** likely tenant schema drift → `AdapterParseError("icims: response present but parser found no jobs — likely schema drift on tenant <slug>")`
- **Both mechanisms failed (throw):** `AdapterParseError("icims: tried v3 API and HTML scrape, both failed")`

#### Scenario: v3 API returns valid jobs

- **WHEN** `searchICIMS(tab, { tenant: "disney", query: "engineer" })` is called and the v3 endpoint returns a valid JSON response with jobs
- **THEN** the adapter parses the JSON and returns a `ICIMSSearchResult` with `resolvedVia: "v3-api"`

#### Scenario: v3 API fails, HTML scrape succeeds

- **WHEN** the v3 endpoint returns 404 or non-JSON content
- **AND** the HTML page successfully renders job entries the adapter can parse
- **THEN** the adapter returns a `ICIMSSearchResult` with `resolvedVia: "html-scrape"`

#### Scenario: Empty board

- **WHEN** the v3 API returns `{totalCount: 0, jobs: []}` or HTML contains the canonical "No jobs found" message
- **THEN** the adapter returns `{count: 0, totalAvailable: 0, jobs: [], resolvedVia: ...}` (success — no error)

#### Scenario: Parser found nothing in non-empty response

- **WHEN** v3 returns a 200 JSON body but its shape doesn't match the expected v3 schema, AND HTML contains job-like containers but the parser can't extract structured fields from them
- **THEN** the adapter throws `AdapterParseError` with the tenant identified and "schema drift" mentioned

#### Scenario: Both mechanisms fail with HTTP errors

- **WHEN** both the v3 endpoint and the HTML page return 4xx/5xx
- **THEN** the adapter throws `AdapterParseError("icims: tried v3 API and HTML scrape, both failed")`

### Requirement: Registry integration

Both new adapters SHALL be added to `SITE_ADAPTERS` (`packages/browser/src/sites/registry.ts`) with stable kebab-case ids `"workday"` and `"icims"`. The existing `registry.test.ts` per-adapter loop SHALL automatically validate their `meta` shape, search-function presence, and id-key consistency.

The package's typecheck and existing tests SHALL continue to pass after the additions.

#### Scenario: Registered ids are discoverable

- **WHEN** code calls `SITE_IDS` from `@auto-job/browser/sites`
- **THEN** the result includes `"workday"` and `"icims"` alongside the existing four registered ids

#### Scenario: Registry contract holds for new adapters

- **WHEN** the existing `registry.test.ts` "every registered adapter has a SiteAdapterMeta with id matching the registry key" loop runs
- **THEN** it passes for the two new entries without modification

### Requirement: Per-tenant scan commands

The repository SHALL provide two new scan commands invokable as `npm run workday-scan -- --tenant <slug> [--query <text>] [--limit <n>]` and `npm run icims-scan -- --tenant <slug> [--query <text>] [--limit <n>]`. Each command SHALL print scan results to stdout in a format compatible with the existing scan-script logging conventions.

These commands SHALL NOT integrate into `scripts/job-board-scan.ts` — they are per-tenant, not per-keyword.

The commands SHALL NOT modify any tracker, queue, or report file at this stage; they are read-only smoke utilities for the new adapters.

#### Scenario: workday-scan returns rows

- **WHEN** `npm run workday-scan -- --tenant amazon --query "software engineer" --limit 10` is executed against a live Amazon Workday tenant
- **THEN** the command exits 0
- **AND** prints at least 5 rows of typed Workday job data to stdout

#### Scenario: icims-scan returns rows or surfaces schema drift

- **WHEN** `npm run icims-scan -- --tenant disney --query "engineer" --limit 10` is executed against a live Disney iCIMS tenant
- **THEN** the command either exits 0 with at least 1 row, OR exits non-zero with a clear `AdapterParseError` identifying the tenant as schema-divergent (no silent failures)

### Requirement: Documentation update for ATS-specific tips

`docs/architecture/own-browser-add-site.md` SHALL include a new "ATS-specific tips" section that documents:

- Per-tenant input model (vs per-keyword) — when to use which scan-script style
- Multi-mechanism fallback pattern as exemplified by iCIMS (v3 API + HTML scrape)
- Site-path probing pattern as exemplified by Workday

Future ATS adapter additions SHALL follow these patterns.

#### Scenario: Doc references both new adapters

- **WHEN** a developer reads `docs/architecture/own-browser-add-site.md` after this change
- **THEN** the doc explicitly mentions Workday's site-path probing and iCIMS's v3-then-HTML fallback as reference patterns
