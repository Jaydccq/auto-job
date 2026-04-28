# Trexquant Quantitative Researcher Evaluation

## Background

Batch worker run for Trexquant Investment LP's `Quantitative Researcher - Early Career (USA)` role. The bridge temp file already contains the JD text, including salary and entry-level signals, so the task is to produce a repo-backed A-G evaluation report plus a tracker addition. PDF generation is disabled for this run.

## Goal

Write `reports/432-trexquant-investment-lp-2026-04-27.md`, add the tracker TSV under `batch/tracker-additions/-10JpgrUvHoSzWYnGl4JH.tsv`, and finish with a valid JSON payload.

## Scope

- Read the bridge JD cache, `cv.md`, `article-digest.md`, `config/profile.yml`, and tracker context.
- Classify the role into the nearest archetype and score it.
- Write the report markdown and tracker TSV.
- Do not generate a PDF.

Out of scope:

- Editing `cv.md`, `config/profile.yml`, `article-digest.md`, or `data/applications.md`.
- External web lookup unless the local JD cache is insufficient.

## Assumptions

- The local JD cache is the source of truth for this run.
- The role is a real early-career quant research opening with transparent salary.
- Sponsorship is not explicitly blocked by the JD, so it is a follow-up risk rather than a hard no.

## Implementation Steps

1. Read the JD cache, CV, profile, article digest, and tracker history.
   Verify: extract exact lines and proof points to cite in the report.
2. Draft the A-G evaluation with no PDF section.
   Verify: the report contains all required sections and omits H because the score is below the draft-answer threshold.
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

- 2026-04-27: Started the Trexquant evaluation run and collected the JD cache, CV, article digest, profile, and tracker context.

## Key Decisions

- Use the bridge JD cache directly because it already contains the role metadata, salary, and responsibilities.
- Keep PDF generation disabled because the run did not include explicit confirmation.
- Treat the role as a strong quant-research fit with the main open risk being sponsorship clarity.

## Risks and Blockers

- Sponsorship is not explicitly stated in the JD.
- Batch mode cannot verify live apply-button freshness.
- The role is finance-quant adjacent rather than pure quant trading, so the match should be framed honestly.

## Final Outcome

Pending.
