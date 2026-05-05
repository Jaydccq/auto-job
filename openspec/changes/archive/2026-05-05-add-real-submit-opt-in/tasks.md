## 1. Status type extensions

- [x] 1.1 Edit `apps/server/src/apply-queue/types.ts` — add statuses: `awaiting_approval`, `submitted`, `submit_failed`, `expired`
- [x] 1.2 Update inline comments documenting the new state machine
- [x] 1.3 Run typecheck — verify all switch statements covering ApplyStatus get exhaustiveness errors and fix them (gate.ts, queue.ts, runner.ts)

## 2. Runner refactor — fill marks awaiting_approval

- [x] 2.1 In `apps/server/src/apply-queue/runner.ts`, change the success branch of `processNextApplyEntry` from `markStatus(... "succeeded" ...)` to `markStatus(... "awaiting_approval" ...)`
- [x] 2.2 Update notes message to point to the snapshot path with `auto-apply-approve <id>` hint
- [x] 2.3 Update the runner test (`runner.test.ts`) — successful path now expects `awaiting_approval`

## 3. processApprovedEntry — the one and only real-submit path

- [x] 3.1 Add `processApprovedEntry(controller, id, opts?)` to `runner.ts`
- [x] 3.2 Implement: read queue, find entry, validate `status === "awaiting_approval"` (else throw `EntryNotApprovableError`)
- [x] 3.3 Add `EntryNotApprovableError` to `apps/server/src/apply-queue/errors.ts` (or co-locate in runner.ts if no other errors warrant the new file)
- [x] 3.4 Re-open tab on entry's `jobUrl`, re-fill via `runApplyFlow` (passing `allowSubmit: false` initially — fill defensively first), then call `flow.submit(humanizedTab, { allowSubmit: true })`
- [x] 3.5 On submit success: markStatus `submitted` with notes including `submittedAt` and `finalUrl`
- [x] 3.6 On submit throw or `appearsSuccessful: false`: markStatus `submit_failed` with error notes
- [x] 3.7 On DetectionSignalError during re-fill or submit: markStatus `detected`

## 4. Expiry sweep

- [x] 4.1 New file `apps/server/src/apply-queue/expiry.ts` with `runExpirySweep(opts?)` returning `{expired, scanned}`
- [x] 4.2 Read TTL from `loadPolicy().approval_ttl_hours` (default 24)
- [x] 4.3 Add `approval_ttl_hours` field to `ApplyPolicy` type + DISABLED_POLICY default + YAML loader
- [x] 4.4 Update `config/auto-apply-policy.example.yml` with `approval_ttl_hours: 24` (documented)

## 5. Snapshot MANIFEST.txt

- [x] 5.1 Edit `packages/auto-apply/src/snapshot.ts` — extend `writeReviewSnapshot` to also write `MANIFEST.txt`
- [x] 5.2 Manifest includes: jobUrl, ats, tenant, score (passed via SnapshotInputs extension), filledAt, fieldsFilled, fieldsMissing list, fieldsSkipped table (label + selector), and "REVIEW + APPROVE: auto-apply-approve <id>"
- [x] 5.3 Update snapshot test — assert MANIFEST.txt exists with expected structure

## 6. CLI

- [x] 6.1 New `scripts/auto-apply-approve.ts` with subcommand parser
- [x] 6.2 `list` — read queue, filter status === "awaiting_approval", print table
- [x] 6.3 `show <id>` — print MANIFEST.txt; on macOS `child_process.exec("open", [snapshotDir])`
- [x] 6.4 `<id>` (default) — call `processApprovedEntry`, print outcome
- [x] 6.5 `skip <id> [--reason ...]` — markStatus "skipped" with reason
- [x] 6.6 `sweep` — call `runExpirySweep`, print count
- [x] 6.7 Unknown subcommand or missing id → exit 2 with "see auto-apply-approve --help"
- [x] 6.8 Add npm script `auto-apply:approve` in root `package.json`

## 7. Tests

- [x] 7.1 Status-transition tests for the new statuses (queue.test.ts extension)
- [x] 7.2 `processApprovedEntry` tests with mocked runApplyFlow + flow.submit:
  - Refuses non-awaiting entries with EntryNotApprovableError
  - Calls submit with `allowSubmit: true` (verify mock call args)
  - Status becomes `submitted` on success
  - Status becomes `submit_failed` on submit error
  - Status becomes `detected` on DetectionSignalError
- [x] 7.3 `runExpirySweep` tests:
  - Default 24h policy expires entries past 24h
  - TTL=0 → no-op
  - Only `awaiting_approval` entries are touched
- [x] 7.4 CLI tests via Node's `--test` or vitest snapshot of `--help` output (subcommand smoke)
- [x] 7.5 **Repo-wide grep test** — automated test that runs `grep -rn "allowSubmit: true"` and asserts only the runner's `processApprovedEntry` (plus tests + spec files) match

## 8. Verify + commit + push private + open private PR

- [x] 8.1 `npm run verify` passes (server typecheck/test pick up the new code)
- [x] 8.2 Update `verify-pipeline.mjs` with the grep-based "single submit-true call site" check
- [x] 8.3 Commit on branch (`feat/real-submit-opt-in` from latest private/main)
- [x] 8.4 Push to private remote
- [x] 8.5 Open PR against `Jaydccq/auto-job-private` base main
