# Charles Schwab Production Operations Developer Evaluation

## Background

Bridge batch run `LcLsEwskt7k6PkHk9Di_U` requested a repository-backed evaluation for Charles Schwab's Production Operations Developer posting.

Primary JD source: `/var/folders/ly/sdg_pj9x6xb8b89q5yytyhdw0000gn/T/career-ops-bridge-jd-LcLsEwskt7k6PkHk9Di_U.txt`.

## Goal

Produce the required batch artifacts:

1. Evaluation report at `reports/305-charles-schwab-2026-04-22.md`
2. Tracker addition at `batch/tracker-additions/LcLsEwskt7k6PkHk9Di_U.tsv`
3. Final machine-readable JSON result

## Scope

In scope:
- Read the local JD cache and candidate source files.
- Evaluate fit across blocks A-G.
- Skip PDF generation because `PDF_CONFIRMED: no`.
- Write one tracker addition line without editing `data/applications.md`.

Out of scope:
- Live application submission.
- PDF generation.
- External company or compensation research unless local data is insufficient to make a useful judgment.

## Assumptions

- The JD cache is the source of truth for this batch run.
- `llms.txt` is absent in this checkout, so it cannot contribute proof points.
- The cached salary field is not a real compensation range, so comp is scored from transparency and likely target fit rather than a concrete band.
- The cached `H1B Sponsor Likely` tag is treated as a positive but unofficial signal, not confirmed employer language.
- Batch mode cannot verify live apply-button state or exact posting freshness.

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
- 2026-04-22: Drafted evaluation with the role framed as production operations / devops with only weak LLMOps adjacency.

## Key Decisions

- Archetype selected as `AI Platform / LLMOps Engineer (closest analogue only)` because the official six-archetype set does not include a pure production operations developer role, and the closest overlap is reliability, observability, scripting, and production support.
- Overall score set below application-answer threshold because the role has useful operations overlap but weak AI north-star alignment, no salary transparency, on-site Texas location, and tooling gaps around Control-M and Remedy/SmartIT.
- Posting legitimacy set to `High Confidence` because the posting is hosted on Charles Schwab's official iCIMS domain and the cached JD has coherent, specific requirements.

## Risks and Blockers

- Sponsorship is likely but not confirmed by official JD language.
- Compensation is not disclosed in the cached JD.
- The role may be more operations/on-call oriented than software engineering growth-oriented.

## Final Outcome

Report `reports/305-charles-schwab-2026-04-22.md` was generated with score
`2.65/5`, merged into the tracker as row 300, and no PDF was generated.
