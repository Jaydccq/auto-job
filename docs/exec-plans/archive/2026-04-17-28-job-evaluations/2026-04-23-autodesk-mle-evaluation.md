# Autodesk Machine Learning Engineer Evaluation

## Background

The bridge MVP requested a batch evaluation for Autodesk's `Machine Learning Engineer` role using the cached JD file as the primary source. The run requires a complete A-G report, a tracker-addition TSV line, no PDF unless explicitly confirmed, and a final machine-readable JSON response.

## Goal

Generate a durable report and tracker addition for the Autodesk role without editing protected source files or generating a PDF.

## Scope

- Read the cached JD, `cv.md`, `article-digest.md`, `llms.txt` if present, `config/profile.yml`, `data/applications.md`, `data/scan-history.tsv`, and canonical state definitions.
- Write `reports/315-autodesk-2026-04-23.md`.
- Write `batch/tracker-additions/5wPg08Uwtx8WuLv3qn3sV.tsv`.
- Do not edit `cv.md`, `i18n.ts`, portfolio files, or `data/applications.md`.

## Assumptions

- The cached JD is sufficient for this batch evaluation; no web fetch or web search is needed.
- The cached salary range and location are usable for compensation scoring.
- `PDF_CONFIRMED: no` means PDF generation must be skipped.
- The candidate requires sponsorship based on `config/profile.yml`.
- Tracker numbering follows `max(data/applications.md #) + 1`, not the report number.

## Implementation Steps

1. Read local sources and identify role metadata.
   Verify: cache file, CV, article digest, profile, tracker, states, and scan history were read.
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
- Check git status to confirm only intended files were added or modified for this task.

## Progress Log

- 2026-04-23: Read the cached JD. It contains company, role, location, work model, salary, Jobright match signals, requirements, responsibilities, and a description excerpt; it does not use YAML frontmatter delimiters.
- 2026-04-23: Read `cv.md`, `article-digest.md`, `config/profile.yml`, `data/applications.md`, `data/scan-history.tsv`, and `templates/states.yml`. `llms.txt` is not present.
- 2026-04-23: Calculated next tracker number as 311 from `data/applications.md`.
- 2026-04-23: Created the full A-G report and tracker-addition TSV. PDF intentionally skipped because `PDF_CONFIRMED: no`.

## Key Decisions

- Classify the role as `AI Platform / LLMOps Engineer` with an `AI Forward Deployed Engineer` secondary flavor because the role centers on ML model training, deployment, evaluation, FastAPI-backed inference, stakeholder collaboration, and production model monitoring.
- Use the cached salary range `$96000-$172425/yr` for compensation scoring instead of external search.
- Treat the cache's `sponsorship_supported` / `H1B Sponsor Likely` signal as positive but still require phone-screen confirmation because the JD excerpt itself does not state sponsorship terms.

## Risks and Blockers

- Posting freshness and apply-button state are unverified in batch mode.
- The candidate has strong adjacent ML deployment proof, but less direct evidence of commercial SageMaker/Ray/TensorFlow production ownership.
- Hybrid San Francisco may require relocation from North Carolina.

## Final Outcome

Report `reports/315-autodesk-2026-04-23.md` was generated with score
`4.45/5`, tracker addition `batch/tracker-additions/5wPg08Uwtx8WuLv3qn3sV.tsv`
was created as row 311, and no PDF was generated.
