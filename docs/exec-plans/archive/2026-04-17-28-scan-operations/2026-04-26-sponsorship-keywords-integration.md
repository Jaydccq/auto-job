# Sponsorship Keywords Integration

## Background

`config/sponsorship-keywords.yml` now records visa sponsorship signals, no-sponsorship phrases, government blockers, and work-authorization blockers. Existing scan and quick-evaluation logic still primarily uses built-in keyword arrays and `config/profile.yml` hard filters.

## Goal

Load `config/sponsorship-keywords.yml` into the existing scan/evaluation configuration so sponsorship and blocker decisions use the versioned keyword file.

## Scope

- Integrate the new YAML file through the existing `loadNewGradScanConfig` path.
- Keep existing `config/profile.yml` overrides and company-memory behavior intact.
- Cover scan hard filters and local quick-evaluation sponsorship support inference.

Out of scope:

- Rewriting historical reports.
- Changing user profile semantics.
- Replacing the full AI evaluation prompt.

## Assumptions

- `negative_keywords` and `authorization_blockers` both mean WONT_SPONSOR for local hard-filter purposes.
- `government_blockers` map to the existing active-clearance/government blocker path.
- `positive_keywords` should be available to evaluation logic as WILL_SPONSOR signals, but should not override explicit negative/blocker matches.

## Implementation Steps

1. Add keyword loading from `config/sponsorship-keywords.yml`.
   Verify: unit test proves counts/phrases merge into scan config.
2. Merge negative and authorization blocker phrases into `hard_filters.no_sponsorship_keywords`; merge government blockers into `hard_filters.clearance_keywords`; expose positive phrases as sponsorship support keywords.
   Verify: pending/scorer paths continue to use `loadNewGradScanConfig`.
3. Teach local quick evaluation to consider configured positive sponsorship phrases and configured authorization blockers.
   Verify: focused `claude-pipeline` test covers a configured positive phrase.
4. Run targeted tests.
   Verify: relevant adapter tests pass.

## Verification Approach

- `npm --prefix bridge test -- src/adapters/newgrad-config.test.ts`
- `npm --prefix bridge test -- src/adapters/newgrad-scorer.test.ts`
- `npm --prefix bridge test -- src/adapters/newgrad-pending.test.ts`
- `npm --prefix bridge test -- src/adapters/claude-pipeline.test.ts`
- `npm --prefix bridge run typecheck`

## Progress Log

- 2026-04-26: Located config loader, scan filters, pending readers, and quick-evaluation sponsorship inference.
- 2026-04-26: Added sponsorship keyword loading to `loadNewGradScanConfig`; mapped negative and authorization blockers into no-sponsorship filters, government blockers into clearance filters, and positive phrases into quick-evaluation sponsorship inference.
- 2026-04-26: Added focused config and quick-evaluation tests, then ran targeted scanner/pipeline tests and bridge typecheck.

## Key Decisions

- Reuse existing hard-filter fields where possible to avoid parallel logic.
- Add only one new config field for positive sponsorship phrases because positive signals are not represented by existing hard-filter arrays.
- Treat configured negative and authorization blocker phrases as stronger than positive sponsorship phrases when recovering quick-evaluation sponsorship status.

## Risks and Blockers

- Generic authorization phrases can be broad. This is intentional per the requested keyword file, but role text containing those phrases may now be treated as WONT_SPONSOR when `exclude_no_sponsorship` is enabled.

## Final Outcome

Implemented and verified. `config/sponsorship-keywords.yml` now feeds the existing scan/evaluation config path. Verification passed:

- `npm --prefix bridge test -- src/adapters/newgrad-config.test.ts`
- `npm --prefix bridge test -- src/adapters/newgrad-scorer.test.ts`
- `npm --prefix bridge test -- src/adapters/newgrad-pending.test.ts`
- `npm --prefix bridge test -- src/adapters/claude-pipeline.test.ts`
- `npm --prefix bridge run typecheck`
