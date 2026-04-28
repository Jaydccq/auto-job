# Conversica AI Platform Evaluation

## Background

Batch worker run for Conversica's `Software Engineer (AI Platform)` role. The JD was already extracted into the bridge temp file, so the work is to produce a repo-backed A-G evaluation report, a tracker TSV addition, and a final JSON payload. PDF generation is explicitly disabled for this run.

## Goal

Create a complete evaluation grounded in `cv.md` and `article-digest.md`, write the report to `reports/423-conversica-2026-04-27.md`, and emit the tracker addition at `batch/tracker-additions/r0bsBzRrpRpvC_LuF-pk6.tsv`.

## Scope

- Read the local JD cache, `cv.md`, `article-digest.md`, and tracker context.
- Classify the role into the nearest archetype.
- Write the report markdown and tracker TSV.
- Do not generate a PDF.

Out of scope:

- Editing `cv.md`, `config/profile.yml`, `article-digest.md`, or `data/applications.md`.
- External web lookup unless the local JD cache is insufficient.

## Assumptions

- The local JD cache is the source of truth for this run.
- Sponsorship is not explicitly blocked by the JD, so it is a risk to note rather than a hard no.
- The role is best treated as an AI platform / LLMOps target with backend and automation adjacency.

## Implementation Steps

1. Read the JD cache, `cv.md`, `article-digest.md`, and tracker history.
   Verify: extract exact lines and proof points to cite in the report.
2. Draft the A-G evaluation plus draft application answers because the score is expected to clear the threshold.
   Verify: the report includes all required sections and no PDF content.
3. Write the report markdown.
   Verify: file exists at the requested path and contains the requested sections.
4. Write the tracker TSV addition.
   Verify: single-line TSV exists with the expected columns and next sequence number.
5. Validate the artifacts and emit final JSON.
   Verify: paths, score, legitimacy, and PDF nullability are consistent.

## Verification Approach

- Inspect source lines with `nl -ba` / `sed`.
- Confirm the report file and tracker TSV exist.
- Check that the report uses the right score, legitimacy tier, and no-PDF default.

## Progress Log

- 2026-04-27: Started the Conversica evaluation run and collected the JD cache, CV, article digest, tracker history, and plan context.

## Key Decisions

- Use the bridge JD cache directly because it already contains the role metadata, salary, and responsibilities.
- Keep PDF generation disabled because the run did not include explicit confirmation.
- Treat the role as a strong platform/backend fit with the main open risk being sponsorship clarity.

## Risks and Blockers

- Sponsorship is not explicitly stated in the JD.
- Batch mode cannot verify live apply-button freshness.
- Team size is not stated, so the summary must mark it as unknown.

## Final Outcome

Pending.
