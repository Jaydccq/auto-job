# Remitly Software Development Engineer 1, Pricing Platform Evaluation

## Background

Bridge batch run `hhU3N37ppyVTeOffuViLT` requests a full A-G evaluation for Remitly's `Software Development Engineer 1, Pricing Platform` role using the cached JD file at `/var/folders/ly/sdg_pj9x6xb8b89q5yytyhdw0000gn/T/career-ops-bridge-jd-hhU3N37ppyVTeOffuViLT.txt`.

## Goal

Produce a complete markdown evaluation report, write the tracker-addition TSV row, and return a valid bridge JSON summary. PDF generation is explicitly disabled for this run.

## Scope

- Read the required local inputs: cached JD, `cv.md`, optional `llms.txt`, `article-digest.md`, `config/profile.yml`, `data/applications.md`, and `data/scan-history.tsv`.
- Use the cached JD as the primary source unless a critical gap forces external lookup. For this run, the cached JD already includes compensation, location, and requirement detail, so no web lookup is planned.
- Write `reports/362-remitly-2026-04-24.md`.
- Write `batch/tracker-additions/hhU3N37ppyVTeOffuViLT.tsv`.
- Do not edit `cv.md`, `i18n.ts`, `data/applications.md`, or any portfolio artifacts.

## Assumptions

- The cached JD is sufficiently detailed for role, comp, and legitimacy analysis.
- `llms.txt` is absent, so there is no extra local context file to apply.
- The candidate requires sponsorship / work authorization support per `config/profile.yml`.
- The role is an early-career platform/backend pricing-systems role; the closest available archetype framing will emphasize production systems, pipelines, observability, and cross-stack delivery rather than forcing an exact AI-title match.
- Because this is a batch run, posting freshness and live apply-state remain unverified.

## Implementation Steps

1. Read repository instructions, candidate materials, cached JD, and tracker history.
   Verify: all required local inputs are inspected and PDF remains disabled.
2. Draft the evaluation with line-level evidence from `cv.md` and proof-point support from `article-digest.md`.
   Verify: report includes sections A-G, score table, legitimacy assessment, and ATS keywords.
3. Write the report and tracker-addition TSV row.
   Verify: both files exist and the TSV contains exactly 9 tab-separated columns.
4. Run targeted structural checks and finalize the bridge JSON fields.
   Verify: header fields, tracker numbering, and output paths are internally consistent.

## Verification Approach

- Use shell checks for file existence and TSV column count.
- Inspect the report header and required sections with `rg`.
- Compute the next tracker number from the maximum existing numeric row in `data/applications.md`.
- Confirm the run stayed in `report + tracker` mode with no PDF output.

## Progress Log

- 2026-04-24: Read `CLAUDE.md`, `docs/CODEX.md`, `config/profile.yml`, the cached Remitly JD, `cv.md`, `article-digest.md`, `data/applications.md`, `data/scan-history.tsv`, and `templates/states.yml`.
- 2026-04-24: Confirmed `llms.txt` is absent and `PDF_CONFIRMED: no`, so the run stays on `report + tracker`.
- 2026-04-24: Confirmed the cached JD includes company, role, location, work model, salary, responsibilities, and requirements, so no external lookup is needed.

## Key Decisions

- Keep the cached JD as the sole source for role analysis, comp, and legitimacy because it already contains the needed facts.
- Treat sponsorship as a risk to confirm rather than a blocker because the cached JD does not explicitly reject sponsorship and includes a positive heuristic signal.
- Use `Evaluada` in the tracker-addition TSV because the bridge prompt requires the Spanish alias and the repo normalizes it later.

## Risks and Blockers

- The role is not explicitly AI-focused, so the archetype mapping will necessarily be approximate.
- The candidate is strong on backend, full-stack, and data systems, but direct fintech pricing-domain experience is not explicit.
- Batch mode cannot verify freshness or live application state on the Workday page.

## Final Outcome

Pending report generation and verification.
