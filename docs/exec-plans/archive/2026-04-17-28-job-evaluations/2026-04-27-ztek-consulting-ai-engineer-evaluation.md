# Ztek Consulting AI Engineer Evaluation

## Background

The bridge batch worker received a local JD cache for Ztek Consulting's `AI
engineer` role in Dallas, TX. The task is to produce the full A-G evaluation
report, a tracker TSV addition, and a final JSON payload. PDF generation is
not confirmed for this run.

## Goal

Create durable repository artifacts for this posting:

- save the markdown evaluation under `reports/`
- write the tracker addition under `batch/tracker-additions/`
- skip PDF generation because the run does not confirm it
- finish with a valid JSON summary for the bridge orchestrator

## Scope

- Read the local JD cache, `cv.md`, `article-digest.md`, and tracker state
- Assess the role across the requested A-G framework
- Create the report and tracker TSV row
- Do not edit `cv.md`, `i18n.ts`, or `data/applications.md`

## Assumptions

- The local JD file is the source of truth for this run.
- The cached JD is intentionally short, so role-level inference is required
  from the local metadata and repository proof points.
- Sponsorship is not explicitly confirmed in the JD, so it is a risk note
  rather than a blocker.
- The candidate's real profile is stored in `config/profile.yml` and is used
  only for framing.

## Implementation Steps

1. Read the JD cache, CV, article digest, and scan history.
   Verify: role metadata, proof points, and tracker max number are identified.
2. Draft the evaluation with exact evidence from `cv.md`, `article-digest.md`,
   and `config/profile.yml`.
   Verify: report includes all requested sections and line references.
3. Write the report and tracker TSV.
   Verify: files exist at the requested paths with the expected content.
4. Skip PDF generation unless explicitly confirmed.
   Verify: `pdf` remains null/`❌` in the artifacts and summary.

## Verification Approach

- Check that the report file exists and is populated.
- Check that the tracker addition line uses the next sequential number.
- Confirm the final JSON payload references the written files.

## Progress Log

- 2026-04-27: Started the Ztek Consulting AI Engineer evaluation run.
- 2026-04-27: Read the local JD cache, `cv.md`, `article-digest.md`,
  `config/profile.yml`, and the current tracker state. No `llms.txt` file
  exists in this checkout.

## Key Decisions

- Treat the role as an `AI Platform / LLMOps Engineer` adjacent fit with a
  secondary `AI Forward Deployed Engineer` overlap because the available JD
  signal is thin but clearly AI-engineering oriented.
- Use `Proceed with Caution` for legitimacy because posting freshness is
  unverified in batch mode.
- Do not generate a PDF without explicit confirmation.

## Risks and Blockers

- The JD cache is short and does not expose the full posting description.
- The role is staffing-branded and on-site in Dallas, so exact client scope is
  unclear.
- The `Go` skill tag is present in the local metadata, but the candidate's CV
  does not show Go explicitly.

## Final Outcome

Pending. The report, tracker line, and final JSON still need to be written.
