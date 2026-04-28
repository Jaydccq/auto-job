# LinkedIn Scan Design

## Background

The user wants a `/career-ops linkedin-scan` mode that searches LinkedIn Jobs
using the supplied 24-hour job-search URL:

```text
https://www.linkedin.com/jobs/search-results/?currentJobId=4347121472&keywords=software%20ai%20engineer%20new%20graduate%20job%20posted%20in%20the%20past%2024%20hours&origin=JOB_SEARCH_PAGE_JOB_FILTER&referralSearchId=AGHvJSQGboSyT24DsI0dwg%3D%3D&f_TPR=r86400
```

Existing scanner work already provides most of the downstream pipeline:

- `newgrad-scan` extracts visible job rows, scores them through the bridge,
  enriches detail pages, writes survivors to `data/pipeline.md`, and can queue
  direct evaluations.
- `builtin-scan` proved the source-adapter pattern: another job board can emit
  the existing `NewGradRow` / `NewGradDetail` shapes and reuse the same bridge
  scoring, history, pipeline, and evaluation paths.
- `bb-browser` is installed and logged into LinkedIn for this user. It has
  community adapters for `linkedin/profile` and `linkedin/search`, but those do
  not cover LinkedIn Jobs search results.

Live read-only inspection on 2026-04-21 confirmed the logged-in LinkedIn Jobs
page exposes enough data for a first scanner:

- Search result rows have `data-job-id` on card wrappers.
- The visible list exposes title, company, location/work model, and posted age.
- The detail pane exposes `h1`, company, location/posted text, full JD text, and
  an Apply button.
- The current page can redirect to login when the `bb-browser` profile is not
  authenticated, so login-state detection must be explicit.

## Goal

Add a durable `/career-ops linkedin-scan` entry point that uses `bb-browser` to
read LinkedIn Jobs with the user's logged-in browser profile, normalizes results
into the existing newgrad scanner contracts, and reuses the bridge scoring,
dedupe, pipeline, and evaluation flow.

## Non-goals

- Do not submit applications.
- Do not click LinkedIn Apply, Easy Apply, Save, Dismiss, message, follow, or
  recruiter-contact actions.
- Do not create a private `~/.bb-browser` adapter as the system of record.
- Do not build a generic LinkedIn API client or scrape non-job LinkedIn search.
- Do not rewrite the existing `newgrad-scan` or `builtin-scan` pipeline.

## Proposed Architecture

Use `bb-browser` as the browser/login transport and keep extractor/scanner logic
inside this repository.

```text
LinkedIn Jobs search URL
        |
        | bb-browser open/eval using logged-in profile
        v
extract-linkedin.ts
        |
        | NewGradRow[] with source="linkedin.com"
        v
/v1/newgrad-scan/score
        |
        | ScoredRow[] promoted by existing config
        v
bb-browser opens LinkedIn job detail URLs
        |
        | NewGradDetail[] with full JD text
        v
/v1/newgrad-scan/enrich
        |
        | source tag: linkedin-scan
        v
data/pipeline.md + data/scan-history.tsv + optional direct evaluation
```

The first implementation should add a repo script, not a browser extension flow:

- `extension/src/content/extract-linkedin.ts` holds self-contained DOM extractor
  functions. The file lives with the other source extractors and can later be
  reused by the extension if needed.
- `scripts/linkedin-scan-bb-browser.ts` calls the `bb-browser` CLI, evaluates
  those extractor functions in the LinkedIn tab, posts rows to the existing
  bridge endpoints, and handles batching, limits, and direct evaluation options.
- `modes/linkedin-scan.md` documents the workflow and login recovery.
- The router, docs, and package scripts expose `/career-ops linkedin-scan` without
  creating a parallel scan system.

## Data Model

LinkedIn rows should map into `NewGradRow`:

- `source`: `linkedin.com`
- `title`: visible job title
- `company`: visible company name
- `location`: visible location text, with work model preserved where shown
- `postedAgo`: normalized text such as `6 hours ago`; strip `Reposted`
- `detailUrl`: canonical `https://www.linkedin.com/jobs/view/{jobId}/`
- `applyUrl`: same as `detailUrl` unless a safe visible job-view URL is present
- `workModel`: `Remote`, `Hybrid`, `On-site`, `On-site or unknown`, or empty
- sponsorship and clearance fields: inferred only from visible text, otherwise
  `unknown` / `false`
- `isNewGrad`: true only when the title/detail text indicates new grad,
  graduate, university, entry-level, IC1, or similar early-career signals

LinkedIn details should map into `NewGradDetail`:

- `description`: the full visible JD text from the detail pane or job view page
- `originalPostUrl` / `applyNowUrl`: empty unless a safe, non-click href is
  visible; do not click Apply to discover external URLs
- `applyFlowUrls`: empty for the first version
- `skillTags`, `requiredQualifications`, and `responsibilities`: best-effort
  text slices from visible headings; empty arrays when not confidently parsed

## User Flow

```text
User runs /career-ops linkedin-scan
        |
        v
Mode checks bridge and bb-browser availability
        |
        +-- not logged into LinkedIn
        |       -> tell user to run bb-browser open https://www.linkedin.com/login
        |
        +-- logged in
                -> run `bun run linkedin-scan -- --url <configured or supplied URL>`
                        |
                        +-- --score-only: stop after scoring
                        +-- default: enrich promoted rows and queue direct eval
                        +-- --no-evaluate: write pipeline only
```

## Error Handling

- Login redirect: detect LinkedIn login URLs or login form text and stop with a
  concrete recovery command.
- Missing `bb-browser`: stop with install/setup guidance; do not fall back to
  unauthenticated HTTP.
- Bridge offline: stop with the existing bridge start command.
- No result cards: report the current page URL and title so the user can see
  whether filters returned no results or LinkedIn changed the UI.
- Detail extraction failures: skip that row, keep a failure count, and continue.
- LinkedIn throttling or checkpoint pages: stop if page text indicates
  checkpoint, verification, CAPTCHA, or account restriction.

## Safety

The scanner is read-only. It may open job detail pages and read visible text. It
must not invoke any action that changes LinkedIn state or sends information to an
employer. Apply URLs are metadata only; the user decides whether to apply later.

## Testing Strategy

Unit and structural tests:

- Source tag mapping includes `linkedin-scan`.
- Scan history and pending parsers accept `linkedin-scan` rich rows.
- LinkedIn job-view URLs are considered valid pipeline fallback URLs while
  LinkedIn company/profile URLs remain noise.
- Pure LinkedIn text normalizers handle `Reposted 6 hours ago`, `3 hours ago`,
  `Over 100 people clicked apply`, and work-model/location strings.

Integration checks:

- `bun run linkedin-scan -- --score-only --limit 5` against the logged-in
  LinkedIn search URL returns extracted/scored rows without writing files.
- `bun run linkedin-scan -- --no-evaluate --enrich-limit 2` enriches detail pages
  and writes only scanner-managed pipeline/history rows.
- Bridge tests and type checks pass.

## Open Risks

- LinkedIn DOM classes are volatile. The extractor should anchor on `data-job-id`,
  `/jobs/view/{id}`, `h1`, visible button labels, and text semantics rather than
  generated class names.
- `bb-browser` profile state is local and user-specific. The mode must treat
  missing login as an expected setup condition.
- Some LinkedIn job results are promoted or semantically related rather than exact
  keyword matches. Existing title/skill scoring should remain the filter instead
  of trusting LinkedIn ranking.

## Spec Self-review

- No placeholders remain.
- The design reuses existing scanner contracts instead of introducing a parallel
  LinkedIn pipeline.
- User-specific defaults belong in `config/profile.yml` or a command argument,
  not in shared templates.
- The only browser-side action in scope is read-only page navigation and DOM
  extraction through `bb-browser`.
