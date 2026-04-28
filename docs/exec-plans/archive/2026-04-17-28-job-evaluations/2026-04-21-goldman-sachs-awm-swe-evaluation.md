# Goldman Sachs AWM SWE Evaluation

## Background

The bridge MVP queued a cached JD for Goldman Sachs' Asset & Wealth Management
Software Engineer - Associate role in New York. The run requested report 288,
one tracker addition TSV, and no PDF because `PDF_CONFIRMED: no`.

## Goal

Generate a complete A-G evaluation report and tracker addition for the bridge
adapter while leaving `cv.md`, `i18n.ts`, and `data/applications.md` unchanged.

## Scope

- Read the cached JD, `cv.md`, `article-digest.md`, profile configuration,
  state definitions, `data/applications.md`, and scan history.
- Write `reports/288-goldman-sachs-2026-04-21.md`.
- Write `batch/tracker-additions/HDH9VEvuS1-0xlbodh4XC.tsv`.
- Skip PDF generation.

## Assumptions

- The local JD cache is the source of truth for this batch run.
- The cached salary value is a platform marketing string, not compensation.
- `H1B Sponsor Likely` is a favorable signal but still needs recruiter
  confirmation.
- The JD is enterprise full-stack/platform engineering rather than AI-first, so
  the closest required prompt archetypes are AI Solutions Architect and AI
  Forward Deployed Engineer.

## Implementation Steps

1. Read local source files.
   Verify: cached JD, CV, article digest, profile, tracker, states, and scan
   history were inspected.
2. Produce the A-G evaluation report.
   Verify: report exists at the requested path and contains required sections.
3. Produce tracker addition TSV.
   Verify: TSV has one tab-separated line with 9 columns and next number 287.
4. Skip PDF.
   Verify: final JSON reports `pdf: null`.

## Verification Approach

- File existence checks for report and tracker TSV.
- Basic content checks for report header, score, legitimacy, and keywords.
- `awk` column count check for the TSV.

## Progress Log

- 2026-04-21: Read `CLAUDE.md`, ran the update checker, and confirmed it
  returned offline.
- 2026-04-21: Read the cached JD, `cv.md`, `article-digest.md`,
  `config/profile.yml`, `templates/states.yml`, `data/applications.md`, and
  `data/scan-history.tsv`.
- 2026-04-21: Confirmed `llms.txt` is absent in this repository.
- 2026-04-21: Found one prior scan-history appearance for a similar Goldman
  Sachs AWM Analyst role in New York and one prior Goldman Sachs AWM AI report,
  but not this exact Oracle req.
- 2026-04-21: Wrote report 288 and the tracker addition TSV. PDF generation was
  skipped because `PDF_CONFIRMED: no`.

## Key Decisions

- No web fetch or web search will be used because the local JD cache has enough
  company, role, location, work model, seniority, requirements, and sponsorship
  signal for the requested evaluation.
- No draft application answers will be included unless the global score reaches
  4.5.
- No PDF will be generated because the run explicitly says `PDF_CONFIRMED: no`.

## Risks and Blockers

- Posting freshness and apply-button state remain unverified in batch mode.
- Exact compensation is unknown; the cached salary field is not a salary band.
- Sponsorship is favorable but not guaranteed until confirmed by Goldman Sachs.

## Final Outcome

Completed. Report 288 and the tracker addition TSV were written. PDF generation
was skipped as required.
