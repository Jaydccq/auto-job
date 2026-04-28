# JPMorganChase Applied AI ML Associate Evaluation

## Background

Process the JPMorganChase ContactHR posting through the bridge MVP and produce
the required repository artifacts: a full markdown evaluation report, a tracker
addition TSV line, and a final JSON summary. PDF generation is explicitly out
of scope for this run.

## Goal

Create `reports/399-jpmorganchase-2026-04-26.md`, write the corresponding
tracker addition TSV line, and finish with a valid JSON result that records the
local JD as the source of truth.

## Scope

- Read the local JD cache file and evaluate the role against `cv.md` and
  `article-digest.md`.
- Write the report under `reports/`.
- Write the tracker addition under `batch/tracker-additions/`.
- Skip PDF generation because it was not explicitly confirmed.

## Assumptions

- The local JD cache is authoritative and complete enough for a full eval.
- Sponsorship is only a blocker if the JD states it explicitly.
- The report should follow the repository's A-G evaluation format and omit the
  draft application section if the final score stays below 4.5.

## Implementation Steps

1. Read the JD, CV, article digest, tracker history, and state file.
   Verify: enough evidence exists to score the role and identify blockers.
2. Draft the evaluation report with the required sections and line references.
   Verify: the report includes the summary, match analysis, strategy, comp,
   personalization, interview plan, legitimacy assessment, and keywords.
3. Add the tracker TSV line using the next sequential application number.
   Verify: the row format matches the repository's merged-tracker convention.
4. Validate the written artifacts.
   Verify: the report file exists and the tracker addition file exists.

## Verification Approach

- `test -f reports/399-jpmorganchase-2026-04-26.md`
- `test -f batch/tracker-additions/gQrotyKJJce00UmflTweL.tsv`
- Spot-check the written content for required headings, score, legitimacy, and
  batch metadata

## Progress Log

- 2026-04-26: Started evaluation work for the JPMorganChase Applied AI ML
  Associate posting.

## Key Decisions

- Use the local JD cache rather than external research.
- Treat the role as a production AI / LLMOps-adjacent posting with a strong
  early-career fit and no explicit sponsorship blocker.
- Keep PDF generation off for this run.

## Risks and Blockers

- The JD excerpt may omit some context from the original posting.
- Sponsorship is not confirmed in the provided text, so it remains a caution
  item for the eventual application decision.
- Tracker numbering must stay aligned with the existing application log.

## Final Outcome

Pending.
