# Toast Frontend Software Engineer I - Retail Experience Evaluation

## Background
This bridge run needs a durable repo artifact for Toast's `Frontend Software Engineer I - Retail Experience` role. The local JD cache is short, so the evaluation must lean on the Built In posting, `cv.md`, `article-digest.md`, and the current scan history.

## Goal
Produce a complete A-G evaluation report in `reports/458-toast-2026-04-27.md`, add the tracker TSV line under `batch/tracker-additions/`, and finish with a valid JSON summary. PDF generation is explicitly skipped.

## Scope
- Read the local JD cache and, if needed, the Built In posting for missing details.
- Ground the evaluation in `cv.md`, `article-digest.md`, `config/profile.yml`, and scan history.
- Write the report markdown and tracker TSV addition.
- Do not edit `cv.md`, `article-digest.md`, `config/profile.yml`, `data/applications.md`, or generate a PDF.

## Assumptions
- The role is a junior frontend product-engineering role at Toast with a retail-experience focus.
- The JD does not explicitly block sponsorship, but Dublin hybrid location is a practical risk for the candidate.
- PDF generation remains disabled because the run does not include explicit confirmation.

## Implementation Steps
1. Inspect the JD, CV, article digest, profile, and scan history.
   Verify: role metadata, evidence lines, and prior appearance signals are identified.
2. Draft the A-G evaluation with exact evidence references from the local sources.
   Verify: every required section is present and the score is internally consistent.
3. Write the report markdown and tracker TSV addition.
   Verify: both files exist at the requested paths and match the bridge schema.
4. Skip PDF generation.
   Verify: the report and JSON reflect `pdf: null` / `❌`.

## Verification Approach
- Check the report file for all required sections and the correct score/legitimacy tier.
- Check the tracker TSV for the next sequential tracker number and the expected 9 columns.
- Confirm the final JSON fields match the actual artifacts written to disk.

## Progress Log
- 2026-04-27: Started the Toast frontend evaluation run and read the bridge JD cache, `config/profile.yml`, `cv.md`, `article-digest.md`, and `data/scan-history.tsv`.
- 2026-04-27: Confirmed the posting is a junior hybrid frontend role in Dublin with React/TypeScript requirements and no salary band in the available page text.

## Key Decisions
- Treat the posting as a frontend product-engineering role rather than forcing it into an AI-first story.
- Use scan history as a reposting signal, but keep freshness marked unverified in batch mode.
- Keep PDF generation out of scope for this run.

## Risks and Blockers
- Dublin hybrid location may require relocation and work authorization that are not explicit in the JD.
- Salary transparency is low, so comp scoring must stay conservative.
- Batch mode cannot verify exact posting freshness or apply-button state.

## Final Outcome
Pending completion of the report, tracker TSV, and final JSON.
