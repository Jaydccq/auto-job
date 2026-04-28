# R1 RCM Software Engineer Evaluation

## Background

Bridge batch run `Fk77r5wrdwEQXGB6p583R` requests a full A-G evaluation for R1 RCM's `Software Engineer` role using the cached JD file at `/var/folders/ly/sdg_pj9x6xb8b89q5yytyhdw0000gn/T/career-ops-bridge-jd-Fk77r5wrdwEQXGB6p583R.txt`.

## Goal

Produce a complete markdown evaluation report, write the tracker-addition TSV row, and return a valid bridge JSON summary. PDF generation is explicitly disabled for this run.

## Scope

- Read the required local inputs: cached JD, `cv.md`, optional `llms.txt`, `article-digest.md`, `config/profile.yml`, `data/applications.md`, `data/scan-history.tsv`, and `templates/states.yml`.
- Write `reports/333-r1-rcm-2026-04-24.md`.
- Write `batch/tracker-additions/Fk77r5wrdwEQXGB6p583R.tsv`.
- Do not edit `cv.md`, `i18n.ts`, `data/applications.md`, or any portfolio artifacts.

## Assumptions

- The cached JD is the primary source and is sufficient for the evaluation because it includes frontmatter plus a usable requirements/responsibilities extract.
- `llms.txt` is absent, so there is no extra local context file to apply.
- The candidate requires sponsorship / work authorization support per `config/profile.yml`.
- The role is a conventional junior software-engineering posting, so the mandatory archetype taxonomy must be mapped to the closest available AI-leaning categories rather than treated literally.
- Scoring should follow the current repository truth in `config/profile.yml`, which sets the walk-away compensation minimum at `$90K`.

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

- 2026-04-24: Read `CLAUDE.md`, `docs/CODEX.md`, the cached R1 RCM JD, `config/profile.yml`, `cv.md`, `article-digest.md`, `data/applications.md`, `data/scan-history.tsv`, and `templates/states.yml`.
- 2026-04-24: Confirmed `llms.txt` and `i18n.ts` are absent and `PDF_CONFIRMED: no`, so the run stays on `report + tracker`.
- 2026-04-24: Confirmed the existing quick-screen row for R1 RCM is tracker row `312` with report `317`; this run is a deeper re-evaluation rather than a first sighting.

## Key Decisions

- Use the cached JD only; no WebFetch or WebSearch unless a critical gap appears.
- Treat `h1b: "unknown"` as an unresolved sponsorship risk, even though the extractor added a non-official `H1B Sponsor Likely` tag.
- Use the current profile compensation minimum of `$90K` instead of older tracker notes that referenced a higher floor.
- Plan to write the tracker addition with a skip-equivalent status because the current evidence still points to low application priority.

## Risks and Blockers

- The JD is generic and partly duplicated, so some team/process detail is missing.
- Sponsorship is not confirmed in the official JD text.
- The salary band is materially below the candidate's target range and only barely clears the current walk-away floor at the top end.
- The role underuses the candidate's stronger AI/distributed-systems differentiators.

## Final Outcome

Pending report generation and verification.
