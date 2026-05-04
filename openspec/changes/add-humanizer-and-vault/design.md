## Context

Architecture spec Phase 2A. Foundation layer for every subsequent auto-* phase (auto-apply, signup, email-bot). Three independent components ship together because the next change (`add-greenhouse-auto-apply`) needs all three: it'll humanize-fill the form, fetch credentials from vault, and only fire if the apply-queue gate says so.

Lives in private fork because the entire write/automation surface is operationally sensitive (per architecture decision A2). Public repo (`Jaydccq/auto-job`) keeps only read/scan code.

## Goals / Non-Goals

**Goals:**
- `humanize(tab)` decorator returns `HumanizedTab` with the SAME public surface as `Tab` (drop-in replacement) but with humanized timings on every interactive method
- Bezier mouse paths use deterministic randomness keyed on a per-session seed so behavior is reproducible for tests but varies across sessions
- macOS Keychain integration via the built-in `security` CLI — zero new npm deps, OS-level encryption
- Apply-queue defaults to **disabled** (auto_threshold = null, all quotas = 0) so installation never auto-acts
- Every public function has a unit test; vault tests use a mock `security` shim so they don't pollute the user's real Keychain

**Non-Goals:**
- Linux / Windows credential backends (Keychain is macOS-only; cross-platform deferred until needed)
- Actual auto-apply flow (next change)
- Email-bot integration (Phase 3)
- Risk telemetry (Phase 5)
- Browser fingerprint randomization beyond what's already in `@auto-job/browser`'s stealth layer

## Decisions

### D1 — Three packages, not one

`packages/humanize/`, `packages/credentials/`, `apps/server/src/apply-queue/` are independent. Reason: humanize is browser-only (depends on `@auto-job/browser`), vault is OS-bound (depends on `security` CLI), apply-queue is bridge-internal (lives in `apps/server`). Cross-coupling them would mean future auto-* phases can't reuse them in isolation (e.g., a future "manual-fill helper that uses vault but not the queue").

**Alternative considered:** one umbrella package `auto-apply-foundations`. Rejected — premature umbrella, breaks reuse.

### D2 — `humanize(tab)` is a decorator returning `HumanizedTab`, not a flag on Tab

`HumanizedTab implements Tab` — same public surface, humanized internals. Callers explicitly opt in by writing `const ht = humanize(tab)`. Reason: keeps the existing `Tab` cheap and predictable for non-interactive uses (read-path scans don't need humanization). Future Phase 2B+ adapters can mix `tab.fetch(api)` (cheap) with `ht.click(submitButton)` (humanized) on the same tab instance.

### D3 — Bezier mouse paths use 3 control segments with deterministic seed

Each mouse-move from current position to target uses 3 cubic Bezier segments, each with control points jittered ±15px from the linear midpoint. 30-60 micro-steps execute the path with 8-16ms between each via `page.mouse.move()`. The seed comes from a per-session `Math.random()` captured once at humanize() time so all moves in one session feel coherent (same "personality").

**Alternative considered:** per-call random seed. Rejected — too jittery, looks more like noise than human.

### D4 — Keystroke dwell distribution: log-normal centered on 320ms

Per-char dwell uses log-normal random with median ~320ms, σ giving a P95 around 750ms and P5 around 130ms. Plus 1% probability of "typo" (insert wrong char, dwell, backspace, dwell, correct char). Implemented via `page.keyboard.press(char, {delay})`.

**Alternative considered:** uniform 200-400ms. Rejected — uniform distributions are themselves a fingerprintable signal (real humans cluster + have outliers).

### D5 — Vault key format: `auto-job:<ats>-<tenant>`

E.g., `auto-job:workday-amazon`, `auto-job:greenhouse-stripe`. Convention enforced by `vaultKey(ats, tenant)` helper to prevent typos. The `security` CLI's `-s` (service) field gets the full key; `-a` (account) field gets the email; `-w` field gets the password.

**Alternative considered:** flat hash key. Rejected — readable keys help debugging and Keychain.app browsing.

### D6 — `vaultGenerate` is OPTIONAL helper, not the default put path

User explicitly chose to allow same-password reuse across sites for ergonomic management (per architecture decision A3). `vaultPut(siteKey, email, password)` is the primary API. `vaultGenerate(siteKey, email)` is a separate helper that creates a strong random password and stores it — only invoked if user explicitly opts in via flag.

### D7 — Apply queue is JSONL append-only with status mutations as new lines

`data/apply-queue.jsonl` — each line is `{id, jobId, score, ats, vault_ref, queued_at, status, status_at}`. New status writes a new line with `id` matching original; readers project to "current state" by latest-line-wins per id. Reason: append-only is atomic on filesystem, replay-friendly, and matches the existing `data/scan-history.tsv` pattern.

### D8 — Gate config schema in YAML, defaults disabled

`config/auto-apply-policy.example.yml` documents the schema with comments. Defaults that disable auto:
```yaml
auto_threshold: null              # null = no auto-fire ever
daily_quota:
  total: 0                        # 0 = disabled
  per_ats: { workday: 0, ... }
```

User copies to `config/auto-apply-policy.yml` (gitignored) and sets non-zero values to enable. Loader throws `AutoApplyDisabledError` if asked to gate when policy file is missing or all-zero.

## Risks / Trade-offs

- **macOS Keychain prompts** — first time the script accesses a vault entry from a new binary path, Keychain shows a confirmation dialog. Mitigation: the `security` CLI invocation can use `-A` (allow access from any application) at write time, but that lowers security. We default to NOT using `-A` so the user sees the prompt — this is the correct security posture.
- **Bezier path predictability** — if seed is captured from `Date.now()` only, two scripts started within the same millisecond would have identical "personalities". Mitigation: seed = `crypto.randomBytes(8).readBigUInt64BE() ^ BigInt(Date.now())`.
- **Apply-queue race conditions** — two processes writing simultaneously could interleave lines. Mitigation: enqueue operation uses `O_APPEND` flag (POSIX guarantees atomicity for writes ≤ PIPE_BUF). Documented limitation: status-mutations from concurrent processes may race; in practice we have one server process at a time.
- **Test isolation for vault** — real Keychain mutation in tests would pollute the user's keychain. Mitigation: vault tests inject a mock `security` CLI via `child_process.execFile` mocking; one integration test (gated by `KEYCHAIN_INTEGRATION=1`) writes/reads a real test entry under `auto-job-test:*` prefix and cleans up.

## Migration Plan

Pure-additive. No migration. Revert = remove the new files.

Rollout: ship to private repo immediately on completion. Future phases pull from private main.

## Open Questions

None at design time.
