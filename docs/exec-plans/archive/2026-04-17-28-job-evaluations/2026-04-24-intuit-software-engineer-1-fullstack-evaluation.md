# Intuit Software Engineer 1 - Fullstack Evaluation

## Background

Bridge batch run `95oDCENEmuYdRnTlWejiT` requests a full A-G evaluation for Intuit's `Software Engineer 1 - Fullstack` role using the cached JD file at `/var/folders/ly/sdg_pj9x6xb8b89q5yytyhdw0000gn/T/career-ops-bridge-jd-95oDCENEmuYdRnTlWejiT.txt`.

## Goal

Produce a complete markdown evaluation report, write the tracker-addition TSV row, and return a valid bridge JSON summary. PDF generation is explicitly disabled for this run.

## Scope

- Read the required local inputs: cached JD, `cv.md`, optional `llms.txt`, `article-digest.md`, `config/profile.yml`, `data/applications.md`, `data/scan-history.tsv`, and `templates/states.yml`.
- Use minimal external lookup only if a critical gap exists for comp or legitimacy. For this run, that means the official Intuit posting only if the cached JD lacks salary data needed for the comp score.
- Write `reports/337-intuit-2026-04-24.md`.
- Write `batch/tracker-additions/95oDCENEmuYdRnTlWejiT.tsv`.
- Do not edit `cv.md`, `i18n.ts`, `data/applications.md`, or any portfolio artifacts.

## Assumptions

- The cached JD is the primary source and is sufficient for the main role analysis because it includes frontmatter plus a substantial extracted description.
- `llms.txt` is absent, so there is no extra local context file to apply.
- The candidate requires sponsorship / work authorization support per `config/profile.yml`.
- The role is a conventional early-career full-stack/frontend product engineering role with AI-personalization adjacency, so the closest available archetype taxonomy will be used rather than forcing a literal AI-platform reading.
- A prior quick-screen evaluation already exists for the same role (`reports/137-intuit-2026-04-16.md`), so this run should be treated as a deeper re-evaluation, not a first sighting.

## Implementation Steps

1. Read repository instructions, candidate materials, cached JD, historical tracker context, and prior Intuit evaluation.
   Verify: all required local files are inspected and PDF remains disabled.
2. Fill the comp gap with the smallest reliable external source if the cached JD does not include salary data.
   Verify: comp scoring cites the source or explicitly states that data remains insufficient.
3. Draft the evaluation with explicit assumptions, hard-blocker checks, and line-level evidence from `cv.md` and `article-digest.md`.
   Verify: report includes sections A-G, score table, legitimacy assessment, and keywords.
4. Write the report and tracker-addition TSV.
   Verify: both files exist and the TSV contains exactly 9 tab-separated columns.
5. Run targeted structural checks and finalize the bridge JSON fields.
   Verify: report header fields, tracker row numbering, and output metadata are internally consistent.

## Verification Approach

- Use shell checks for file existence and tracker TSV column count.
- Inspect the report header, required sections, and keywords with `rg`.
- Confirm the next tracker number by calculating the maximum existing application row number.
- Confirm whether the run remained `report + tracker` with no PDF output.

## Progress Log

- 2026-04-24: Read `CLAUDE.md`, `docs/CODEX.md`, the cached Intuit JD, `config/profile.yml`, `cv.md`, `article-digest.md`, `data/applications.md`, `data/scan-history.tsv`, and `templates/states.yml`.
- 2026-04-24: Confirmed `llms.txt` is absent and `PDF_CONFIRMED: no`, so the run stays on `report + tracker`.
- 2026-04-24: Confirmed an existing quick-screen row for the same role exists in `data/applications.md` (`#87`, report `137`), so this run is a re-evaluation.
- 2026-04-24: Ran a minimal official Intuit web lookup because the cached JD lacked salary data needed for the comp score.

## Key Decisions

- Keep the cached JD as the primary source for all role analysis and use the official Intuit page only to fill the missing compensation signal.
- Treat `h1b: unknown` as a sponsorship risk, not a confirmed blocker, because the cached JD does not explicitly say sponsorship is unavailable.
- Use `Evaluada` in the tracker-addition TSV because the batch bridge prompt requires the Spanish canonical alias and `merge-tracker.mjs` normalizes it to `Evaluated`.

## Risks and Blockers

- The cached JD is extracted from a batch source, so freshness and live apply-state remain unverified in batch mode.
- The official Intuit site returned inconsistent HTML on direct open, so the comp range will rely on the search snippet from the official job page rather than a clean page scrape.
- The candidate is strong on React/full-stack systems, but direct Cypress/Playwright, design-system, and experimentation-platform evidence is thinner than the JD's preferred stack.
- Sponsorship remains unresolved because the cached frontmatter says `h1b: "unknown"`.

## Final Outcome

Pending report generation and verification.
