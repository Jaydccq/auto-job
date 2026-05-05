# apply-approval-flow Specification

## Purpose
TBD - created by archiving change add-real-submit-opt-in. Update Purpose after archive.
## Requirements
### Requirement: New apply-queue statuses for approval flow

The apply-queue type system SHALL add the following statuses:

- `awaiting_approval` — fill complete, review snapshot exists, user has not yet approved or skipped
- `submitted` — submit operation completed successfully (set by `processApprovedEntry`)
- `submit_failed` — submit attempted but failed (e.g., HTTP error, redirect to login)
- `expired` — TTL passed without approval; no further action will be taken

The existing statuses (`ready`, `in_flight`, `succeeded`, `failed`, `detected`, `skipped`) remain. The semantics of `succeeded` change in Phase 2C: it now means "fill succeeded but submit not requested" (used by callers who explicitly invoke `runApplyFlow(allowSubmit:false)` outside the queue runner).

#### Scenario: Type system exposes all new statuses

- **WHEN** `ApplyStatus` from `apps/server/src/apply-queue/types.ts` is inspected
- **THEN** it includes `awaiting_approval`, `submitted`, `submit_failed`, `expired`

### Requirement: Runner marks `awaiting_approval` after fill

`processNextApplyEntry` in `apps/server/src/apply-queue/runner.ts` SHALL, after a successful `runApplyFlow` (which still uses `allowSubmit: false`), mark the entry as `awaiting_approval` (NOT `succeeded` as in Phase 2B). The notes field SHALL include the snapshot path.

#### Scenario: Successful fill yields awaiting_approval

- **WHEN** the queue has a `ready` entry and `runApplyFlow` resolves with a fill result
- **AND** `processNextApplyEntry(controller)` runs
- **THEN** `readQueue()` shows that entry's status as `awaiting_approval`
- **AND** the entry's notes contain the snapshot directory path

### Requirement: `processApprovedEntry(controller, id)` is the only path to real submission

The system SHALL provide `processApprovedEntry(controller, id, opts?)` in `apps/server/src/apply-queue/runner.ts`. This function SHALL:

1. Read the queue and find entry with the given `id`
2. Refuse with `EntryNotApprovableError` if the entry is missing or its status is not `awaiting_approval`
3. Re-open the tab, re-run the fill (defensively, against current page state)
4. Call the adapter's `submit(humanizedTab, { allowSubmit: true })` — this is the ONLY call site in the codebase that passes `allowSubmit: true`
5. On successful submit: mark status `submitted`, record `submittedAt` timestamp
6. On submit failure: mark status `submit_failed` with error notes
7. On detection signal: mark status `detected` (existing cooldown logic from Phase 2A applies)

`processNextApplyEntry` from Phase 2B SHALL NEVER call `processApprovedEntry` automatically.

#### Scenario: processApprovedEntry refuses non-awaiting entries

- **WHEN** an entry's status is `ready`, `succeeded`, `submitted`, or `expired`
- **AND** `processApprovedEntry(controller, id)` is called
- **THEN** the call throws `EntryNotApprovableError` carrying the id and current status

#### Scenario: processApprovedEntry passes allowSubmit:true to the adapter

- **WHEN** `processApprovedEntry(controller, id)` runs against an `awaiting_approval` entry
- **AND** the orchestrator invokes the per-ATS adapter's `submit` method
- **THEN** the second argument to `submit` is `{ allowSubmit: true }` (verifiable via mocked adapter in tests)

#### Scenario: Successful submit transitions to `submitted`

- **WHEN** the underlying `submit()` resolves successfully
- **THEN** the entry's status becomes `submitted`
- **AND** the notes contain `submittedAt` and `finalUrl`

### Requirement: Approval CLI

The repository SHALL provide `scripts/auto-apply-approve.ts` (npm script: `auto-apply:approve`) with subcommands:

- `list` — print all `awaiting_approval` entries with id, company, score, snapshot path, and time-since-fill
- `show <id>` — print the snapshot manifest and (on macOS) `open` the snapshot directory
- `<id>` (no subcommand) — call `processApprovedEntry(controller, id)`; print result + new status
- `skip <id> [--reason <text>]` — mark status `skipped` with reason in notes; do NOT submit
- `sweep` — call `runExpirySweep`; print count of entries flipped to `expired`

Unknown id, malformed args, or non-`awaiting_approval` entry SHALL exit non-zero with a clear actionable message.

#### Scenario: list shows pending approvals

- **WHEN** the queue has 2 `awaiting_approval` and 3 other entries
- **AND** `auto-apply-approve list` is run
- **THEN** the output shows exactly the 2 pending entries with their fields

#### Scenario: approve invokes processApprovedEntry

- **WHEN** `auto-apply-approve <valid-id>` is run against an `awaiting_approval` entry
- **THEN** `processApprovedEntry` is called and the entry's resulting status is printed

#### Scenario: skip writes new status without re-running fill

- **WHEN** `auto-apply-approve skip <id> --reason "salary too low"` is run
- **THEN** the entry's status becomes `skipped` with the reason in notes
- **AND** no browser action occurred (no new snapshot dir, no submit attempt)

### Requirement: TTL expiry sweep

The system SHALL provide `runExpirySweep(opts?)` in `apps/server/src/apply-queue/expiry.ts`. It SHALL:

1. Read the queue
2. For each entry with status `awaiting_approval`, compare the original `status_at` to `Date.now() - ttlMs` where ttlMs is `policy.approval_ttl_hours * 3600_000`
3. Mark expired entries as `expired` with notes "expired after <hours>h waiting for approval"
4. Return a summary `{ expired: number, scanned: number }`

If `policy.approval_ttl_hours` is `0` or unset, the sweep is a no-op and returns `{ expired: 0, scanned: <count> }`.

#### Scenario: Default 24h policy expires entries past 24h

- **WHEN** an entry has `status: "awaiting_approval"` with `status_at` 25h in the past
- **AND** `runExpirySweep()` is called with default policy
- **THEN** the entry's status becomes `expired`

#### Scenario: TTL=0 disables expiry

- **WHEN** policy has `approval_ttl_hours: 0`
- **AND** `runExpirySweep()` is called against any aged entry
- **THEN** no statuses change; the result is `{ expired: 0, scanned: <count> }`

### Requirement: Review snapshot manifest

`writeReviewSnapshot` (from Phase 2B) SHALL additionally write `MANIFEST.txt` containing human-readable lines:

- Job URL
- ATS + tenant
- Score (from queue entry)
- Time of fill
- Counts: filled / missing / skipped
- One line per skipped (custom) field with its label
- "REVIEW + APPROVE: auto-apply-approve <id>"

The manifest is for fast human eyeballing; it complements the structured `data.json`.

#### Scenario: Manifest written alongside other snapshot files

- **WHEN** `runApplyFlow` completes successfully
- **THEN** the snapshot directory contains `MANIFEST.txt`
- **AND** the manifest's "REVIEW + APPROVE:" line includes the entry's id

### Requirement: Submit gate is single-call-site

The codebase SHALL contain exactly ONE call to any adapter's `submit()` method that passes `allowSubmit: true`, and that call site SHALL be inside `processApprovedEntry`. A repo-wide grep `grep -r "allowSubmit:\s*true"` SHALL return only:
- The `processApprovedEntry` implementation
- This requirement's source spec
- Test files that explicitly exercise the gate (and even those should mock, not call real adapters with real tabs)

#### Scenario: Repo grep enforces single submit-true call site

- **WHEN** `grep -rn "allowSubmit: true" --include="*.ts" packages/ apps/server/src/ scripts/` runs
- **THEN** the only non-test, non-spec file matching is `apps/server/src/apply-queue/runner.ts` inside `processApprovedEntry`

