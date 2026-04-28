# Uber Graduate 2026 iOS Evaluation

## Background

This run evaluates the Uber Graduate 2026 Software Engineer I, Mobile (iOS)
posting using the local bridge JD cache plus the repository's canonical
candidate materials. The deliverables are a full report markdown file and a
tracker line. PDF generation is out of scope unless explicitly confirmed, and
this run says it is not confirmed.

## Goal

Produce `reports/383-uber-2026-04-25.md` with a complete A-G evaluation, write
a matching tracker TSV row, and finish with a valid JSON summary.

## Scope

- Read the cached JD text from the bridge file.
- Read `cv.md`, `article-digest.md`, `config/profile.yml`, and `data/scan-history.tsv`.
- Evaluate the role across blocks A-G and H if the score reaches the threshold.
- Write the report markdown under `reports/`.
- Write the tracker addition under `batch/tracker-additions/`.
- Skip PDF generation.

## Assumptions

- The bridge JD file is complete enough to evaluate without web fallback.
- No frontmatter YAML is present in the JD file.
- Sponsorship is a risk-check item, not a blocker, because the JD signals H1B
  support likely.
- The candidate's iOS project and related product/analytics work are the main
  proof points for this role.
- The run should stay read-only with respect to source files such as `cv.md`.

## Implementation steps

1. Extract JD metadata and line references from the cached file.
   Verify: role/company/location/salary and requirement lines are captured.
2. Pull exact proof points from `cv.md` and `article-digest.md`.
   Verify: cited lines cover iOS, Swift, MapKit, consumer-facing shipping, and
   product analytics.
3. Draft the report with the required sections and score.
   Verify: report file exists and matches the requested structure.
4. Compute the next tracker number and write the TSV row.
   Verify: row is tab-separated, uses the canonical status, and points at the
   new report.
5. Run a final sanity check on the generated files.
   Verify: `git diff --check` passes and the JSON summary is valid.

## Verification approach

- `git diff --check`
- `sed -n` / `rg` spot checks for report contents
- tracker row format inspection

## Progress log

- 2026-04-25: Created plan. Goal is a full Uber iOS evaluation report plus a
  tracker row, with PDF explicitly skipped for this bridge run.

## Key decisions

- Use the cached JD file as the source of truth and do not fetch the live URL.
- Treat sponsorship as supported-likely, not a hard blocker.
- Include draft application answers if the final score clears the threshold.

## Risks and blockers

- The report can overstate iOS framework depth if it leans too hard on adjacent
  product evidence; the writeup needs to stay precise about what is proven.
- Batch-mode posting freshness is unverified, so legitimacy should avoid claims
  about the live apply button or exact age of the posting.

## Final outcome

Pending.
