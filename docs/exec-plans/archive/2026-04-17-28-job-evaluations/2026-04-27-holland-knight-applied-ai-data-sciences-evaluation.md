# Holland & Knight Applied AI and Data Sciences Engineer Evaluation

## Background

The bridge supplied a local JD cache for Holland & Knight's `Applied AI and
Data Sciences Engineer` role. The task is to produce the full A-G evaluation
report, a tracker TSV addition, and a final JSON payload without generating a
PDF unless explicitly confirmed.

## Goal

Create durable repository artifacts for this posting:

- save the markdown evaluation under `reports/`
- write the tracker addition under `batch/tracker-additions/`
- keep PDF generation skipped because this run does not confirm it
- finish with a valid JSON summary for the bridge orchestrator

## Scope

- Read the local JD cache, `cv.md`, and `article-digest.md`
- Assess the role across the requested A-G framework
- Create the report and tracker TSV line
- Do not edit `cv.md`, `i18n.ts`, or `data/applications.md`

## Assumptions

- The local JD file is the source of truth for this run.
- `llms.txt` is absent in this checkout, so there is no additional local
  instruction file to read.
- Sponsorship is not confirmed in the JD text, so it is a risk note rather than
  a hard blocker.
- The candidate's real profile is stored in `config/profile.yml` and is used
  only for framing, not as a writable source.

## Implementation Steps

1. Read the JD cache, candidate sources, and tracker state.
   Verify: file contents and max tracker number are identified.
2. Draft the evaluation with exact evidence from `cv.md` and `article-digest.md`.
   Verify: report includes all requested sections and line references.
3. Write the report and tracker TSV.
   Verify: files exist at the requested paths with the expected content.
4. Skip PDF generation unless explicitly confirmed.
   Verify: `pdf` remains null/`❌` in the artifacts and summary.

## Verification Approach

- Check that the report file exists and is populated.
- Check that the tracker addition line uses the next sequential number.
- Confirm the JSON summary fields match the run's actual outputs.

## Progress Log

- 2026-04-27: Started the Holland & Knight Applied AI and Data Sciences
  Engineer evaluation run.
- 2026-04-27: Read the local JD cache, `cv.md`, `article-digest.md`, and the
  current tracker state. No `llms.txt` file exists in this checkout.

## Key Decisions

- Treat the role as an `AI Solutions Architect` fit with a secondary
  `AI Platform / LLMOps Engineer` overlap.
- Use `Proceed with Caution` for legitimacy because posting freshness is
  unverified in batch mode.
- Do not generate a PDF without explicit confirmation.

## Risks and Blockers

- Sponsorship is not explicitly confirmed in the JD, so this remains a risk
  note rather than a blocker.
- Batch mode cannot verify posting freshness or apply-button state.
- The legal-firm operating context may require framing the candidate's
  products as internal enterprise enablement rather than consumer-facing AI.

## Final Outcome

Pending. The report, tracker line, and final JSON still need to be written.
