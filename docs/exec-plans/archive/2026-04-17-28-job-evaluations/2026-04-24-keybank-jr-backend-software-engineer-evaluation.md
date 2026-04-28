# KeyBank Jr BackEnd Software Engineer Evaluation

## Background

Bridge batch run `OZDWdrpbkpg-ObnqjQtNH` requests a full A-G evaluation for KeyBank's `Jr BackEnd Software Engineer` role using the cached JD file at `/var/folders/ly/sdg_pj9x6xb8b89q5yytyhdw0000gn/T/career-ops-bridge-jd-OZDWdrpbkpg-ObnqjQtNH.txt`.

## Goal

Produce a complete markdown evaluation report, write the tracker-addition TSV row, and return a valid bridge JSON summary. PDF generation is explicitly disabled for this run.

## Scope

- Read the required local inputs: cached JD, `cv.md`, optional `llms.txt`, `article-digest.md`, `config/profile.yml`, `data/applications.md`, `data/scan-history.tsv`, and `templates/states.yml`.
- Write `reports/332-keybank-2026-04-24.md`.
- Write `batch/tracker-additions/OZDWdrpbkpg-ObnqjQtNH.tsv`.
- Do not edit `cv.md`, `i18n.ts`, `data/applications.md`, or any portfolio artifacts.

## Assumptions

- The cached JD is the primary source and is sufficient for the evaluation even though the cached text is truncated near the end.
- `llms.txt` is absent, so there is no extra local context file to apply.
- The candidate requires sponsorship / work authorization support per `config/profile.yml`.
- The role is a conventional junior backend software role, so the closest available archetype taxonomy will be used rather than forcing an AI-specific reading.

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

- 2026-04-24: Read `CLAUDE.md`, `docs/CODEX.md`, the cached KeyBank JD, `config/profile.yml`, `cv.md`, `article-digest.md`, `data/applications.md`, `data/scan-history.tsv`, and `templates/states.yml`.
- 2026-04-24: Confirmed `llms.txt` is absent and `PDF_CONFIRMED: no`, so the run stays on `report + tracker`.
- 2026-04-24: Confirmed the existing quick-screen row for KeyBank is tracker row `313` with report `319`; this run is a deeper re-evaluation rather than a first sighting.

## Key Decisions

- Use the cached JD only; no WebFetch or WebSearch unless a critical gap appears.
- Treat `h1b: unknown` as a sponsorship risk, not a confirmed blocker, because the cached JD does not explicitly say sponsorship is unavailable.
- Use `Evaluada` in the tracker-addition TSV because the batch bridge prompt requires the Spanish canonical alias and repository merge rules normalize aliases.

## Risks and Blockers

- The cached JD is truncated and lacks some structured fields such as explicit work model and location details beyond the URL slug and company summary.
- Compensation tops out only slightly above the candidate's walk-away floor and remains materially below the stated target range midpoint.
- Angular is listed in the JD, but the candidate's resume does not show direct Angular evidence.

## Final Outcome

Pending report generation and verification.
