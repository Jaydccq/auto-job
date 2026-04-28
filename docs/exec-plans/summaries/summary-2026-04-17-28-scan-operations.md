# 2026-04-17 to 2026-04-28 Scan Operations Summary

**Status:** completed
**Scope Covered:** 26 completed scan, source-provider, dedupe, and policy plans moved out of `active/`

## Background

The repository had accumulated daily scan execution plans for NewGrad/JobRight,
LinkedIn, Built In, Indeed, hourly automation, source adapters, scan policy,
and sponsorship/clearance handling. These plans describe important operational
learning, but they no longer need to be top-level active execution context.

## Scope Covered

This summary covers scan-operation plans archived under:

- `docs/exec-plans/archive/2026-04-17-28-scan-operations/`

The archived plans include recent 24-hour scanning, JobRight adapter work,
LinkedIn/Built In/Indeed scanner runs, score-only validation, direct evaluation
defaults, hourly scan dedupe, source provider expansion, and Gmail scan noise
filtering.

## Key Decisions

- Scanner behavior should be described as one lifecycle:
  `list -> normalize -> score/filter -> enrich -> evaluate -> merge`.
- Source-specific scripts remain CLI/front-door wrappers until fixture tests
  prove repeated logic is safe to extract.
- Sponsorship unknown by itself should not block deep evaluation; real blockers
  should be confirmed from source postings before persisting hard filters.
- Scan runs should remain read-only with respect to applications.

## Implemented Changes

- Moved 26 completed scan-operation plans from `active/` into archive.
- Added `docs/architecture/scanner-lifecycle.md` as the current scanner boundary.
- Added scanner lifecycle identity fixtures in
  `apps/server/src/adapters/scanner-lifecycle-contract.test.ts`.

## Verification Completed

- Plan inventory before consolidation identified the scan workstream as an
  active-sprawl group.
- Archived plans are preserved as markdown files in a dated archive directory.
- Fixture tests now cover canonical URL identity, normalized company/role keys,
  and report-derived duplicate identities.

## Open Issues

- Bridge-unavailable/no-evaluate scanner queueing is documented as a contract
  requirement, but full CLI-level failure tests should be added when scanner
  orchestration is next edited.
- Live scanner smoke tests remain site-state dependent; use fixtures and
  score-only checks for most boundary work.

## Next Recommended Steps

- Keep scanner extraction out of scope until the lifecycle fixtures cover every
  source whose orchestration would move.
- Add a bounded score-only smoke for each retained scanner command when Phase 6
  prunes command surfaces.

## Archived References

- `docs/exec-plans/archive/2026-04-17-28-scan-operations/`
