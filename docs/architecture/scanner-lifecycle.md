# Scanner Lifecycle Contract

## Purpose

This document defines the scanner boundary for the current repository. It is a
contract for the existing NewGrad/JobRight, LinkedIn, Built In, and Indeed
flows. It is not permission to rewrite the scanners.

## Lifecycle

```text
list -> normalize -> score/filter -> enrich -> evaluate -> merge
```

| Stage | Owns | Must not own | Current anchors |
|---|---|---|---|
| list | source navigation, visible row capture, raw list rows | scoring, tracker writes | `scripts/newgrad-scan-autonomous.ts`, `scripts/linkedin-scan-bb-browser.ts`, `scripts/job-board-scan-bb-browser.ts`, `apps/extension/src/content/extract-*` |
| normalize | canonical URL, source id, company, role, source tag | value policy, prompt behavior | `apps/server/src/adapters/job-identity.ts`, `apps/server/src/lib/canonical-job-url.ts`, source normalizers |
| score/filter | profile fit, hard blockers, seen/evaluated dedupe | page navigation, report parsing | `apps/server/src/adapters/newgrad-scorer.ts`, `apps/server/src/adapters/newgrad-value-scorer.ts`, `apps/server/src/adapters/evaluated-report-urls.ts` |
| enrich | detail page capture, JD cache, apply-link aliases | final evaluation decision | `apps/server/src/adapters/claude-pipeline.ts`, `apps/server/src/lib/write-jd-file.ts`, source detail helpers |
| evaluate | bridge queueing, prompt execution, report/tracker drop creation | DOM extraction, direct application action | `apps/server/src/contracts/pipeline.ts`, `apps/server/src/adapters/claude-pipeline.ts` |
| merge | tracker TSV merge, duplicate update policy, dashboard-readable artifacts | scanner source selection | `merge-tracker.mjs`, `data/applications.md`, `web/build-dashboard.mjs` |

## Provider Mapping

| Provider | list | normalize | score/filter | enrich | evaluate | merge |
|---|---|---|---|---|---|---|
| NewGrad/JobRight | `newgrad-scan-autonomous.ts`, `extract-newgrad.ts` | JobRight URL/source id, company, role | newgrad scorer and history checks | JobRight/detail page text and local JD cache | bridge evaluation endpoint or local pipeline adapter | tracker additions then `merge-tracker.mjs` |
| LinkedIn | `linkedin-scan-bb-browser.ts`, `extract-linkedin.ts` | LinkedIn job id and canonical `/jobs/view/<id>` URL | shared value scoring and dedupe | LinkedIn detail extraction and ATS/apply alias capture | same bridge evaluation path | same tracker merge path |
| Built In | `job-board-scan-bb-browser.ts --source builtin`, `extract-builtin.ts` | Built In URL plus company/role | shared pending/value filtering | Built In detail text and apply destination discovery | same bridge evaluation path | same tracker merge path |
| Indeed | `job-board-scan-bb-browser.ts --source indeed` | Indeed `jk` id plus company/role | shared pending/value filtering | Indeed/detail text and apply destination discovery | same bridge evaluation path | same tracker merge path |

## Invariants

- A candidate identity is stable if any one of these is present, in order:
  canonical URL, source plus source job id, normalized company/role, content
  hash.
- Canonical URLs remove tracking parameters but preserve ATS identifiers such as
  Greenhouse tokens and Indeed `jk`.
- Normalized company/role dedupe is a fallback, not a replacement for canonical
  URL identity.
- Scanners do not submit applications and do not click apply/next/continue as
  part of evaluation.
- `--no-evaluate` is the explicit opt-out. The default scan path may evaluate
  only after list, normalize, score/filter, and enrich have produced promoted
  candidates.
- Bridge-unavailable paths must fail with an operator-visible message and avoid
  corrupting tracker/report artifacts.

## Fixture Coverage

Current fixture coverage for this lifecycle lives in:

- `apps/server/src/adapters/scanner-lifecycle-contract.test.ts`
- `apps/server/src/adapters/job-identity.test.ts`
- `apps/server/src/adapters/evaluated-report-urls.test.ts`
- source-specific normalizer tests under `apps/server/src/adapters/*normalizer*.test.ts`

Before extracting shared scanner orchestration, add or update fixtures first.
