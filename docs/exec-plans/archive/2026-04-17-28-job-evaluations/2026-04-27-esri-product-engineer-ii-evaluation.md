# Esri Product Engineer II Evaluation

## Background

Batch worker run for LinkedIn job `4407488630` with local JD cache already extracted in the bridge temp file. The task is to produce a complete A-G evaluation report, a tracker TSV addition, and a final JSON status object. PDF generation is explicitly disabled for this run.

## Goal

Create a repo-backed evaluation for Esri's `Product Engineer II - Generative AI & Assistants, ArcGIS Pro` role, grounded in `cv.md` and `article-digest.md`, and write the report plus tracker line to the required locations.

## Scope

- Read the local JD cache and profile materials.
- Classify the role into the nearest archetype.
- Write `reports/416-esri-2026-04-27.md`.
- Write `batch/tracker-additions/mQfhHdt124TBesoXKQKLC.tsv`.
- Do not generate a PDF in this run.

Out of scope:

- Editing `cv.md`, `config/profile.yml`, or `article-digest.md`.
- Web searching unless the local JD cache is insufficient.
- Tracker merge into `data/applications.md`.

## Assumptions

- The temp JD file is the source of truth for this run.
- Sponsorship is not explicitly blocked by the JD, so it should be treated as an open risk rather than a hard no.
- The role is closer to AI platform / LLMOps and product engineering than to pure PM or pure client-facing FDE.

## Implementation Steps

1. Read the JD cache, `cv.md`, `article-digest.md`, `config/profile.yml`, and tracker context.
   Verify: extract exact lines/sections to cite in the report.
2. Draft the A-G evaluation with no fabricated metrics and no PDF section.
   Verify: the report contains the required sections and matches the requested tone.
3. Write the report markdown to `reports/416-esri-2026-04-27.md`.
   Verify: file exists and content is complete.
4. Write the TSV tracker addition.
   Verify: single-line TSV exists at the requested path with the expected columns.
5. Validate the written artifacts.
   Verify: inspect the report and tracker line contents, then emit final JSON.

## Verification Approach

- `sed` / `nl` inspection of source material.
- File existence and content checks for the new report and tracker TSV.
- Final JSON payload must include the requested report path, score, archetype, legitimacy, and null PDF.

## Progress Log

- 2026-04-27: Started the Esri evaluation run and collected the local source files needed for the assessment.

## Key Decisions

- Use the local JD cache instead of external lookup because it already includes the role metadata, salary, responsibilities, and requirements.
- Keep PDF generation disabled because the run did not include explicit confirmation.
- Treat the role as a serious but not clean sponsorship-confirmed target.

## Risks and Blockers

- Sponsorship is not confirmed.
- The JD asks for experience with training datasets / fine-tuning, which is adjacent rather than directly evidenced by the CV.
- The role is on-site in Redlands, CA, which may affect practical fit.

## Final Outcome

Pending.
