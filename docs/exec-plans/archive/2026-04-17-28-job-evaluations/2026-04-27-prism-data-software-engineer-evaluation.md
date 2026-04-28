# Prism Data Software Engineer Evaluation

## Background
The bridge batch worker received a cached JD for Prism Data's Software Engineer role. The run must produce a durable repo artifact: a full A-G evaluation report and a tracker TSV line. PDF generation is explicitly not confirmed, so it must remain skipped.

## Goal
Produce a complete evaluation grounded in `cv.md`, `article-digest.md`, and the local JD cache, then save it under `reports/` and add the tracker addition TSV line.

## Scope
- Read the local JD cache and candidate source files
- Classify the role archetype and score the fit
- Write `reports/431-prism-data-2026-04-27.md`
- Write the tracker addition TSV line under `batch/tracker-additions/`
- Do not edit `cv.md`, `i18n.ts`, or generate a PDF

## Assumptions
- The cached JD is the source of truth for this run.
- `llms.txt` is absent in this checkout.
- Sponsorship is not explicitly blocked by the JD, so it is a risk note rather than a hard blocker.
- The candidate profile in `config/profile.yml` is the durable source for name, location, and contact details.

## Implementation Steps
1. Read the JD cache, candidate sources, and tracker state.
   Verify: relevant fields and line references are identified.
2. Draft the full A-G evaluation with exact evidence from `cv.md` and `article-digest.md`.
   Verify: every required section is present and internally consistent.
3. Write the report markdown and tracker TSV line.
   Verify: both files exist at the requested paths with the expected content.
4. Skip PDF generation because there is no explicit confirmation.
   Verify: PDF remains null/❌ in the artifacts and final JSON.

## Verification Approach
- Check that the report file exists and contains the requested sections.
- Check that the tracker line uses the next sequential tracker number.
- Confirm the final JSON fields match the actual files written.

## Progress Log
- 2026-04-27: Started the Prism Data Software Engineer evaluation run.
- 2026-04-27: Read the local JD cache, `cv.md`, `article-digest.md`, `config/profile.yml`, and tracker state.
- 2026-04-27: Established the fit as an AI Platform / LLMOps Engineer with a secondary AI Solutions Architect overlap.
- 2026-04-27: Wrote this execution plan and began drafting the report and tracker artifacts. PDF generation is intentionally skipped.

## Key Decisions
- Treat sponsorship as a clarification risk, not a blocker, because the JD does not explicitly reject sponsorship.
- Use `High Confidence` legitimacy because the JD is structured, specific, and transparent, while freshness remains unverified in batch mode.
- Keep the report in English because the JD is in English.

## Risks and Blockers
- The role is NYC / San Diego based, so relocation may be required.
- The role title in the cached metadata is noisy, so the report should use the plain Software Engineer title from the JD excerpt.
- Batch mode cannot verify freshness or apply-button state.

## Final Outcome
Pending. The report, tracker line, and final JSON still need to be written.
