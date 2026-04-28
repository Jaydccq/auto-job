# Mirage Software Engineer, Early Career Evaluation

## Background

The bridge provided a single Ashby posting and a local JD cache file for
Mirage's `Software Engineer, Early Career` role. The goal is to produce the
full evaluation report, tracker line, and final JSON payload without generating
an ATS PDF unless explicitly confirmed.

## Goal

Create a durable repository artifact for this Mirage posting:

- save the full markdown evaluation under `reports/`
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
- Sponsorship is unknown from the JD text, so it is a risk note rather than a
  hard blocker.
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

- 2026-04-27: Started the Mirage early-career evaluation run.
- 2026-04-27: Read the local JD cache, `cv.md`, `article-digest.md`, and the
  current tracker state. No `llms.txt` file exists in this checkout.
- 2026-04-27: Identified the strongest proof points for Mirage as the
  autonomous investment RAG platform, the distributed Mini-UPS system, and
  the Battleship evaluation harness.
- 2026-04-27: Wrote the report markdown and tracker addition. PDF generation
  was intentionally skipped because the run did not confirm it.

## Key Decisions

- Use `Proceed with Caution` for legitimacy because posting freshness is
  unverified in batch mode.
- Treat the role as an `AI Platform / LLMOps Engineer` fit with a secondary
  `Agentic Workflows / Automation` overlap.
- Do not generate a PDF without explicit confirmation.

## Risks and Blockers

- Go is a stated skill tag in the JD, but the candidate evidence in the repo is
  stronger on TypeScript, Java, Python, and systems work than on Go.
- Sponsorship is not explicitly confirmed in the JD, so this stays a risk note
  rather than a blocker.
- Batch mode cannot verify posting freshness or application-button state.

## Final Outcome

The Mirage early-career evaluation is recorded in repo artifacts:

- report: `reports/417-mirage-2026-04-27.md`
- tracker addition: `batch/tracker-additions/-rHWhfCINMiD7vIH20hS3.tsv`
- PDF: not generated

