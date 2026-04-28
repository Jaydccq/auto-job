# Axle Jr. Data Science Engineer Evaluation

## Background

Bridge batch run `i2OJ39Y03_tYRlJSWYKIR` requested a repository-backed evaluation for Axle's Jr. Data Science Engineer posting from LinkedIn.

Primary JD source: `/var/folders/ly/sdg_pj9x6xb8b89q5yytyhdw0000gn/T/career-ops-bridge-jd-i2OJ39Y03_tYRlJSWYKIR.txt`.

## Goal

Produce the required batch artifacts:

1. Evaluation report at `reports/303-axle-2026-04-22.md`
2. Tracker addition at `batch/tracker-additions/i2OJ39Y03_tYRlJSWYKIR.tsv`
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
- External company or compensation research unless local data is insufficient to score.

## Assumptions

- The JD cache is the source of truth for this batch run.
- The salary field in the JD cache is not a real salary range, so compensation is scored from transparency and target-fit rather than a concrete band.
- `llms.txt` is absent in this checkout, so it cannot contribute proof points.
- H1B support is treated as likely but not confirmed because the local JD cache includes `H1B Sponsor Likely`, not official employer language.

## Implementation Steps

1. Read project instructions and source files.
   Verify: `CLAUDE.md`, `cv.md`, `article-digest.md`, `config/profile.yml`, tracker data, and scan history inspected.
2. Evaluate the JD against candidate evidence.
   Verify: each key JD requirement maps to exact `cv.md` or `article-digest.md` line references where available.
3. Write report and tracker addition.
   Verify: files exist at required paths and tracker line has 9 TSV columns.
4. Run targeted validation.
   Verify: confirm report path, tracker columns, no PDF generated, and final JSON fields are accurate.

## Verification Approach

- Use local file checks instead of web fetch because the JD cache is present.
- Validate tracker TSV column count with `awk -F '\t'`.
- Confirm the report contains required sections A-G and omits section H because score is below 4.5.

## Progress Log

- 2026-04-22: Read local JD cache, project instructions, candidate CV, article digest, profile config, tracker tail, and scan-history matches.
- 2026-04-22: Determined no PDF should be generated because the run explicitly says `PDF_CONFIRMED: no`.
- 2026-04-22: Drafted evaluation with Axle as a junior onsite NIH data/full-stack engineering role.

## Key Decisions

- Arquetype selected as `AI Forward Deployed Engineer (closest) + AI Solutions Architect (secondary)` because the official six-archetype set does not include a pure junior data/full-stack role, and this role emphasizes onsite NIH environments, integrations, APIs, data applications, and dashboards more than core AI.
- Overall score set below application-answer threshold because the match is technically strong but the role has weak AI north-star alignment, no real salary range, onsite Rockville requirement, and limited JD depth.
- Posting legitimacy set to `Proceed with Caution` because the JD is internally consistent but batch mode cannot verify posting freshness or the live apply state.

## Risks and Blockers

- Sponsorship is not confirmed by official JD language.
- Compensation is not disclosed.
- The JD is short and likely extracted from an aggregator, so exact hiring-team expectations may differ.

## Final Outcome

Report `reports/303-axle-2026-04-22.md` was generated with score `3.55/5`,
merged into the tracker as row 298, and no PDF was generated.
