# LendingClub Decision Infrastructure Evaluation

## Background

Bridge batch run `HJfCeUCSMPaZGl-6mgoeb` requested a repository-backed evaluation for LendingClub's Decision Infrastructure Analyst posting.

Primary JD source: `/var/folders/ly/sdg_pj9x6xb8b89q5yytyhdw0000gn/T/career-ops-bridge-jd-HJfCeUCSMPaZGl-6mgoeb.txt`.

## Goal

Produce the required batch artifacts:

1. Evaluation report at `reports/310-lendingclub-2026-04-22.md`
2. Tracker addition at `batch/tracker-additions/HJfCeUCSMPaZGl-6mgoeb.tsv`
3. Final machine-readable JSON result

## Scope

In scope:
- Read local JD cache and candidate source files.
- Evaluate fit across blocks A-G.
- Skip PDF generation because `PDF_CONFIRMED: no`.
- Write one tracker addition line without editing `data/applications.md`.

Out of scope:
- Live application submission.
- PDF generation.
- External company or compensation research.
- Editing `cv.md`, `i18n.ts`, portfolio files, or `data/applications.md`.

## Assumptions

- The JD cache is the source of truth for this batch run.
- The JD cache does not contain YAML frontmatter, so metadata was parsed from visible key/value fields.
- `llms.txt` is absent in this checkout, so it cannot contribute proof points.
- The salary field in the JD cache is not a real salary range.
- The H1B signal is a local recommendation tag, not official employer language, so sponsorship still requires recruiter confirmation.
- The Workday URL is a strong legitimacy signal, but posting freshness and apply-button state remain unverified in batch mode.

## Implementation Steps

1. Read project instructions and source files.
   Verify: `CLAUDE.md`, `cv.md`, `article-digest.md`, `config/profile.yml`, tracker data, JD cache, and scan history inspected.
2. Evaluate the JD against candidate evidence.
   Verify: key JD requirements map to exact `cv.md` and `article-digest.md` line references where available.
3. Write report and tracker addition.
   Verify: files exist at required paths and tracker line has 9 TSV columns.
4. Run targeted validation.
   Verify: confirm report path, tracker columns, no PDF generated, and final JSON fields are accurate.

## Verification Approach

- Use local file checks instead of web fetch because the JD cache is present.
- Validate tracker TSV column count with `awk -F '\t'`.
- Confirm the report contains required sections A-G and omits section H because score is below 4.5.
- Confirm no PDF path was generated for this run.

## Progress Log

- 2026-04-22: Read local JD cache, project instructions, candidate CV, article digest, profile config, tracker data, and scan-history matches.
- 2026-04-22: Determined no PDF should be generated because the run explicitly says `PDF_CONFIRMED: no`.
- 2026-04-22: Evaluated the role as an entry-level decision infrastructure / analytical engineering role with strong SQL/Python/PySpark fit, adjacent finance-AI proof, and no hard clearance blocker.
- 2026-04-22: Wrote report and tracker addition for report 310.

## Key Decisions

- Arquetype selected as `AI Solutions Architect (closest) + AI Forward Deployed Engineer (secondary)` because the role buys business-to-technical translation, decision platform implementation, APIs, data-source integration, and production validation rather than pure model research.
- Overall score set below the application-answer threshold because the role is a solid technical fit, but compensation is not disclosed, official sponsorship language is not present in the JD body, and credit-risk decisioning depth is only adjacent in the candidate record.
- Posting legitimacy set to `High Confidence` because the URL is an official LendingClub Workday posting and the JD contains concrete responsibilities, while freshness and apply-button state remain unverified in batch mode.

## Risks and Blockers

- Compensation is not disclosed in the local JD cache.
- The role is hybrid in San Francisco.
- Sponsorship is a positive local recommendation tag, not a confirmed employer statement.
- Credit-risk decisioning, regression modeling, and decision-platform experience are adjacent rather than direct.

## Final Outcome

Report `reports/310-lendingclub-2026-04-22.md` was generated with score `3.85/5`, tracker addition row `305` was written, and no PDF was generated.
