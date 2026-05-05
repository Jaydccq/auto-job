## Context

Phase 2B intentionally hard-blocked submit so we could iterate on fill flows without burning device fingerprint or accidentally submitting junk. Phase 2C lifts the block but routes through a deliberate human-in-the-loop checkpoint.

The shape mirrors how a careful human applies to jobs: scan → score → fill in tab → SCREEN-LOOK at the form one last time → click Submit. We're automating everything except the screen-look + click.

## Goals / Non-Goals

**Goals:**
- After fill, application sits in `awaiting_approval` with a complete review snapshot
- User has 24h (configurable) to review + approve
- Approval re-runs fill defensively (in case the saved tab state expired) then submits
- TTL expiry is a clean status transition; no auto-submit on expiry
- CLI is the primary approval surface; future dashboard button can hit the same endpoint

**Non-Goals:**
- Auto-approve based on some confidence score (this defeats the point of human-in-the-loop)
- Multi-user / multi-approver (single-user system)
- Resume tab session across processes (tab is closed after fill; approval re-opens fresh)
- Bulk approve (forces per-application review, intentionally)
- Web UI (CLI is enough for solo operator; dashboard widget is Phase 2C+1)

## Decisions

### D1 — `awaiting_approval` is a distinct status, not a flag

Rationale: existing `applyGate` cooldown logic already filters by status; adding a flag would require touching multiple call sites. A new status integrates cleanly with `readQueue()` projection.

### D2 — Approval re-runs fill, doesn't reuse the original tab

Tabs are closed after Phase 2B fill (orchestrator's `tab.close()`). Re-opening from snapshot HTML wouldn't preserve cookies / session state on the ATS server. The defensive re-fill is ~3-10 seconds per application; acceptable for a deliberate human action.

This also means the user's approval is implicitly approving "what would be filled now" not "what was filled when you saw the snapshot." If anything material changed (job posting closed, form updated), the re-fill detects it and either succeeds (filling the new state) or fails clearly.

**Alternative considered:** persist tab state via playwright's storage state. Rejected — adds attack surface (storage-state file on disk), and 3s re-fill is faster than maintaining persistent tab pools.

### D3 — `processApprovedEntry` is the ONLY path that calls `submit(allowSubmit:true)`

Defense in depth: even if an attacker (or future buggy code) tries to call `runApplyFlow(allowSubmit:true)` directly, the apply-queue runner won't do it. Only the explicit CLI path can.

`processApprovedEntry` enforces:
1. Entry exists with `status === "awaiting_approval"` — refuse otherwise
2. Original snapshot path exists — refuse if missing
3. Re-fill succeeds — refuse to submit if re-fill throws
4. Calls `flow.submit(humanizedTab, { allowSubmit: true })` exactly once
5. On submit success: status `submitted` (NEW status), `submittedAt` recorded
6. On submit failure: status `submit_failed`, snapshot + error captured

### D4 — Default TTL 24h, configurable

Rationale: real users probably check email/dashboard 1-2× per day. 24h gives safety margin without indefinite queue accumulation.

Configurable via `config/auto-apply-policy.yml` `approval_ttl_hours: 24`. Setting to `0` disables expiry (entries wait forever — debatable choice, allowed for completeness).

### D5 — Expiry sweep is a separate function, not auto-on-read

`runExpirySweep(opts?)` projects current queue, marks entries past TTL as `expired`. Called by:
- The runner before processing next entry
- A future cron / scheduler trigger
- Manually via `auto-apply-approve sweep`

Reason: making it implicit-on-read could unintentionally expire entries during a `list` command.

### D6 — CLI exits non-zero on user-error, prints actionable message

`auto-apply-approve <id>` for an unknown id → exit 2 + "no entry with id ... ; try `auto-apply-approve list`". Never silent.

## Risks / Trade-offs

- **Re-fill divergence** — the form on re-fill might differ from snapshot (race condition with site changes). Mitigation: surface the diff prominently in approval CLI before submit. The user can `auto-apply-approve skip` if they don't trust the new state.
- **TTL too short** — some users check approvals less often. Mitigation: configurable; clear error message when expiring entries.
- **Operator approves something they shouldn't** — fundamental risk of any auto-action system. Mitigation: review snapshot includes job URL prominently; the user's explicit `approve <id>` is a deliberate act. We can't make the approval more deliberate without removing the value.
- **Rate-limit interaction with cooldown** — if user approves 5 entries back-to-back, do they all fire? Yes, but Phase 2A's `inter_apply_delay` config still pacers them. Phase 5 telemetry will start cooldown if any throw detection.

## Migration Plan

Pure additive. Existing entries with status `succeeded` (under Phase 2B semantics) are NOT migrated to `awaiting_approval` — they're considered past-tense and inert.

After this change merges:
- Newly filled entries will be in `awaiting_approval` (instead of `succeeded`)
- User uses `auto-apply-approve list` to see pending approvals
- Entries time out to `expired` after 24h

Rollback: revert removes the approval CLI; existing queue entries are still readable.

## Open Questions

None at design time. Future Phase 2C+1 (dashboard widget) can add a UI button that calls the same endpoint.
