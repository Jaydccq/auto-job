## Why

Phase 2B (PR #7) ships fill-only — every adapter knows how to fill ATS forms but `submit()` is hard-blocked. Phase 2C lifts the gate **carefully**: the user can review a fill snapshot and explicitly approve real submission for that single application.

The key risk: once we cross from fill-only to actual submission, every false-positive (wrong job, wrong cover letter, wrong work-auth answer) becomes an IRREVERSIBLE action visible to a real recruiter. Worse, repeated bad submissions burn our device fingerprint without us learning anything.

This change introduces a **two-step approval** UX: the runner fills the form (Phase 2B), captures the snapshot, and then **waits for the user to confirm** before submitting. Confirmation paths: CLI (`auto-apply approve <id>`), interactive prompt, or future dashboard button. Without confirmation within a TTL (default 24h), the queue entry is auto-skipped (status: `expired`) and the snapshot remains for archival.

## What Changes

- **NEW** `apps/server/src/apply-queue/types.ts` adds two statuses:
  - `awaiting_approval` — fill complete, snapshot ready, user has not approved yet
  - `expired` — TTL passed without approval; snapshot kept but no further action
- **NEW** `apps/server/src/apply-queue/runner.ts` updated:
  - After successful fill, marks status `awaiting_approval` (instead of `succeeded`)
  - New function `processApprovedEntry(controller, id, opts)` that re-opens tab, re-fills (defensive — re-runs the fill flow against the live page in case session state changed), and ONLY THEN calls `flow.submit(tab, { allowSubmit: true })`
- **NEW** CLI `scripts/auto-apply-approve.ts`:
  - `auto-apply-approve list` — show entries awaiting approval with their snapshot paths
  - `auto-apply-approve show <id>` — open the snapshot dir in the OS file viewer
  - `auto-apply-approve <id>` — confirm + actually submit (calls `processApprovedEntry`)
  - `auto-apply-approve skip <id> [--reason ...]` — mark `skipped`, snapshot kept
- **NEW** `apps/server/src/apply-queue/expiry.ts` — background sweep that flips entries past TTL to `expired`. Default TTL: 24h. Configurable via `config/auto-apply-policy.yml` `approval_ttl_hours`.
- **NEW** review snapshot includes a `MANIFEST.txt` with human-readable summary (job URL, company, what was filled, what was skipped, snapshot dir path) for fast eyeballing
- Tests: status-transition matrix; expiry sweep; approval re-fill; submit gate verification ((`allowSubmit:true` only inside `processApprovedEntry`))

**Not breaking** the Phase 2B contract: default `runApplyFlow` still hard-blocks submit. Phase 2C only adds the controlled escape hatch via `processApprovedEntry`.

## Capabilities

### New Capabilities

- `apply-approval-flow`: two-step user-opt-in for real submission. Fill happens automatically (Phase 2B); user reviews snapshot; user explicitly approves via CLI; runner re-fills + submits.

### Modified Capabilities

- `apply-queue` (from Phase 2A): add `awaiting_approval` and `expired` statuses; document the state machine including the new transitions
- `auto-apply` (from Phase 2B): `runApplyFlow` learns to mark `awaiting_approval` after fill (instead of `succeeded`); add `processApprovedEntry` orchestrator

## Impact

- **Affected code:** `apps/server/src/apply-queue/{types,runner,expiry}.ts`, `scripts/auto-apply-approve.ts` (new), `packages/auto-apply/src/run.ts` (slight extension)
- **Dependencies:** none new
- **External systems:** ATS apply pages — actual submission happens here for the first time. Cooldown semantics from Phase 2A continue to apply if detection fires.
- **Reversibility:** revert removes the approve CLI + new statuses; no data migration needed (JSONL append-only)
- **Repo:** **PRIVATE**
- **Authoritative spec:** `docs/superpowers/specs/2026-05-04-auto-job-architecture-design.md` (Phase 2C — added by this change)
