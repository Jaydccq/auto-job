# Nextdoor MLE New Grad Evaluation

## Background

The bridge worker received a cached JD for Nextdoor's `Machine Learning Engineer - New Grad 2026` role. The run requires a full A-G evaluation report, a tracker-addition TSV line, no PDF unless explicitly confirmed, and a final machine-readable JSON response.

## Goal

Create a repository-backed evaluation for report `313` using only local source-of-truth files unless external lookup is required.

## Scope

- Read `cv.md`, `article-digest.md`, `config/profile.yml`, the cached JD file, tracker state, states, and scan history.
- Write `reports/313-nextdoor-2026-04-22.md`.
- Write `batch/tracker-additions/16MG-LZNPoSbPB-FF1r6N.tsv`.
- Do not generate a PDF because `PDF_CONFIRMED: no`.
- Do not edit `cv.md`, `i18n.ts`, or `data/applications.md`.

## Assumptions

- The cached JD is sufficient for evaluation even though it is short, because it includes company, role, location, work model, seniority, requirements, responsibilities, sponsorship signal, and local enrichment scores.
- `Salary: Turbo for Students: Get Hired Faster!` is not a usable compensation range.
- `Recommendation tags: H1B Sponsor Likely` and `sponsorship_supported` mitigate the candidate's work-authorization constraint, but exact sponsorship must still be verified before applying.
- The report language should be English because the JD is in English.
- Tracker `num` should be `307`, based on the current maximum existing tracker number of `306`.

## Implementation Steps

1. Read source-of-truth files and cached JD.
   Verify: relevant facts are available locally and no WebFetch/WebSearch is needed.
2. Draft the A-G evaluation with exact CV and article-digest line references.
   Verify: report includes required header, blocks A-G, keywords, and omits Block H because score is below 4.5.
3. Add the tracker TSV line.
   Verify: line has 9 tab-separated columns, status precedes score, and PDF column is `❌`.
4. Run targeted artifact checks.
   Verify: report file exists, tracker file exists, no PDF was generated, and expected strings are present.

## Verification Approach

- Use shell checks for required report sections.
- Use `awk` to validate tracker column count and next number.
- Confirm no matching `output/cv-candidate-nextdoor-2026-04-22.pdf` exists.
- Confirm final response uses the requested JSON schema.

## Progress Log

- 2026-04-22: Read `CLAUDE.md`, cached JD, `cv.md`, `article-digest.md`, `config/profile.yml`, `templates/states.yml`, `data/applications.md`, and `data/scan-history.tsv`.
- 2026-04-22: Confirmed `llms.txt` does not exist in this repository; continued with available mandatory sources.
- 2026-04-22: Confirmed update checker status is `offline`, so no update action is needed.

## Key Decisions

- No external search: the cached JD includes enough role, fit, location, and sponsorship context for this batch evaluation.
- No PDF: the prompt explicitly sets `PDF_CONFIRMED: no`.
- Use `AI Platform / LLMOps Engineer + Agentic Workflows / Automation` as the closest archetype pair because the JD is MLE/recommender-focused but asks for AI products, user-facing experiments, and emerging AI application.

## Risks and Blockers

- The JD is short and does not expose exact Greenhouse application freshness or apply-button state in batch mode.
- Compensation cannot be scored from an explicit salary range because the cached `Salary` field is not a salary.
- Direct recommender-system and knowledge-graph production experience is a gap; mitigated by RAG, retrieval, personalized matching, experimentation-style analytics, and ML/data pipeline proof points.

## Final Outcome

Pending.
