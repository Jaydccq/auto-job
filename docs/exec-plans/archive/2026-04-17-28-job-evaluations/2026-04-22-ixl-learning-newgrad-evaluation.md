# IXL Learning New Grad SWE Evaluation

## Background

The bridge batch worker received a cached JD for IXL Learning's `Software Engineer, New Grad` role. The candidate is Hongxi Chen, read from `config/profile.yml`. The run explicitly says `PDF_CONFIRMED: no`, so the required output is the markdown report plus tracker-addition line only.

## Goal

Produce a repository-backed job evaluation for report `314` and a mergeable tracker addition for batch ID `RiUFU8RjZb15qb_4sOnVF`.

## Scope

- Read the cached JD from `/var/folders/ly/sdg_pj9x6xb8b89q5yytyhdw0000gn/T/career-ops-bridge-jd-RiUFU8RjZb15qb_4sOnVF.txt`.
- Read `cv.md`, `article-digest.md`, `llms.txt` if present, `config/profile.yml`, `data/applications.md`, and `data/scan-history.tsv`.
- Write `reports/314-ixl-learning-2026-04-22.md`.
- Write `batch/tracker-additions/RiUFU8RjZb15qb_4sOnVF.tsv`.
- Do not generate a PDF.

## Assumptions

- The cached JD is sufficient because it includes company, role, location, work model, requirements, responsibilities, match tags, and sponsorship signal.
- `llms.txt` is absent in this checkout, so the report records that source limitation rather than inventing missing context.
- The role is primarily a general full-stack/product software engineering new-grad role; the closest required AI archetype framing is `AI Forward Deployed Engineer + AI Solutions Architect`, but the report calls out that this is a weak AI-archetype fit.
- The next tracker number is the maximum existing number in `data/applications.md` plus one.

## Implementation Steps

1. Read local JD and required candidate proof files.
   Verify: cached JD exists and source files were inspected.
2. Evaluate blocks A-G and global score.
   Verify: report contains all required sections and omits H because score is below 4.5.
3. Write report and tracker TSV.
   Verify: target files exist and TSV has exactly nine tab-separated columns.
4. Run targeted validation.
   Verify: check report existence, tracker column count, no PDF artifact created for this company.

## Verification Approach

- File existence checks for the report and tracker addition.
- `awk -F'\t' '{print NF}'` on the tracker addition must return `9`.
- Confirm the report contains the expected title, score, legitimacy tier, and no `## H)` section.

## Progress Log

- 2026-04-22: Read cached JD, repo instructions, CV, article digest, profile, tracker, state definitions, and scan history.
- 2026-04-22: Confirmed `llms.txt` is missing and update check returned offline.
- 2026-04-22: Wrote the report and tracker addition for IXL Learning.

## Key Decisions

- No web fetch/search was used because the cached JD had enough structured detail for evaluation.
- No PDF was generated because the run explicitly says `PDF_CONFIRMED: no`.
- Score set below 4.5 because the role is a strong new-grad software match but weakly aligned with the candidate's AI north star and lacks real salary transparency in the cached JD.

## Risks and Blockers

- Posting freshness and live apply-button state are unverified in batch mode.
- Compensation is not transparent in the cached JD; the salary field contains unrelated Jobright text.
- The JD source is a condensed extraction, so details such as exact team, stack depth, and interview process remain unknown.

## Final Outcome

Completed. Report and tracker addition were written; PDF was intentionally skipped.
