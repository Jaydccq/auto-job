# BillGO AI Engineer I Evaluation

## Background

The bridge batch worker received a cached JD for BillGO AI Engineer I from a
Paycom posting. PDF generation is explicitly disabled for this run.

## Goal

Generate report 311 and a tracker-addition TSV row for the cached BillGO AI
Engineer I posting.

## Scope

- Read the cached JD plus required local sources: `cv.md`, `article-digest.md`,
  optional `llms.txt`, profile, tracker, and scan-history files.
- Produce `reports/311-billgo-2026-04-22.md`.
- Produce `batch/tracker-additions/vNqfXOq7CZMBP2fUnPkHo.tsv`.
- Do not generate a PDF and do not edit `cv.md`, `i18n.ts`, or
  `data/applications.md`.

## Assumptions

- The cached JD is sufficient because it includes company, role, location,
  work model, seniority, requirements, responsibilities, and sponsorship signal.
- `llms.txt` is optional and absent in this checkout.
- The salary field in the cached JD is not real compensation data.
- The cached "H1B Sponsor Likely" tag is a positive signal but not official
  employer language, so sponsorship must still be confirmed before applying.

## Implementation Steps

1. Read the cached JD and local candidate sources.
   Verify: line-numbered evidence is available for report citations.
2. Draft the A-G evaluation and omit H unless score reaches 4.5.
   Verify: report contains all requested sections and ATS keywords.
3. Write the tracker-addition TSV with max existing application number + 1.
   Verify: one tab-separated line with nine fields.
4. Run targeted file checks.
   Verify: report exists, tracker line has nine columns, and PDF remains absent.

## Verification Approach

- Shell checks for file existence.
- TSV column count check.
- Content checks for required report metadata and no generated PDF path.

## Progress Log

- 2026-04-22: Read `CLAUDE.md`, cached JD, `cv.md`,
  `article-digest.md`, `config/profile.yml`, tracker, scan history, and prior
  evaluation patterns.
- 2026-04-22: Confirmed `llms.txt` is absent, the cached JD has no YAML
  frontmatter, and PDF generation is not confirmed.
- 2026-04-22: Determined max existing application number is 304, so the tracker
  addition uses 305.

## Key Decisions

- Classify the role as AI Platform / LLMOps Engineer plus Agentic Workflows /
  Automation because the JD asks for LLMs, agentic AI, prompt engineering,
  custom AI tools, REST APIs, microservices, cloud, databases, and CI/CD.
- Treat the role as a strong apply-after-confirmation target: level, AI systems,
  backend, and fintech fit are strong; compensation, official sponsorship, MCP,
  and Fort Collins hybrid logistics need confirmation.
- Do not generate H draft answers because the global score remains below 4.5.

## Risks and Blockers

- Batch mode cannot verify the live apply-button state or exact posting
  freshness.
- No real salary range is available from the cached JD.
- The exact Paycom URL was not found in `data/scan-history.tsv`, so reposting
  history is unavailable from local history.

## Final Outcome

Report and tracker addition generated; PDF intentionally not generated.
