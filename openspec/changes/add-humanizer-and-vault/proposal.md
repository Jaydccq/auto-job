## Why

The architecture spec (`docs/superpowers/specs/2026-05-04-auto-job-architecture-design.md`) Phase 2A requires three foundation components before any auto-apply, signup, or email-bot work can ship: (1) a behavior-humanizer that defeats Datadome / Akamai BM / PerimeterX behavior-sequence fingerprints, (2) a macOS Keychain credential vault that never touches the network, and (3) the apply-queue plumbing with a high-score gate that defaults to disabled so no auto-action fires until the user explicitly opts in.

This change ships those three foundations. No actual auto-apply flow runs yet — that's `add-greenhouse-auto-apply` (next change). Once these three exist, every subsequent auto-* phase composes them.

## What Changes

- **NEW** workspace package `packages/humanize/` (`@auto-job/humanize`) — exposes `humanize(tab)` decorator returning a `HumanizedTab` whose `click`, `fill`, `navigate`, `press` methods inject Bezier-curve mouse paths, per-character keystroke dwell, reading delays, and per-session "personality" randomization.
- **NEW** workspace package `packages/credentials/` (`@auto-job/credentials`) — `vaultPut`, `vaultGet`, `vaultDelete`, `vaultGenerate` against macOS Keychain via the `security` CLI. Per-site key naming convention (`auto-job:<ats>-<tenant>`). Never logs values, never networks.
- **NEW** module `apps/server/src/apply-queue/` — `ApplyQueueEntry` type, `enqueue`, `readQueue`, `markStatus`. Backed by `data/apply-queue.jsonl` (gitignored). The `applyGate(evaluation)` function checks score against `auto_threshold`, ATS support, daily quota, and cooldown — returns `{enqueue: true | false, reason}`.
- **NEW** config schema `config/auto-apply-policy.example.yml` documents every field; defaults effectively **disable** auto-apply (`auto_threshold: null`, `daily_quota.total: 0`, all per-ATS quotas: `0`). User opts in by copying to `config/auto-apply-policy.yml` (gitignored) and setting non-zero values.
- Tests: unit tests for humanizer math (Bezier path generation determinism with seed; keystroke distribution stays in 250-400ms band), vault round-trip against a fake Keychain (mock `security` CLI), queue persistence, gate decision matrix.
- New npm script `vault:cli` for inspecting the vault from CLI (debug-only, prints key names not values).

**Not breaking.** All existing scripts continue to work. The new modules are dormant until the next phase wires them into an actual apply flow.

## Capabilities

### New Capabilities

- `humanize`: behavior-humanization decorator over `@auto-job/browser`'s `Tab` API. Provides Bezier mouse paths, per-char keystroke timing, reading-time delays, session personality randomization. Defeats behavior-sequence fingerprinting.
- `credentials`: macOS Keychain vault for per-site credential storage. Local-only, never logs or networks values. Used by future auto-apply / signup phases.
- `apply-queue`: queue plumbing + score-gate decision. Default config disables all auto-action. User-opt-in by config edit.

### Modified Capabilities

(none — additive only)

## Impact

- **Affected code:** `packages/humanize/` (new), `packages/credentials/` (new), `apps/server/src/apply-queue/` (new), `config/auto-apply-policy.example.yml` (new), `.gitignore` (add `data/apply-queue.jsonl`, `config/auto-apply-policy.yml`)
- **Dependencies:** `@auto-job/browser` for type imports (humanize wraps Tab); no other new npm deps
- **External systems:** macOS Keychain (`security` CLI). Linux/Windows users get a clear `KeychainNotAvailableError` until those backends are added in a future change.
- **Reversibility:** Pure-additive packages and modules; revert by removing them
- **Authoritative spec:** `docs/superpowers/specs/2026-05-04-auto-job-architecture-design.md` (Phase 2A)
- **Repo:** **PRIVATE** (Jaydccq/auto-job-private). This change does NOT ship to public Jaydccq/auto-job per architecture decision A2.
