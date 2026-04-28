# HGA Jr Data Scientist Evaluation

## Background

Batch worker run for HGA's `Jr Data Scientist` role. The local JD cache is present and includes role, location, salary, and structured responsibilities. The task is to produce the full A-G evaluation report, add the tracker line, and finish with a valid JSON summary. PDF generation is not confirmed and must stay skipped.

## Goal

Create durable repository artifacts for this posting:

- save the markdown evaluation under `reports/`
- write the tracker addition under `batch/tracker-additions/`
- keep PDF generation skipped because this run does not confirm it
- finish with a valid JSON summary for the bridge orchestrator

## Scope

- Read the local JD cache, `cv.md`, `article-digest.md`, `config/profile.yml`, and tracker state
- Assess the role across the requested A-G framework
- Create the report and tracker TSV line
- Do not edit `cv.md`, `i18n.ts`, or `data/applications.md`

## Assumptions

- The local JD file is the source of truth for this run
- `llms.txt` is absent in this checkout
- Sponsorship is not explicitly blocked in the JD, so it is a risk note rather than a hard blocker
- The candidate profile in `config/profile.yml` is the durable source for name/location/targeting
- Tracker sequencing will follow the existing max row number in `data/applications.md`

## Implementation Steps

1. Read the JD cache, candidate sources, and tracker state.
   Verify: relevant fields and line references are identified.
2. Draft the full A-G evaluation with exact evidence from `cv.md` and `article-digest.md`.
   Verify: every required section is present and internally consistent.
3. Write the report markdown and tracker TSV line.
   Verify: both files exist at the requested paths with the expected content.
4. Skip PDF generation because there is no explicit confirmation.
   Verify: PDF remains null/`❌` in the artifacts and final JSON.

## Verification Approach

- Check that the report file exists and contains the requested sections
- Check that the tracker line uses the next sequential tracker number
- Confirm the final JSON fields match the actual files written

## Progress Log

- 2026-04-27: Started the HGA Jr Data Scientist evaluation run
- 2026-04-27: Read the local JD cache, `cv.md`, `article-digest.md`, `config/profile.yml`, `data/scan-history.tsv`, and tracker state
- 2026-04-27: Established the fit as a data/analytics-heavy AI platform adjacent role with strong Python, SQL, ETL, and ML overlap
- 2026-04-27: Drafted the evaluation report plan; PDF generation will be skipped

## Key Decisions

- Treat the role as an `AI Platform / LLMOps Engineer` primary fit with a secondary `AI Solutions Architect` overlap because the JD centers on pipelines, warehouse schemas, analytics, and AI tool integration
- Use `High Confidence` legitimacy because the JD is structured, specific, and transparent, while freshness remains unverified in batch mode
- Do not generate a PDF without explicit confirmation

## Risks and Blockers

- The role is in Minneapolis and may require relocation
- The JD does not explicitly confirm sponsorship
- Batch mode cannot verify posting freshness or apply-button state

## Final Outcome

Pending. The report, tracker line, and final JSON still need to be written.
