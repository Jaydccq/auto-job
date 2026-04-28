# Jobright Match Signal Audit

## Background

Jobright detail pages display structured fit signals such as `GOOD MATCH`,
`Exp. Level`, `Skill`, and `Industry Exp.`. The current newgrad pipeline
already stores these fields in `NewGradDetail`, but the list-stage scorer and
the final value scorer may not be using them in a way that is faithful to the
live page or well-calibrated against the local keyword-based skill scoring.

## Goal

Extract the live Jobright match signals directly from webpage elements, compare
them against the local skill-based scoring used by `career-ops`, and determine
whether the current scoring design is misweighted or structurally flawed.

## Scope

- Inspect the existing extractor and scorer implementations.
- Validate live Jobright detail-page match signals against real DOM elements.
- Compare site match signals with the local list-stage and detail-stage scoring.
- Make the smallest code change needed to improve extraction and/or scoring
  alignment if the current design is clearly wrong.
- Record concrete findings and verification results.

## Assumptions

- The scanner profile in `data/browser-profiles/newgrad-scan` still contains a
  working Jobright login session.
- A recent Jobright detail page is available through repository data such as
  `data/pipeline.md` or `data/scan-history.tsv`.
- The repository’s current `newgrad_scan` config remains the intended source of
  truth for local scoring weights unless the audit proves otherwise.

## Implementation Steps

1. Inspect current extractor and scorer behavior.
   Verify: relevant extractor/scorer files and config are read.
2. Capture live Jobright match signals from real DOM elements.
   Verify: at least one live detail page yields concrete `GOOD MATCH`,
   `Exp. Level`, `Skill`, and `Industry Exp.` values from page elements.
3. Compare site signals with local scoring.
   Verify: produce at least one concrete comparison between DOM match values,
   local list score, and detail value score.
4. Fix the smallest confirmed issue.
   Verify: code/tests or direct smoke output show the new behavior.
5. Run targeted verification and summarize the audit.
   Verify: targeted tests or smoke checks pass and findings are recorded here.

## Verification Approach

- Targeted source inspection with `rg`/`sed`
- Live Playwright smoke extraction against a Jobright detail page
- Targeted tests for changed extractor/scoring behavior
- `npm run verify` if the change touches shared pipeline behavior

## Progress Log

- 2026-04-20: Created plan for auditing live Jobright match signals against the
  local newgrad scoring design.
- 2026-04-20: Confirmed `extractNewGradDetail` already had contract fields for
  `matchScore`, `expLevelMatch`, `skillMatch`, and `industryExpMatch`, but the
  extractor relied on broad `bodyText` regex fallback rather than reading the
  live score panel directly.
- 2026-04-20: Live DOM capture on the Sun West Jobright page showed a concrete
  score panel with `role=progressbar` and `aria-valuenow` values under
  `index_jobScoresPanel__*`, `index_overallScore__*`, and
  `index_recommendationScoreItem__*`.
- 2026-04-20: Before the fix, the same live Sun West page yielded DOM scores
  `69 / 78 / 73 / 65`, while `extractNewGradDetail` returned
  `null / null / 65 / null`, proving the body-text regex path was reading the
  page unreliably.
- 2026-04-20: Updated `extension/src/content/extract-newgrad.ts` so detail
  extraction reads the Jobright score panel directly from DOM elements and
  `aria-valuenow`, with regex left only as fallback.
- 2026-04-20: Post-fix live comparison on Sun West now returns aligned scores
  from both DOM and extractor: `70 / 78 / 73 / 71`.
- 2026-04-20: Sampled three live roles from the current Jobright minisite and
  compared local list/value scoring with DOM match signals:
  - Sun West Mortgage Company, Inc. — local list score `9/9`; DOM
    `match=70`, `skill=73`; value score `8.5/10`
  - Autodesk — local list score `9/9`; DOM `match=84`, `skill=92`; value score
    `9.2/10`
  - Symbotic — local list score `8/9`; DOM `match=86`, `skill=97`; value score
    `10/10`
- 2026-04-20: User requested that Jobright's own score panel become a key
  signal in enrich scoring, not just a light add-on.
- 2026-04-20: Updated `bridge/src/adapters/newgrad-value-scorer.ts` so enrich
  scoring uses a weighted Jobright site-alignment score and applies explicit
  penalties when both overall match and skill match are below bar.
- 2026-04-20: Added a focused unit test showing that a keyword-heavy row with a
  weak Jobright panel no longer passes enrich by default.
- 2026-04-20: Post-change live comparison on three current roles showed the new
  behavior:
  - Sun West — local list `9/9`, DOM `70 / 78 / 73 / 71`, enrich value
    `5.6`, `passed=false`, penalty `site_match_below_bar`
  - Autodesk — local list `9/9`, DOM `83 / 100 / 92 / 64`, enrich value
    `9.1`, `passed=true`
  - Symbotic — local list `8/9`, DOM `86 / 100 / 97 / 65`, enrich value `10`,
    `passed=true`
- 2026-04-20: Full `npm run verify` hit one unrelated pre-existing failure:
  `src/batch/batch-runner.e2e.test.ts` timed out at 5s. Directly relevant
  validation for this change still passed: live DOM smoke extraction,
  `npm --prefix extension run typecheck`, and `npm --prefix extension run build`.

## Key Decisions

- Treat the Jobright score panel as the primary source for site match signals;
  only use body-text regex as fallback when the score panel is absent.
- Do not widen this task into a scoring-model rewrite. The confirmed code bug is
  extraction reliability, not a proven need to replace the existing local
  keyword-based scorer.
- Interpret the local list-stage score as a coarse promotion score rather than a
  calibrated fit score. The audit showed that `9/9` can still correspond to a
  Jobright overall match in the `70s`.
- Treat low Jobright overall+skill scores as a meaningful enrich-stage negative
  signal. When both are below `75`, the role should not pass enrich purely on
  keyword hits and freshness.

## Risks and Blockers

- Live Jobright DOM may vary across pages or A/B treatments, so the current DOM
  selectors still rely on class-fragment and progressbar semantics rather than a
  stable public API.
- The local list-stage scorer remains intentionally recall-oriented and can
  overstate fit when generic skill keywords like `Java`, `Python`, `Node.js`,
  and `AI` all appear in a short qualifications summary.

## Final Outcome

- Completed a focused extractor fix and live audit.

Code change:

- `extension/src/content/extract-newgrad.ts` now extracts Jobright match scores
  from the live score panel DOM and `aria-valuenow` values before falling back
  to body-text regex.

Concrete findings:

- There was a real extraction bug. On a live Sun West page, the old extractor
  misread the score panel as `null / null / 65 / null`; the fixed extractor now
  matches the live DOM values `70 / 78 / 73 / 71`.
- The scoring design has one important calibration caveat: the local list-stage
  score is not a Jobright-style fit score. It is a coarse promotion score built
  from title match, keyword hits, and freshness. A job can score `9/9` locally
  and still show only `70% GOOD MATCH` / `73% Skill` on Jobright.
- The detail-stage value scorer is less misleading than the list-stage score,
  because it now incorporates the correctly extracted site match panel. On the
  same Sun West page, the value score moved from a previously understated
  `7.0/10` to `8.5/10` once the site scores were extracted correctly.
- The enrich scorer now also treats the Jobright panel as a key gating signal.
  On the same Sun West page, after strengthening site-score weighting, the role
  dropped to `5.6/10` with `site_match_below_bar`, while stronger pages like
  Autodesk and Symbotic continued to pass comfortably.

Verification:

- Live DOM smoke extraction passed against current Jobright pages.
- `npm --prefix extension run typecheck` passed.
- `npm --prefix extension run build` passed.
- `npm --prefix bridge run test -- src/adapters/newgrad-value-scorer.test.ts`
  passed, 4 tests.
- `npm --prefix bridge run typecheck` passed.
- `npm run verify` did not fully pass because of an unrelated existing batch
  e2e timeout in `src/batch/batch-runner.e2e.test.ts`.
