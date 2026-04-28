# WisdomAI Frontend/Fullstack Evaluation

## Background

Bridge MVP batch run for `U-wp8FvK1nE_kymCjyfET`.

The JD cache file is `/var/folders/ly/sdg_pj9x6xb8b89q5yytyhdw0000gn/T/career-ops-bridge-jd-U-wp8FvK1nE_kymCjyfET.txt`.

## Goal

Generate a complete job evaluation report for WisdomAI and a tracker-addition TSV line without generating a PDF.

## Scope

- Read local source-of-truth files: `cv.md`, optional `llms.txt`, `article-digest.md`, `config/profile.yml`, cached JD, `data/applications.md`, and `data/scan-history.tsv`.
- Write `reports/285-wisdomai-2026-04-21.md`.
- Write `batch/tracker-additions/U-wp8FvK1nE_kymCjyfET.tsv`.
- Do not edit `cv.md`, `article-digest.md`, `i18n.ts`, or `data/applications.md`.

## Assumptions

- `llms.txt` is optional and absent in this repository.
- The cached JD is the primary source because it contains title, company, location, work model, requirements, responsibilities, sponsorship signal, and score tags.
- The cache did not include YAML frontmatter.
- The salary line in the cache is a JobRight artifact, not a real salary band.
- No PDF should be generated because `PDF_CONFIRMED: no`.

## Implementation Steps

1. Read source files.
   Verify: local files opened successfully; `llms.txt` absence recorded.
2. Evaluate WisdomAI against candidate profile using cached JD only.
   Verify: report includes blocks A-G, score, legitimacy, and keywords.
3. Write tracker addition.
   Verify: one TSV line, nine columns, canonical status.
4. Check outputs.
   Verify: report and tracker files exist; final JSON can truthfully point to them.

## Verification Approach

- Confirm report path exists.
- Confirm tracker addition has exactly nine tab-separated columns.
- Confirm PDF path is null and no PDF generation command was run.
- Confirm cached JD metrics: `jd_source=cache`, `used_cached_jd=true`, `used_frontmatter=false`, `webfetch_count=0`, `websearch_count=0`.

## Progress Log

- 2026-04-21: Read `CLAUDE.md`, `cv.md`, `article-digest.md`, `config/profile.yml`, cached JD, tracker state, states, and scan history. `llms.txt` is absent. Existing worktree has unrelated user changes; left untouched.
- 2026-04-21: Wrote `reports/285-wisdomai-2026-04-21.md` and `batch/tracker-additions/U-wp8FvK1nE_kymCjyfET.tsv`. PDF generation skipped because `PDF_CONFIRMED: no`.

## Key Decisions

- Use `Agentic Workflows / Automation` with `AI Forward Deployed Engineer` as secondary because the role asks for chat UI, complex visualizations, analytical/agentic workflows, customer/founder collaboration, and early-stage product definition.
- Treat sponsorship as a positive-but-unverified signal from the cached JobRight tags, not as company-confirmed policy.
- Score compensation conservatively because no real salary band is provided.

## Risks and Blockers

- The cached JD is short and may omit full Ashby details.
- Posting freshness and apply-button state are unverified in batch mode.
- On-site San Mateo plus visa sponsorship are the main process risks.

## Final Outcome

Pending verification.
