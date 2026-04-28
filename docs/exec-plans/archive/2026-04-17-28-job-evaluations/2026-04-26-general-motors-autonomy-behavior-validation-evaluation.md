# GM Autonomy Behavior Validation Evaluation

## Background

Process a GM Workday posting through the bridge MVP and produce the repository
artifacts required by the batch worker flow: a full markdown evaluation report
and a tracker addition line. PDF generation is out of scope for this run unless
explicitly confirmed, which it was not.

## Goal

Create `reports/394-general-motors-2026-04-26.md`, add the corresponding TSV
tracker line, and finish with a valid JSON summary.

## Scope

- Read the local JD cache file and evaluate the role against `cv.md` and
  `article-digest.md`.
- Write the report in the repo's `reports/` directory.
- Write the tracker addition TSV in `batch/tracker-additions/`.
- Skip PDF generation.

## Assumptions

- The local JD cache is authoritative for this run.
- Sponsorship is not a blocker unless the JD states it explicitly.
- The report should follow the repository's evaluation format, adapted to the
  GM autonomy validation role.

## Implementation Steps

1. Read the JD, CV, article digest, and tracker history.
   Verify: enough evidence exists to score the role and identify blockers.
2. Draft the evaluation report with the required sections.
   Verify: the report includes the role summary, match analysis, strategy,
   compensation, personalization, interview plan, legitimacy assessment, and
   keywords.
3. Add the tracker TSV line.
   Verify: the row uses the next sequential number and the correct report link.
4. Validate the written artifacts.
   Verify: the report file exists and the tracker addition file exists.

## Verification Approach

- `test -f reports/394-general-motors-2026-04-26.md`
- `test -f batch/tracker-additions/DafwCxun1ibM8VCvQv9FG.tsv`
- Spot-check the written content for required headings and values

## Progress Log

- 2026-04-26: Started evaluation work for GM autonomy behavior validation.

## Key Decisions

- Use the local JD cache rather than external research.
- Treat the role as a strong AI/platform-adjacent validation fit with no hard
  sponsorship blocker in the provided text.

## Risks and Blockers

- The JD excerpt may be truncated, so some fine-grained requirements could be
  missing.
- Tracker numbering must stay aligned with the existing application log.

## Final Outcome

Pending.
