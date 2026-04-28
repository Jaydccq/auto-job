# Benchling Software Engineer, New Grad Evaluation

## Background

The bridge worker needs a full job evaluation artifact for Benchling's
`Software Engineer, New Grad (2026)` Built In posting, plus a tracker TSV row.
The local JD cache is short, so the evaluation needs to combine the cached
title with the official Built In page summary and the repository's local CV and
proof-point files.

## Goal

Produce a complete report at `reports/450-benchling-2026-04-27.md`, write the
corresponding tracker addition TSV, and finish with a valid JSON summary.

## Scope

- Read the local JD cache, `cv.md`, and `article-digest.md`.
- Use the official Built In page summary only to fill missing role details.
- Build a report with sections A-G in the repo's evaluation format.
- Do not generate a PDF in this run.
- Add a single tracker row in `batch/tracker-additions/`.

## Assumptions

- The candidate profile in `config/profile.yml` is authoritative for name and
  work authorization context.
- Sponsorship is not explicitly confirmed by the JD, so it is a clarification
  risk rather than an automatic blocker.
- The local JD cache plus the Built In page summary are enough to evaluate the
  role without additional research.
- No application will be submitted.

## Implementation Steps

1. Read the source files and extract the role details.
   Verify: role/company/title, salary, location, and work model are identified.
2. Draft the full report in the repo's report format.
   Verify: sections A-G are present and match the requested scope.
3. Write the tracker addition TSV.
   Verify: row uses the next sequential tracker number and the canonical status.
4. Run focused verification.
   Verify: files exist, TSV columns line up, and the worktree diff is clean.

## Verification Approach

- Confirm the new report file exists and contains the expected heading.
- Confirm the tracker TSV has exactly one row with 9 tab-separated fields.
- Run `git diff --check`.

## Progress Log

- 2026-04-27: Started the evaluation task and read the local repo guidance.
- 2026-04-27: Confirmed the JD cache is short and retrieved the missing role
  details from the official Built In page summary.
- 2026-04-27: Extracted CV and proof-point lines for the role match, score
  framing, personalization plan, interview stories, and legitimacy notes.

## Key Decisions

- Treat Benchling as a real new-grad software role with strong product/platform
  overlap, not as a pure AI role.
- Do not generate a PDF unless the run explicitly confirms it.
- Keep sponsorship as a clarification risk because the JD text does not state a
  hard no.

## Risks and Blockers

- The local JD cache is sparse, so some role details depend on the Built In
  summary rather than a full captured page.
- Batch mode cannot directly verify live freshness or apply-button state.
- The role is biotech-adjacent, so domain ramp-up is a real but manageable gap.

## Final Outcome

Pending.
