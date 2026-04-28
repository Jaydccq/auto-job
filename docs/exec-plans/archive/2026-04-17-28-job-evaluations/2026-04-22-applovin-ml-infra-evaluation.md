# AppLovin ML Infrastructure Evaluation

## Background

The bridge MVP requested a batch evaluation for AppLovin's ML Infrastructure Engineer role using the cached JD file as the primary source. The candidate profile, CV, and article proof points are the only durable sources of candidate facts.

## Goal

Generate a complete A-G evaluation report and tracker-addition TSV line without generating a PDF.

## Scope

- Read the cached JD, `cv.md`, `article-digest.md`, `llms.txt` if present, `config/profile.yml`, `data/applications.md`, and `data/scan-history.tsv`.
- Write `reports/298-applovin-2026-04-22.md`.
- Write `batch/tracker-additions/OTGwJqwAe_Q8_k4koZO__.tsv`.
- Do not edit `cv.md`, `i18n.ts`, portfolio files, or `data/applications.md`.

## Assumptions

- The cached JD is sufficient for a batch evaluation even though the description is short.
- `PDF_CONFIRMED: no` means PDF generation must be skipped.
- The candidate requires sponsorship based on `config/profile.yml`.
- Tracker numbering follows `max(data/applications.md #) + 1`, not the report number.

## Implementation Steps

1. Read local sources and identify role metadata.
   Verify: cache file, CV, article digest, profile, tracker, and scan history were read.
2. Evaluate A-G against the JD and candidate sources.
   Verify: report includes role summary, match table, gaps, strategy, comp, personalization, interview plan, legitimacy, score, and keywords.
3. Write report and tracker addition.
   Verify: files exist at the requested paths and tracker row has 9 tab-separated columns.
4. Validate output constraints.
   Verify: no PDF generated, no protected source files modified, final JSON can reference the generated report.

## Verification Approach

- Use shell checks for file existence.
- Count tracker TSV fields with `awk -F '\t'`.
- Inspect report header and key sections.
- Check git status to confirm only intended files were added plus any pre-existing unrelated modifications.

## Progress Log

- 2026-04-22: Read cached JD. It contains company, role, location, work model, Jobright match signals, requirements, and responsibilities, but no YAML frontmatter.
- 2026-04-22: Read `cv.md`, `article-digest.md`, `config/profile.yml`, `data/applications.md`, and `data/scan-history.tsv`. `llms.txt` was not present.
- 2026-04-22: Calculated next tracker number as 296 from `data/applications.md`.
- 2026-04-22: Created the full report and tracker addition. PDF intentionally skipped.

## Key Decisions

- Classified the role as `AI Platform / LLMOps Engineer` with `AI Forward Deployed Engineer` as the secondary flavor because the role centers on ML infra, distributed systems, online model performance, and model delivery pipeline work.
- Scored the role below 4.5 because direct online model serving and ML delivery pipeline experience are adjacent rather than explicit, and the JD lacks salary transparency.
- Set legitimacy to `Proceed with Caution` because the Greenhouse source and structured role signals look credible, but freshness and apply-button state are unverified in batch mode and the cached JD is short.

## Risks and Blockers

- Sponsorship is not confirmed by the official JD text, though the cache says H1B sponsor likely.
- Salary is missing from the JD cache, so compensation scoring is directional.
- Exact posting freshness is unverified in batch mode.

## Final Outcome

Report `reports/298-applovin-2026-04-22.md` was generated with score
`4.2/5`, merged into the tracker as row 296, and no PDF was generated.
