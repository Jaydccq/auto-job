# AgileGrid Python Developer Evaluation

## Background

Bridge batch run `gPQddywsGbi81ezp150VP` requested a repository-backed evaluation for AgileGrid Solutions' Software Developer -Python posting from BestJobTool/LinkedIn.

Primary JD source: `/var/folders/ly/sdg_pj9x6xb8b89q5yytyhdw0000gn/T/career-ops-bridge-jd-gPQddywsGbi81ezp150VP.txt`.

## Goal

Produce the required batch artifacts:

1. Evaluation report at `reports/304-agilegrid-solutions-2026-04-22.md`
2. Tracker addition at `batch/tracker-additions/gPQddywsGbi81ezp150VP.tsv`
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
- Editing `cv.md`, `i18n.ts`, or portfolio files.

## Assumptions

- The JD cache is the source of truth for this batch run.
- The JD cache does not contain YAML frontmatter, so metadata was parsed from the visible key/value fields.
- `llms.txt` is absent in this checkout, so it cannot contribute proof points.
- The salary field in the JD cache is not a real salary range.
- Sponsorship is treated as a positive local signal because the JD cache says F1/OPT STEM extension and H-1B filing candidates are encouraged to apply, but it still requires recruiter confirmation.

## Implementation Steps

1. Read project instructions and source files.
   Verify: `CLAUDE.md`, `cv.md`, `article-digest.md`, `config/profile.yml`, tracker data, JD cache, and scan history inspected.
2. Evaluate the JD against candidate evidence.
   Verify: each key JD requirement maps to exact `cv.md`, `article-digest.md`, or JD cache line references where available.
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

- 2026-04-22: Read local JD cache, project instructions, candidate CV, article digest, profile config, tracker tail, and scan-history matches.
- 2026-04-22: Determined no PDF should be generated because the run explicitly says `PDF_CONFIRMED: no`.
- 2026-04-22: Evaluated the role as a generic entry-level Python/software developer posting with positive sponsorship language but weak detail and no salary range.
- 2026-04-22: Wrote report and tracker addition for report 304.

## Key Decisions

- Arquetype selected as `AI Forward Deployed Engineer (closest) + AI Solutions Architect (secondary)` because the official six-archetype set does not include a pure entry-level Python/software developer role, and this posting emphasizes practical delivery, collaboration, and supervised software projects rather than AI platform work.
- Overall score set below application-answer threshold because the CV match is strong, but the role has weak AI north-star alignment, no real salary range, generic JD quality, and unclear employment terms.
- Posting legitimacy set to `Proceed with Caution` because the sponsorship signal is favorable but batch mode cannot verify freshness or live apply state, and the JD appears aggregator-style.

## Risks and Blockers

- Compensation is not disclosed.
- The posting may be a generic training/placement-style role rather than a direct product engineering role.
- Sponsorship language must be confirmed with the employer.
- Exact technical stack, first project, reporting line, and employment type are not stated.

## Final Outcome

Report `reports/304-agilegrid-solutions-2026-04-22.md` was generated with
score `3.15/5`, merged into the tracker as row 299, and no PDF was generated.
