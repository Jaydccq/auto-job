# Active Clearance Blacklist Backfill

## Background

`data/scan-history.tsv` records scanner rows and terminal statuses. Rows marked
`active_clearance_required` should not keep resurfacing when the same companies
consistently require an active clearance.

## Goal

Backfill the user's scanner hard-filter company list from scan-history rows with
status `active_clearance_required`, then ensure all scan entry points skip those
companies before they enter the pipeline.

## Scope

- Read `data/scan-history.tsv`.
- Add missing companies to
  `config/profile.yml -> newgrad_scan -> hard_filters -> active_security_clearance_companies`.
- Make the legacy `scan.mjs` path honor the same active-clearance company
  blacklist used by browser-backed scans.
- Do not modify scan history, pipeline, tracker, or auto-maintained company
  memory beyond the profile backfill.

## Assumptions

- "My blacklist" means the user-owned hard filter in `config/profile.yml`, not
  `data/newgrad-company-memory.yml`.
- Rows with status `active_clearance_required` are sufficient local evidence for
  this manual backfill.
- Existing company names should be preserved as written in scan history.

## Implementation Steps

1. Parse scan history for `active_clearance_required` rows.
   Verify: produce the unique company set and compare with the current profile
   list.
2. Append missing companies to `active_security_clearance_companies`.
   Verify: preserve existing entries and add only missing companies.
3. Re-run the comparison.
   Verify: zero scan-history active-clearance companies are missing from the
   profile list.
4. Inspect all scan entry points for active-clearance company filtering.
   Verify: browser-backed scans already route through `scoreAndFilter`, and any
   missing legacy path is identified.
5. Patch the missing path.
   Verify: `npm run scan` / legacy Built In rows cannot enqueue companies on the
   active-clearance blacklist.

## Verification Approach

Use a local Node read-only check to parse `data/scan-history.tsv` and
`config/profile.yml`, then assert no `active_clearance_required` history company
is missing from `active_security_clearance_companies`.

Use syntax checks and focused local probes for scan filtering. Prefer no-network
verification so the check is deterministic and does not mutate user data.

## Progress Log

- 2026-04-24: Found 26 unique active-clearance companies in scan history and 16
  missing from the profile hard-filter list.
- 2026-04-24: Appended the 16 missing companies to `config/profile.yml`.
- 2026-04-24: Verification found 26 active-clearance history companies and
  `missingCount: 0` against the profile hard-filter list.
- 2026-04-24: Follow-up request: enforce direct skip behavior across all scan
  paths. Found browser-backed scans already use `scoreAndFilter`; legacy
  `scan.mjs` still needed profile/memory company filtering.
- 2026-04-24: Updated `scan.mjs` so legacy API company targets and Built In
  legacy search results skip active-clearance companies before pipeline writes.
- 2026-04-24: Updated `modes/scan.md` to document the profile hard-filter
  behavior for `/career-ops scan`.
- 2026-04-24: Verification passed:
  `node --check scan.mjs`,
  a no-network import probe for `loadActiveClearanceCompanySkips`,
  `npm run scan -- --dry-run --no-builtin --company __no_such_company__`,
  `npm --prefix bridge run test -- src/adapters/newgrad-scorer.test.ts`, and
  `git diff --check`.

## Key Decisions

- Keep the auto-maintained memory file unchanged because this is a user-requested
  manual blacklist backfill.
- Did not reorder the existing profile list to avoid unrelated churn.
- Reuse `config/profile.yml` and `data/newgrad-company-memory.yml` as the source
  of active-clearance company skips for legacy scans, matching
  `loadNewGradScanConfig` behavior.

## Risks and Blockers

- Some company names are broad or abbreviated, such as `AV`; the request asked
  for all active-clearance scan-history companies, so they were included.

## Final Outcome

Completed. All scan-history companies with status `active_clearance_required`
are present in
`config/profile.yml -> newgrad_scan -> hard_filters -> active_security_clearance_companies`.
Browser-backed scans already skip them through `scoreAndFilter`; legacy
`scan.mjs` now skips them for both API company targets and Built In legacy
results before anything is written to `pipeline.md`.
