# 2026-04-26 Jobs via Dice batch evaluation

## Background
Batch worker run for report `397` against a Jobs via Dice posting titled "Startup-Full Stack AI Engineer-Build AI Glasses and More!".

## Goal
Produce a complete markdown evaluation report, append the tracker addition line, and return a valid JSON summary. Do not generate a PDF in this run.

## Scope
- Read the local JD bridge file and the repository source-of-truth files.
- Write `reports/397-jobs-via-dice-2026-04-26.md`.
- Write `batch/tracker-additions/-aXFYAu3ZAvrC0WLz1xdH.tsv`.
- Return final JSON with the required fields.

## Assumptions
- The local JD bridge file is authoritative and sufficient for evaluation.
- No explicit PDF confirmation was provided, so PDF generation is skipped.
- Sponsorship is unknown in the JD and therefore is a risk, not a hard blocker.

## Implementation steps
1. Read `cv.md`, `article-digest.md`, and the JD bridge file.
2. Extract line-accurate CV citations and the candidate proof points needed for the report.
3. Draft the A-G evaluation with score, legitimacy, ATS keywords, and no PDF section.
4. Write the report file.
5. Compute the next tracker number from `data/applications.md` and write the TSV line.
6. Verify both files exist and the JSON payload is consistent with the written artifacts.

## Verification approach
- Check the report path exists and contains the requested sections.
- Check the tracker addition file exists and has exactly one TSV line.
- Confirm the final JSON references the same report path and `pdf: null`.

## Progress log
- 2026-04-26: Started the run, confirmed offline update status, read the main repo instructions, profile, CV, article digest, states, scan history, and JD bridge file.

## Key decisions
- Use the bridge JD file as the primary source.
- Treat sponsorship as uncertain, not blocking.
- Skip PDF generation because the run did not explicitly confirm it.

## Risks and blockers
- The JD is untrusted external content and may contain marketing noise.
- The role title is broad; archetype selection requires judgment from the provided text only.

## Final outcome
- Pending.
