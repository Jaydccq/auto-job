# Salesforce AMTS College Grad Evaluation

## Background

Bridge batch run `dJzgfIuWh_wfjTdevIjxf` requested a repository-backed evaluation for Salesforce's Software Engineering AMTS college graduate posting.

Primary JD source: `/var/folders/ly/sdg_pj9x6xb8b89q5yytyhdw0000gn/T/career-ops-bridge-jd-dJzgfIuWh_wfjTdevIjxf.txt`.

## Goal

Produce the required batch artifacts:

1. Evaluation report at `reports/312-salesforce-2026-04-22.md`
2. Tracker addition at `batch/tracker-additions/dJzgfIuWh_wfjTdevIjxf.tsv`
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
- External company or compensation research unless local data is insufficient for a useful score.

## Assumptions

- The JD cache is the source of truth for this batch run.
- `llms.txt` is absent in this checkout, so it cannot contribute proof points.
- The cached salary field is not a real compensation range.
- The cached `H1B Sponsor Likely` and `sponsorship_supported` signals are positive but unofficial; sponsorship still needs employer confirmation.
- Batch mode cannot verify live apply-button state or exact posting freshness.
- The role is primarily general new-grad product/platform software engineering, with agentic AI-assisted development as a strong differentiator rather than the product domain.

## Implementation Steps

1. Read project instructions and source files.
   Verify: `CLAUDE.md`, cached JD, `cv.md`, `article-digest.md`, `config/profile.yml`, tracker data, states, and scan history were inspected.
2. Evaluate the JD against candidate evidence.
   Verify: each key JD requirement maps to exact `cv.md`, `article-digest.md`, or profile line references where available.
3. Write report and tracker addition.
   Verify: files exist at required paths and tracker line has 9 TSV columns.
4. Run targeted validation.
   Verify: confirm report path, tracker columns, no PDF generated, and final JSON fields are accurate.

## Verification Approach

- Use local file checks instead of web fetch because the JD cache is present.
- Validate tracker TSV column count with `awk -F '\t'`.
- Confirm the report contains required sections A-G and omits section H because the score is below 4.5.
- Confirm no PDF file was generated for this run.

## Progress Log

- 2026-04-22: Read `CLAUDE.md`, cached JD, `cv.md`, `article-digest.md`, `config/profile.yml`, `templates/states.yml`, `data/applications.md`, and `data/scan-history.tsv`.
- 2026-04-22: Confirmed `llms.txt` is absent and no PDF should be generated because the run says `PDF_CONFIRMED: no`.
- 2026-04-22: Selected `Agentic Workflows / Automation` as the closest required archetype because the JD explicitly values LLM coding assistants, agentic tools, and AI-guided development workflows.

## Key Decisions

- Overall score will stay below the draft-answers threshold because the role is a strong new-grad software engineering target but lacks a real salary range and is not a pure AI product/platform role.
- Posting legitimacy is `High Confidence` based on the official Salesforce Workday URL, coherent requirements, transparent location/work-model details, and no exact duplicate in local scan history.
- Tracker status should use the repository canonical state `Evaluated` from `templates/states.yml`.

## Risks and Blockers

- Official sponsorship language is not present in the cached JD despite positive local enrichment signals.
- Compensation is not disclosed in the available JD cache.
- Team placement could determine whether this is product engineering, QA automation, platform engineering, or a test-focused track.

## Final Outcome

Pending until report and tracker verification complete.
