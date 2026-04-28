# Peloton Interactive Software Engineer I Evaluation

## Background

Bridge batch run `LeWMoGgxvtcOJvb6yVyhu` requests a full A-G evaluation for Peloton Interactive's `Software Engineer I` role using the cached JD file at `/var/folders/ly/sdg_pj9x6xb8b89q5yytyhdw0000gn/T/career-ops-bridge-jd-LeWMoGgxvtcOJvb6yVyhu.txt`.

## Goal

Produce a complete markdown evaluation report, write the tracker-addition TSV row, and return a valid bridge JSON summary. PDF generation is explicitly disabled for this run.

## Scope

- Read the local source-of-truth files required for evaluation: cached JD, `cv.md`, optional `llms.txt`, `article-digest.md`, `config/profile.yml`, `data/applications.md`, `data/scan-history.tsv`, and `templates/states.yml`.
- Write `reports/331-peloton-interactive-2026-04-24.md`.
- Write `batch/tracker-additions/LeWMoGgxvtcOJvb6yVyhu.tsv`.
- Do not edit `cv.md`, `i18n.ts`, `data/applications.md`, or any portfolio artifacts.

## Assumptions

- The cached JD is the primary source and is sufficient for the evaluation because it includes frontmatter plus a full extracted description.
- `llms.txt` is absent, so there is no extra local context file to apply.
- The candidate requires sponsorship / work authorization support per `config/profile.yml`.
- The role is a non-AI consumer mobile product role, so the required AI archetype must be mapped to the closest available taxonomy rather than treated as literal role content.

## Implementation Steps

1. Read repository instructions, candidate materials, cached JD, and tracker context.
   Verify: all required local files are inspected and PDF remains disabled.
2. Draft the evaluation with explicit assumptions, hard-blocker checks, and line-level evidence from `cv.md` and `article-digest.md`.
   Verify: report includes sections A-G, score table, legitimacy assessment, and keywords.
3. Write the report and tracker-addition TSV.
   Verify: both files exist and the TSV contains exactly 9 tab-separated columns.
4. Run targeted structural checks and finalize the bridge JSON fields.
   Verify: report header fields, tracker row numbering, and JSON metadata are internally consistent.

## Verification Approach

- Use shell checks for file existence and tracker TSV column count.
- Inspect the report header, required sections, and keywords with `rg`.
- Confirm the next tracker number by calculating the maximum existing application row number.

## Progress Log

- 2026-04-24: Read `CLAUDE.md`, `docs/CODEX.md`, the cached Peloton JD, `config/profile.yml`, `cv.md`, `article-digest.md`, `data/applications.md`, `data/scan-history.tsv`, and `templates/states.yml`.
- 2026-04-24: Confirmed `llms.txt` is absent and `PDF_CONFIRMED: no`, so the run stays on `report + tracker`.
- 2026-04-24: Confirmed the existing quick-screen row for Peloton is tracker row `319` with report `328`; this run is a deeper re-evaluation rather than a first sighting.

## Key Decisions

- Use the cached JD only; no WebFetch or WebSearch unless a critical gap appears.
- Treat sponsorship as a candidate-specific risk because the JD says `h1b: "unknown"` and only cites historical sponsorship.
- Score the role against the current profile truth source, which sets the walk-away compensation minimum at `$90K`.

## Risks and Blockers

- The JD is Jobright-extracted rather than a direct interactive employer page, so freshness and live apply-state remain unverified in batch mode.
- The candidate has direct iOS evidence but no Android / Jetpack Compose evidence and no clear 1+ years of professional mobile development.
- Compensation only partially clears the candidate's current minimum and stays below the target range midpoint.

## Final Outcome

Pending report generation and verification.
