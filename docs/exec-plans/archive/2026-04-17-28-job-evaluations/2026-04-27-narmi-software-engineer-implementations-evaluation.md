# Narmi Software Engineer I - Implementations Evaluation

## Background
The bridge batch worker received a Built In posting for Narmi's `Software Engineer I - Implementations` role. The run must produce a durable repo artifact: a full A-G evaluation report and a tracker TSV line. PDF generation is not explicitly confirmed, so it must remain skipped.

## Goal
Produce a complete evaluation grounded in `cv.md`, `article-digest.md`, and the local JD cache, then save it under `reports/` and add the tracker addition TSV line.

## Scope
- Read the local JD cache and candidate source files
- Classify the role archetype and score the fit
- Write `reports/446-narmi-2026-04-27.md`
- Write the tracker addition TSV line under `batch/tracker-additions/`
- Do not edit `cv.md`, `i18n.ts`, or generate a PDF

## Assumptions
- The cached JD file is the source of truth for this run, with the Built In page used only to fill missing details
- `llms.txt` is absent in this checkout
- The posting's explicit U.S. work authorization requirement is a hard blocker for this profile
- The candidate profile in `config/profile.yml` is the durable source for name, location, and contact details

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
- 2026-04-27: Started the Narmi Software Engineer I - Implementations evaluation run.
- 2026-04-27: Read the local JD cache, Built In page, `cv.md`, `article-digest.md`, `config/profile.yml`, and tracker state.
- 2026-04-27: Established the fit as an AI Forward Deployed Engineer / AI Solutions Architect hybrid with a hard sponsorship blocker.
- 2026-04-27: Wrote this execution plan and began drafting the report and tracker artifacts. PDF generation is intentionally skipped.

## Key Decisions
- Treat the explicit authorization requirement as a hard blocker in Block B and the final recommendation.
- Use `High Confidence` legitimacy because the Built In page is specific, salary-transparent, and internally consistent.
- Keep the report in English because the JD is in English.

## Risks and Blockers
- The role is NYC-based and hybrid, so relocation may be required.
- The posting requires U.S. work authorization, which blocks this candidate under the current profile.
- Batch mode cannot verify exact live freshness or apply-button state.

## Final Outcome
Pending. The report, tracker line, and final JSON still need to be written.
