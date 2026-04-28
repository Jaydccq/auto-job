# Procore Technologies Software Engineer I (Datagrid) Evaluation

## Background

Bridge batch run `ud2ZjHmHaezabg_4LlWdk` requests a full A-G evaluation for Procore Technologies' `Software Engineer I (Datagrid)` role using the cached JD file at `/var/folders/ly/sdg_pj9x6xb8b89q5yytyhdw0000gn/T/career-ops-bridge-jd-ud2ZjHmHaezabg_4LlWdk.txt`.

## Goal

Produce a complete markdown evaluation report, write the tracker-addition TSV row, and return a valid bridge JSON summary. PDF generation is explicitly disabled for this run.

## Scope

- Read the cached JD plus `cv.md`, optional `llms.txt`, `article-digest.md`, `config/profile.yml`, `data/applications.md`, `data/scan-history.tsv`, and `templates/states.yml`.
- Write `reports/341-procore-technologies-2026-04-24.md`.
- Write `batch/tracker-additions/ud2ZjHmHaezabg_4LlWdk.tsv`.
- Do not edit `cv.md`, `i18n.ts`, `data/applications.md`, or portfolio files.

## Assumptions

- The cached JD is the primary source and is sufficient for the evaluation; no external fetch is needed.
- `llms.txt` is absent, so there is no extra local context file to incorporate.
- The candidate requires sponsorship / work authorization support per `config/profile.yml`.
- Sponsorship is not explicitly denied in the cached JD, so it remains a clarification risk rather than a blocker.
- The role is a traditional early-career product/full-stack software engineering role with light AI-adjacent workflow signals, so the closest prompt archetype must be mapped rather than taken literally.

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

- 2026-04-24: Read `CLAUDE.md`, `docs/CODEX.md`, the cached Procore JD, `config/profile.yml`, `cv.md`, `article-digest.md`, `data/applications.md`, `data/scan-history.tsv`, and `templates/states.yml`.
- 2026-04-24: Confirmed `llms.txt` is absent and `PDF_CONFIRMED: no`, so the run stays on `report + tracker`.
- 2026-04-24: Confirmed the next tracker row number is `326` by scanning `data/applications.md` for the maximum existing numbered row.

## Key Decisions

- Use the cached JD only; no WebFetch or WebSearch because the local file already carries the needed salary, location, team, and requirements signals.
- Treat sponsorship as a clarification risk rather than a blocker because the JD points to historical H1B activity but does not guarantee support for this requisition.
- Score the role as a strong early-career fit on core engineering scope even though it is not a pure AI role.

## Risks and Blockers

- The cached JD appears to be third-party extracted text rather than raw employer page HTML, so posting freshness and apply-button state remain unverified in batch mode.
- Ruby and explicit TDD depth are weaker than the React/TypeScript/Node and observability overlap.
- The role is hybrid in the San Francisco Bay Area, so relocation and work-authorization logistics still need confirmation before applying.

## Final Outcome

Completed. The report and tracker-addition files were written, structural checks passed, and the bridge JSON can report a verified `report + tracker` result with no PDF.
