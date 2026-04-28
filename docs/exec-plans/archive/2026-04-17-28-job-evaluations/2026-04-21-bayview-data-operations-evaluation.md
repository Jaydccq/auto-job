# Bayview Data Operations Analyst Evaluation

## Background

Bridge batch run `BW827sOOOrDmMVpSJwvL5` requests report `290` for Bayview Asset Management's Data Operations Analyst role. The primary JD cache is `/var/folders/ly/sdg_pj9x6xb8b89q5yytyhdw0000gn/T/career-ops-bridge-jd-BW827sOOOrDmMVpSJwvL5.txt`; the repository also contains a richer local JD cache at `jds/bayview-asset-management-llc-a3e0d769.txt`.

## Goal

Generate a real evaluation report and tracker addition without generating a PDF.

## Scope

- Read local candidate sources: `cv.md`, `article-digest.md`, `config/profile.yml`, and `modes/_profile.md`.
- Treat `llms.txt` as optional because it is not present in this checkout.
- Produce `reports/290-bayview-asset-management-2026-04-21.md`.
- Produce `batch/tracker-additions/BW827sOOOrDmMVpSJwvL5.tsv`.
- Do not edit `cv.md`, `i18n.ts`, `data/applications.md`, or portfolio files.

## Assumptions

- The candidate requires sponsorship because `config/profile.yml` says `visa_status: "Requires sponsorship / work authorization support"`.
- No PDF should be generated because this run states `PDF_CONFIRMED: no`.
- The richer `jds/` cache is acceptable as supplementary repository context because the bridge JD is short and points to the same Bayview URL and role.
- No external search is required because the available local JD is sufficient for a low-priority evaluation and compensation is not reliable enough to rescue the score.

## Implementation Steps

1. Read repository instructions and local sources.
   Verify: required files were read or absence was confirmed.
2. Evaluate the JD against the candidate's sourced proof points.
   Verify: report includes blocks A-G, score table, legitimacy tier, and ATS keywords.
3. Write the report and tracker addition.
   Verify: files exist at the required paths and the tracker row has 9 tab-separated columns.
4. Run targeted verification.
   Verify: inspect the generated files, validate JSON shape, and confirm no PDF was generated.

## Verification Approach

- Use line-numbered local source reads to cite CV and article evidence.
- Use `awk` to compute the next tracker number from `data/applications.md`.
- Use shell checks for generated file existence, TSV column count, and report header fields.

## Progress Log

- 2026-04-21: Read `CLAUDE.md`, local JD cache, `cv.md`, `article-digest.md`, `config/profile.yml`, `modes/_profile.md`, `templates/states.yml`, and tracker state.
- 2026-04-21: Confirmed `llms.txt` is absent and no PDF confirmation is present.
- 2026-04-21: Computed max tracker number as 288, so the addition should use 289.
- 2026-04-21: Wrote the Bayview report and tracker addition.

## Key Decisions

- Classify the role as closest to `AI Forward Deployed Engineer / AI Solutions Architect`, with a caveat that the actual job is data operations/analytics rather than AI-first engineering.
- Use `SKIP` in the tracker row because repository state handling canonicalizes skip/no-apply through `merge-tracker.mjs`.
- Score compensation conservatively because the salary field is extraction noise and no reliable range is present.

## Risks and Blockers

- The direct apply page freshness and button state are unverified in batch mode.
- Sponsorship is not confirmed in the JD frontmatter; the Jobright-derived cache says "H1B Sponsor Likely", which is not enough to remove the blocker.
- The role may be legitimate but not aligned with the candidate's AI/backend SWE north star.

## Final Outcome

Report and tracker addition written. Verification pending.
