# Verify Bridge E2E Timeout

## Background

`npm run verify` invokes `npm --prefix bridge test`. The full bridge test suite
uses Vitest's default 5-second per-test timeout. Two batch-runner e2e tests
regularly pass when rerun with `--testTimeout=20000`, but fail under the default
verify path.

## Goal

Make `npm run verify` pass without requiring a manual special-case rerun.

## Scope

- Adjust only the slow batch-runner e2e tests.
- Do not change product behavior.
- Preserve the existing verify command.

## Assumptions

- The two e2e tests are legitimate integration-style tests that can exceed 5
  seconds on local machines.
- A test-local timeout is preferable to raising the timeout for the entire
  bridge suite.

## Implementation Steps

1. Add an explicit timeout to the two batch-runner e2e tests.
   Verify: `npm --prefix bridge test -- src/batch/batch-runner.e2e.test.ts`.
2. Run the normal verification path.
   Verify: `npm run verify`.

## Verification Approach

- `npm --prefix bridge test -- src/batch/batch-runner.e2e.test.ts`
- `npm run verify`
- `git diff --check`

## Progress Log

- 2026-04-24: User requested fixing the known `npm run verify` failure where
  two bridge batch e2e tests time out at Vitest's default 5 seconds but pass
  with `--testTimeout=20000`.
- 2026-04-24: Added `BATCH_E2E_TIMEOUT_MS = 20_000` as a per-test timeout for
  the two batch-runner e2e tests. This leaves the rest of the bridge suite on
  Vitest's default timeout.
- 2026-04-24: Verification passed: `npm --prefix bridge test --
  src/batch/batch-runner.e2e.test.ts`, `npm run verify`, and
  `git diff --check`. `npm run verify` completed with 0 errors and the existing
  2 duplicate warnings for RemoteHunter Software Engineer and Anduril
  Industries Software Engineer.

## Key Decisions

- Use per-test timeout arguments instead of a global Vitest timeout.

## Risks and Blockers

- If the test runtime later grows beyond 20 seconds, the e2e tests should be
  optimized or split rather than increasing timeouts again.

## Final Outcome

Fixed. The default `npm run verify` path now passes without a manual
`--testTimeout=20000` rerun.
