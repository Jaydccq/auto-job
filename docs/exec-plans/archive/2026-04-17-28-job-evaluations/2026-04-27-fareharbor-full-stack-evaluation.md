# FareHarbor Full Stack Engineer Evaluation

## Background
The bridge run provided a Built In job page for FareHarbor's `Full Stack Engineer - Python & JavaScript` role plus a local JD cache stub. The task is to produce a durable repo artifact: a complete evaluation report, a tracker TSV line, and a final JSON summary. PDF generation is not explicitly confirmed, so it must remain skipped.

## Goal
Produce a complete A-G evaluation grounded in `cv.md`, `article-digest.md`, `config/profile.yml`, the fetched Built In JD, and the local tracker state, then save the report under `reports/` and the tracker addition under `batch/tracker-additions/`.

## Scope
- Read the local candidate sources and the FareHarbor JD
- Classify the role archetype and score the fit
- Write `reports/460-fareharbor-2026-04-27.md`
- Write the tracker addition TSV line under `batch/tracker-additions/`
- Do not edit `cv.md`, `i18n.ts`, or generate a PDF

## Assumptions
- The Built In page is the authoritative JD source for this run because the cache file is only a stub.
- Sponsorship is a hard blocker because the JD requires U.S. work authorization and the candidate profile indicates sponsorship support is needed.
- The report should stay in English because the JD is in English.
- `llms.txt` is absent in this checkout.

## Implementation Steps
1. Read the JD, candidate sources, and tracker state.
   Verify: the key role requirements, proof points, and tracker sequence are identified.
2. Draft the full A-G evaluation with exact evidence from `cv.md` and `article-digest.md`.
   Verify: all required sections are present and internally consistent.
3. Write the report markdown and tracker TSV line.
   Verify: both files exist at the requested paths with the expected content.
4. Skip PDF generation because there is no explicit confirmation.
   Verify: PDF remains null/❌ in the artifacts and final JSON.

## Verification Approach
- Check that the report file exists and contains the requested sections.
- Check that the tracker line uses the next sequential tracker number relative to `data/applications.md`.
- Confirm the final JSON fields match the actual files written.

## Progress Log
- 2026-04-27: Started the FareHarbor evaluation run.
- 2026-04-27: Read `cv.md`, `article-digest.md`, `config/profile.yml`, the Built In JD, and tracker state.
- 2026-04-27: Established the role as a Full-Stack / product-oriented backend-heavy fit with a hard U.S. authorization blocker.
- 2026-04-27: Drafted this execution plan before writing repo artifacts.

## Key Decisions
- Use the Built In page as the JD source because the local cache file did not include the full description.
- Treat the U.S. work authorization requirement as a hard blocker for this candidate.
- Skip PDF generation because the run does not include explicit confirmation.

## Risks and Blockers
- The job is hybrid in Denver, so relocation or in-office presence may be needed.
- The role asks for AngularJS and Django; the candidate evidence is stronger in TypeScript, React, Node, Python, and systems work.
- Batch mode cannot directly verify apply-button behavior or exact freshness beyond the Built In page text.

## Final Outcome
The FareHarbor evaluation will be recorded in repo artifacts:

- report: `reports/460-fareharbor-2026-04-27.md`
- tracker addition: `batch/tracker-additions/Ov0JAqFA5UhuTX9PSly9V.tsv`
- PDF: not generated
