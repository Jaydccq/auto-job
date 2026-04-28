# Truist Data Scientist I Evaluation

## Background
Batch worker run for Truist's `Data Scientist I` role. The JD cache already includes the company, title, location, salary, and role summary, so the task is to produce a repo-backed A-G evaluation report, a tracker TSV addition, and a final JSON summary. PDF generation is not explicitly confirmed, so it stays skipped.

## Goal
Create a complete evaluation grounded in `cv.md` and `article-digest.md`, write the report to `reports/429-truist-2026-04-27.md`, and add the tracker line to `batch/tracker-additions/9RXKUup8JVl0hXSn2KT07.tsv`.

## Scope
- Read the local JD cache, `cv.md`, `article-digest.md`, and tracker state.
- Classify the role archetype and score the fit.
- Write the report markdown and tracker TSV.
- Do not generate a PDF.

Out of scope:
- Editing `cv.md`, `config/profile.yml`, `article-digest.md`, or `data/applications.md`.
- External web lookup unless the local JD cache is insufficient.

## Assumptions
- The local JD cache is the source of truth for this run.
- `llms.txt` is absent in this checkout.
- Sponsorship is not explicitly blocked by the JD, so it is a risk note rather than a hard no.
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
- 2026-04-27: Started the Truist Data Scientist I evaluation run.
- 2026-04-27: Read the local JD cache, `cv.md`, `article-digest.md`, `config/profile.yml`, `data/scan-history.tsv`, and tracker state.
- 2026-04-27: Established the fit as an AI-adjacent data science role with strong statistics, Python, SQL, Spark, and ML overlap.
- 2026-04-27: Drafted the evaluation report plan; PDF generation will be skipped.

## Key Decisions
- Treat sponsorship as a clarification risk, not a blocker, because the JD does not explicitly reject sponsorship.
- Use `High Confidence` legitimacy because the JD is structured, specific, and transparent, while freshness remains unverified in batch mode.
- Keep the report in English because the JD is in English.

## Risks and Blockers
- The role is on-site in Atlanta, so relocation may be required.
- The JD does not explicitly confirm sponsorship.
- Batch mode cannot verify freshness or apply-button state.

## Final Outcome
Pending.
