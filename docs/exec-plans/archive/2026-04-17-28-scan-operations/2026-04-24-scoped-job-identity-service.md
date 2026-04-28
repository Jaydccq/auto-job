# Scoped Job Identity Service

## Background

Roadmap validation showed identity/status noise across tracker, pipeline, and
scan history: 1,523 parsed items, 245 repeated normalized company-role keys, 195
cross-artifact repeated keys, and 14 repeated canonical URL keys. The next
useful step is a scoped identity service, not a database.

## Goal

Centralize job identity key generation for scanner dedupe paths so URL and
company-role matching are consistent across score, pending, pipeline, tracker,
and scan-history code.

## Scope

- Add a small identity helper around canonical URL, normalized company, normalized
  role, optional source job id, and optional content hash.
- Use the helper in existing newgrad scan history, scoring, tracked-role, and
  pending-entry paths.
- Add targeted tests for URL identity, company-role normalization, source id,
  content hash, and duplicate filtering behavior.

## Assumptions

- Current markdown/TSV files remain the state store.
- A normalized company-role key may strip punctuation and legal suffixes from
  company names, but role normalization should stay conservative to avoid false
  positives between different roles.
- Content hash is exposed for future use but not yet persisted into scan history.

## Implementation Steps

1. Add `bridge/src/adapters/job-identity.ts`.
   Verify: unit tests cover URL, company-role, source job id, and content hash.
2. Replace local company-role key construction in scan history and scorer.
   Verify: existing newgrad scorer/history tests pass with updated expectations.
3. Replace tracked company-role and pending-entry keys.
   Verify: pending/config tests pass for tracker/pipeline dedupe.
4. Run targeted bridge tests and typecheck.
   Verify: identity, scan-history, scorer, config, pending tests, bridge
   typecheck, and `git diff --check`.

## Verification Approach

Use Vitest unit tests for deterministic identity semantics and existing adapter
tests for behavior preservation.

## Progress Log

- 2026-04-24: Created implementation plan.
- 2026-04-24: Added `bridge/src/adapters/job-identity.ts` with canonical URL,
  normalized company-role, source job id, content hash, and stable key helpers.
- 2026-04-24: Replaced local identity key construction in scan history, scorer,
  tracked company-role loading, newgrad pending, Built In pending, and evaluated
  report URL loading.
- 2026-04-24: Added identity tests and updated existing scorer/history/config/
  pending tests to assert normalized identity behavior.
- 2026-04-24: Verification passed:
  `npm --prefix bridge run test -- src/adapters/builtin-pending.test.ts src/adapters/job-identity.test.ts src/adapters/newgrad-pending.test.ts src/adapters/newgrad-scan-history.test.ts src/adapters/newgrad-scorer.test.ts src/adapters/newgrad-config.test.ts src/adapters/evaluated-report-urls.test.ts`,
  `npm --prefix bridge run typecheck`, and `npm run verify`.

## Key Decisions

- Keep the service file small and deterministic; no persistent store.
- URL remains the first stable key when available.
- Company-role fallback strips punctuation and common legal suffixes from
  company names, while role normalization only handles case, punctuation, and
  whitespace.
- Content hash exists for future JD-change detection but is not persisted yet.

## Risks and Blockers

- Over-normalizing roles can hide distinct jobs. Keep role normalization limited
  to punctuation/whitespace/case.
- Company legal suffix stripping may collapse truly distinct subsidiaries, but
  this is acceptable for scan dedupe only when the role also matches.

## Final Outcome

Implemented. Existing scanner/tracker/pending paths now share one scoped job
identity helper instead of hand-rolling URL and company-role keys in each file.
The full project verification passes with 0 errors and 2 pre-existing duplicate
warnings.
