# Notion Software Engineer, New Grad (AI) Evaluation

## Background
The bridge provided a cached Ashby JD for Notion's `Software Engineer, New Grad (AI)` role. This run needs a durable repo artifact: a full evaluation report, a tracker line, and a final JSON summary. PDF generation is explicitly not confirmed, so it must stay skipped.

## Goal
Produce a complete A-G evaluation grounded in `cv.md`, `article-digest.md`, and the local JD cache, then save it under `reports/` and add the tracker TSV line.

## Scope
- Read the local JD cache and candidate source files
- Classify the role archetype and score the fit
- Write `reports/421-notion-2026-04-27.md`
- Write the tracker addition TSV line under `batch/tracker-additions/`
- Do not edit `cv.md`, `i18n.ts`, or generate a PDF

## Assumptions
- The local JD cache is the source of truth for this run.
- `llms.txt` is absent in this checkout.
- Sponsorship is not explicitly confirmed, so it is a risk note rather than a blocker.
- The candidate profile in `config/profile.yml` is the durable source for name/location/targeting.

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
- 2026-04-27: Started the Notion New Grad (AI) evaluation run.
- 2026-04-27: Read the local JD cache, `cv.md`, `article-digest.md`, `config/profile.yml`, and tracker state.
- 2026-04-27: Established the fit as an AI Platform / LLMOps Engineer with a secondary Agentic Workflows / Automation overlap.
- 2026-04-27: Wrote the report markdown, tracker addition, and this execution plan. PDF generation was intentionally skipped.

## Key Decisions
- Treat sponsorship as a clarification risk, not a blocker, because the JD does not explicitly reject sponsorship.
- Use `High Confidence` legitimacy because the JD is structured, specific, and transparent, while freshness remains unverified in batch mode.
- Keep the report in English because the JD is in English.

## Risks and Blockers
- The role is on-site in San Francisco, so relocation may be required.
- Go is only an implicit skill match from the JD, while the candidate evidence is stronger in TypeScript, Java, Python, and systems work.
- Batch mode cannot verify freshness or apply-button state.

## Final Outcome
The Notion New Grad (AI) evaluation is recorded in repo artifacts:

- report: `reports/421-notion-2026-04-27.md`
- tracker addition: `batch/tracker-additions/384.tsv`
- PDF: not generated
