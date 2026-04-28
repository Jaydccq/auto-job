# Morgan Stanley Full Stack Java Evaluation

## Background

The bridge MVP queued a cached JD for Morgan Stanley's Full Stack Java Developer
- Associate role at `https://morganstanley.eightfold.ai/careers/job/549796915122`.
The run requested a full A-G evaluation, a tracker addition TSV, and no PDF
because `PDF_CONFIRMED: no`.

## Goal

Generate report 286 and one tracker addition for the bridge adapter without
modifying `cv.md`, `i18n.ts`, or `data/applications.md`.

## Scope

- Read the cached JD, `cv.md`, `article-digest.md`, profile configuration, state
  definitions, `data/applications.md`, and scan history.
- Write `reports/286-morgan-stanley-2026-04-21.md`.
- Write `batch/tracker-additions/owzTC7TB6XzHQ8Sea5Zz6.tsv`.
- Skip PDF generation.

## Assumptions

- The local JD cache is the source of truth for this batch run.
- The cached salary value is a Jobright marketing string, not compensation.
- `H1B Sponsor Likely` is a favorable signal but still needs recruiter
  confirmation.
- Since this is an enterprise Java/full-stack role, the closest required
  prompt archetypes are AI Platform / LLMOps Engineer plus AI Solutions
  Architect, even though the JD itself is not AI-first.

## Implementation Steps

1. Read local source files.
   Verify: cached JD, CV, article digest, profile, tracker, states, and scan
   history were inspected.
2. Produce the A-G evaluation report.
   Verify: report exists at the requested path and contains required sections.
3. Produce tracker addition TSV.
   Verify: TSV has one tab-separated line with 9 columns and next number 286.
4. Skip PDF.
   Verify: final JSON reports `pdf: null`.

## Verification Approach

- File existence checks for report and tracker TSV.
- Basic content checks for report header, score, legitimacy, and keywords.
- `awk` column count check for the TSV.

## Progress Log

- 2026-04-21: Read `CLAUDE.md`, `cv.md`, `article-digest.md`,
  `config/profile.yml`, `modes/_profile.md`, `templates/states.yml`,
  `data/applications.md`, and the cached JD file.
- 2026-04-21: Confirmed `llms.txt` and `i18n.ts` are absent in this repository.
- 2026-04-21: Found the same role had already been evaluated as report 278;
  created a fresh bridge report 286 because the run reserved that report number.

## Key Decisions

- No web fetch or web search was used because the local JD cache had enough role,
  location, seniority, requirements, responsibilities, and sponsorship signal.
- No draft application answers were included because the global score is below
  4.5.
- No PDF was generated because the run explicitly says `PDF_CONFIRMED: no`.

## Risks and Blockers

- Posting freshness and apply-button state remain unverified in batch mode.
- Exact compensation is unknown; the cached salary field is not a salary band.
- Sponsorship is favorable but not guaranteed until confirmed by Morgan Stanley.

## Final Outcome

Completed. Report 286 and the tracker addition TSV were written. PDF generation
was skipped as required.
