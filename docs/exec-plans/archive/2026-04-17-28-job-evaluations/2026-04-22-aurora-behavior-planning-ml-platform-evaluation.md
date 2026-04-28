# Aurora Behavior Planning ML Platform Evaluation

## Background

Batch worker run `rwPmFEVfxr-MU3tRF00IR` evaluates Aurora's Software Engineer II, Behavior Planning ML Platform role for Hongxi Chen.

Primary local JD cache: `/var/folders/ly/sdg_pj9x6xb8b89q5yytyhdw0000gn/T/career-ops-bridge-jd-rwPmFEVfxr-MU3tRF00IR.txt`.

The local cache contains role metadata and a short JD excerpt. The Index Ventures posting mirror was used only to fill missing JD details required for a complete A-G report.

## Goal

Create a complete A-G job evaluation report, plus one tracker-addition TSV line, without generating a PDF.

## Scope

In scope:
- Read `cv.md`, `article-digest.md`, `llms.txt` if present, profile config, JD cache, tracker data, and scan history.
- Generate `reports/299-aurora-2026-04-22.md`.
- Generate `batch/tracker-additions/rwPmFEVfxr-MU3tRF00IR.tsv`.
- Verify the report, tracker line, and protected file status.

Out of scope:
- PDF generation because `PDF_CONFIRMED: no`.
- Editing `cv.md`, `i18n.ts`, portfolio files, or `data/applications.md`.
- Deep company research beyond the JD mirror and local repository signals.

## Assumptions

- Candidate requires sponsorship or work authorization support per `config/profile.yml`.
- Cached enrichment's `sponsorship_supported` and `H1B Sponsor Likely` signals are useful but not definitive; the candidate should verify sponsorship before applying.
- No active security clearance requirement appears in the JD.
- The role is best framed as AI Platform / LLMOps Engineer because it buys ML pipelines, model evaluation, onboard inference infrastructure, Linux performance, and workflow reliability.

## Implementation Steps

1. Read required local sources.
   Verify: `cv.md`, `article-digest.md`, profile, JD cache, tracker, states, and scan history were inspected.
2. Complete A-G analysis.
   Verify: report includes all required sections, score table, legitimacy assessment, and keywords.
3. Write tracker-addition TSV.
   Verify: one line, nine tab-separated columns, next number from `data/applications.md`, canonical status.
4. Run targeted checks.
   Verify: files exist, protected files unchanged, report contains required headings, tracker has nine columns.

## Verification Approach

- Use shell checks for report existence and required headings.
- Use an `awk` field-count check for the tracker TSV.
- Use `git diff -- cv.md i18n.ts` to ensure protected files were not modified.

## Progress Log

- 2026-04-22: Read `CLAUDE.md`, `cv.md`, `article-digest.md`, `config/profile.yml`, JD cache, tracker tail, states, and scan-history matches.
- 2026-04-22: Confirmed update checker result `offline`; no update action needed.
- 2026-04-22: Retrieved the full posting text from the Index Ventures mirror because the cached JD was only a short excerpt.

## Key Decisions

- Do not generate PDF; explicit confirmation is absent.
- Use `High Confidence` legitimacy because the JD is specific, internally consistent, salary-transparent, and recently published on an investor job board, while still marking original-page freshness as unverified in batch mode.
- Score below 4.5, so omit draft application answers.

## Risks and Blockers

- Original Aurora page apply-button state was not verified in batch mode.
- PyTorch/TensorFlow, CUDA/Nsight, and direct autonomous-driving ML training experience are gaps.
- Sponsorship should be confirmed before application despite positive cached signals.

## Final Outcome

Report `reports/299-aurora-2026-04-22.md` was generated with score `3.95/5`,
merged into the tracker as row 68, and no PDF was generated.
