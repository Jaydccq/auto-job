# Total Quality Logistics Associate Data Scientist Evaluation

## Background
Batch worker run for Total Quality Logistics' `Associate Data Scientist` role. The local JD cache is present and contains the company, title, location, salary, seniority, and explicit sponsorship language. The task is to produce a repo-backed A-G evaluation report and a tracker TSV addition. PDF generation is not explicitly confirmed, so it stays skipped.

## Goal
Create a complete evaluation grounded in `cv.md`, `article-digest.md`, and the cached JD, then write the report to `reports/433-total-quality-logistics-2026-04-27.md` and the tracker addition to `batch/tracker-additions/uQ4HIHD4h1s9Rs6uPF3Bm.tsv`.

## Scope
- Read the local JD cache, `cv.md`, `article-digest.md`, `config/profile.yml`, and tracker state.
- Classify the role archetype and score the fit.
- Write the report markdown and tracker TSV.
- Do not generate a PDF.

Out of scope:
- Editing `cv.md`, `config/profile.yml`, `article-digest.md`, or `data/applications.md`.
- External web lookup unless the local JD cache is insufficient.

## Assumptions
- The local JD cache is the source of truth for this run.
- `llms.txt` is absent in this checkout.
- Sponsorship is a hard blocker because the JD explicitly says sponsorship is unavailable and the candidate profile requires sponsorship support.
- The candidate profile in `config/profile.yml` is the durable source for name, location, and visa state.

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
- 2026-04-27: Started the Total Quality Logistics Associate Data Scientist evaluation run.
- 2026-04-27: Read the local JD cache, `cv.md`, `article-digest.md`, `config/profile.yml`, `data/scan-history.tsv`, and tracker state.
- 2026-04-27: Established the fit as an AI-platform/data-science hybrid with strong Python, SQL, Spark, RAG, and ML-evaluation overlap, but an explicit sponsorship blocker.
- 2026-04-27: Drafted the evaluation report plan; PDF generation will be skipped.

## Key Decisions
- Treat sponsorship as a hard blocker, not a soft risk, because the JD explicitly rejects sponsorship and the profile requires it.
- Use `High Confidence` legitimacy because the JD is structured, specific, and transparent, while freshness remains unverified in batch mode.
- Keep the report in English because the JD is in English.

## Risks and Blockers
- The role is in Cincinnati and appears on-site, so relocation would likely be required.
- The JD explicitly says sponsorship is unavailable.
- Batch mode cannot verify freshness or apply-button state.

## Final Outcome
Pending.
