# Bold Penguin Data Engineer Batch Evaluation

**Date**: 2026-05-02
**Status**: in progress
**Owner**: Codex

## Background

The batch worker received a Bold Penguin `Data Engineer` posting from the bridge
pipeline and must produce the repository-backed evaluation report plus tracker
TSV. The repo is the system of record, so the evaluation must be written to
`reports/` and `batch/tracker-additions/` before completion is claimed.

## Goal

Produce a complete A-G evaluation with a one-decimal score, a 9-column tracker
TSV, and a final JSON object for the bridge runner. No PDF unless explicitly
requested.

## Scope

In scope:
- Read `cv.md`, `article-digest.md`, `config/profile.yml`, `modes/_profile.md`,
  `modes/_shared.md`, and `modes/oferta.md`
- Research compensation with cited web sources
- Write the report markdown and tracker TSV

Out of scope:
- Editing `cv.md` or any file under `data/`
- PDF generation
- Any application submission flow

## Assumptions

- The JD file handed by the orchestrator is the source of truth for the role.
- The posting is active enough to evaluate from the bridge-provided text.
- The candidate is a likely fit but not a perfect literal match on years of
  experience, so the score will probably land in the good-fit band.

## Implementation Steps

1. Read the source files and extract exact line evidence.
   Verify: enough quotes and metrics are available for Blocks B, C, and E.
2. Research compensation and demand with cited sources.
   Verify: at least one source each for employer range, Levels.fyi, and
   Glassdoor.
3. Draft the report with Blocks A-G and keywords.
   Verify: header fields match the contract and the score/action band is
   internally consistent.
4. Write the tracker TSV.
   Verify: exactly nine tab-separated columns with the expected status and
   report link.
5. Return the final JSON object only.
   Verify: JSON includes report_path, tsv_path, score, status, legitimacy,
   pdf_path, tldr, and archetype.

## Verification Approach

- Compare report header against the required schema.
- Check the TSV column count and file path.
- Confirm the report score, status, and recommendation align.

## Progress Log

- 2026-05-02 — Plan created after reading the bridge prompt and repo policy.
- 2026-05-02 — Source files inspected; JD is Bold Penguin Data Engineer.

## Key Decisions

- Use the bridge-provided JD text instead of fetching the live page again.
- Treat the role as a good-fit application, not a skip.
- Keep the output minimal and repo-backed.

## Risks and Blockers

- Compensation research needs live web citations.
- MongoDB is a real gap relative to the JD and must be handled honestly.

## Final Outcome

Pending.
