## ADDED Requirements

### Requirement: Humanizer decorator over Tab

The system SHALL provide a `humanize(tab, opts?)` function that returns a `HumanizedTab` instance exposing the SAME public surface as `Tab` from `@auto-job/browser` (drop-in replacement for callers). All interactive methods (`click`, `fill`, `navigate`, `press`, `select`) SHALL emit humanized timings:

- Mouse moves use Bezier-curve paths with 3 cubic segments and 30-60 micro-steps spaced 8-16ms apart
- Per-character keystroke dwell follows a log-normal distribution centered on 320ms (σ such that P5 ≈ 130ms, P95 ≈ 750ms)
- Keystroke streams insert ~1% probability of "typo" (wrong char + backspace + correct char) on `fill` operations
- Element interactions are preceded by a "reading delay" computed from element text length at 60ms/char (clamped to [200ms, 3000ms])
- A per-session randomization seed makes one session's behavior coherent ("personality") while differing across sessions

Non-interactive methods (`fetch`, `evaluate`, `snapshot`) SHALL pass through to the underlying Tab unchanged (no humanization needed for headless API calls).

#### Scenario: humanize() returns a Tab-compatible object

- **WHEN** `humanize(tab)` is called with a `Tab` instance
- **THEN** the returned `HumanizedTab` has all methods present on `Tab`
- **AND** TypeScript accepts assigning `HumanizedTab` to a variable of type `Tab`

#### Scenario: Mouse moves emit Bezier paths with multi-step deltas

- **WHEN** `humanizedTab.click("#submit")` is called and the underlying playwright page records mouse events
- **THEN** between the previous cursor position and the click target there are at least 30 mouse-move events
- **AND** consecutive event positions are not collinear (curved path, not straight line)

#### Scenario: Per-character typing delays follow the configured distribution

- **WHEN** `humanizedTab.fill("#input", "hello")` is called
- **THEN** the time between consecutive keystroke events is in the range [50ms, 1500ms] for ≥95% of characters
- **AND** the median across many calls converges to ~320ms

#### Scenario: Reading delay scales with element text

- **WHEN** the tab is about to act on an element whose `innerText` is N characters
- **THEN** a delay of `clamp(N * 60ms, 200ms, 3000ms)` precedes the action

#### Scenario: Per-session personality is stable

- **WHEN** two `click` calls happen within the same `humanize()` session
- **THEN** their humanization parameters (typing speed bias, reading-speed bias) are derived from the same seed
- **AND** running the same sequence in a fresh session produces different (but in-band) timings

### Requirement: Credential vault on macOS Keychain

The package SHALL provide `vaultPut`, `vaultGet`, `vaultDelete`, and `vaultGenerate` functions backed by the macOS `security` CLI. Each vault entry SHALL be keyed `auto-job:<ats>-<tenant>` (kebab-case) and store `{email, password}` as the account/secret pair.

Vault values SHALL NEVER appear in console output, log files, or process stdout/stderr in any code path. Vault operations SHALL NEVER make network requests. The vault SHALL throw `KeychainNotAvailableError` on non-macOS systems with a clear remediation message.

`vaultGenerate(siteKey, email)` SHALL generate a strong random password (≥20 chars, mixed case + digits + symbols), store it via `vaultPut`, and return the generated password to the caller. It is a separate code path from `vaultPut` — callers explicitly opt in to generated passwords.

#### Scenario: Round-trip put then get

- **WHEN** `vaultPut("auto-job:workday-adobe", "user@gmail.com", "MyPwd123!")` is called and succeeds
- **AND** `vaultGet("auto-job:workday-adobe")` is called subsequently
- **THEN** the result is `{ email: "user@gmail.com", password: "MyPwd123!" }`

#### Scenario: Get on missing key throws

- **WHEN** `vaultGet("auto-job:nonexistent")` is called
- **THEN** the function throws `KeychainEntryNotFoundError` carrying the key name

#### Scenario: Delete removes the entry

- **WHEN** `vaultPut(...)` succeeds, then `vaultDelete(key)` is called
- **THEN** subsequent `vaultGet(key)` throws `KeychainEntryNotFoundError`

#### Scenario: Vault values never appear in logs

- **WHEN** any vault operation runs
- **THEN** no console.log / console.error / file write contains the password substring or the bytes of any stored secret

#### Scenario: Generated password meets strength bar

- **WHEN** `vaultGenerate(siteKey, email)` is called
- **THEN** the returned password is at least 20 characters and contains at least one each of: lowercase, uppercase, digit, symbol

#### Scenario: Non-macOS throws clear error

- **WHEN** the runtime platform is not "darwin"
- **THEN** any vault operation throws `KeychainNotAvailableError` with a message identifying the platform limitation

### Requirement: Apply queue with score gate

The system SHALL provide an `applyQueue` module exposing `enqueue`, `readQueue`, and `markStatus` functions. The queue SHALL persist as `data/apply-queue.jsonl` — append-only JSONL where each line represents either an initial enqueue or a status mutation, with the latest line per `id` winning when projecting current state.

The system SHALL provide an `applyGate(evaluation)` function that returns `{ enqueue: boolean, reason: string }`. The gate SHALL evaluate, in order: (1) score meets `auto_threshold`, (2) ATS is in the supported list, (3) daily quota for the ATS not exceeded, (4) ATS not in active cooldown. The gate SHALL return `{enqueue: false, reason: "auto-apply disabled by config"}` when policy file is missing or `auto_threshold` is null.

#### Scenario: Default config disables all auto-apply

- **WHEN** the system is freshly installed (no `config/auto-apply-policy.yml`)
- **AND** `applyGate(evaluation)` is called for any evaluation, regardless of score
- **THEN** the result is `{enqueue: false, reason: "auto-apply disabled by config"}`

#### Scenario: Gate respects auto_threshold

- **WHEN** `auto_threshold: 4.5` is configured AND quotas allow AND ATS is supported
- **AND** `applyGate({score: 4.0, ats: "greenhouse"})` is called
- **THEN** the result is `{enqueue: false, reason: "score 4.0 below threshold 4.5"}`

#### Scenario: Gate respects daily quota

- **WHEN** the queue already has 5 entries with `status="in_flight"` for today and the policy says `total: 5`
- **AND** another high-scoring evaluation is gated
- **THEN** the result is `{enqueue: false, reason: "daily quota 5 already reached"}`

#### Scenario: Enqueue persists to JSONL

- **WHEN** `enqueue(entry)` is called
- **THEN** a JSON line is appended to `data/apply-queue.jsonl` containing the entry fields plus `status: "ready"` and `queued_at: <ISO timestamp>`

#### Scenario: markStatus appends a status-mutation line

- **WHEN** an entry exists with id "abc123" and status "ready"
- **AND** `markStatus("abc123", "in_flight")` is called
- **THEN** a new line is appended with `id: "abc123", status: "in_flight", status_at: <ISO timestamp>`
- **AND** `readQueue()` returns the entry with `status: "in_flight"` (latest-line-wins projection)

### Requirement: Config schema with safe defaults

The repository SHALL include `config/auto-apply-policy.example.yml` documenting every gate parameter with inline comments. The example file SHALL use defaults that effectively disable auto-apply. The user SHALL opt in by copying to `config/auto-apply-policy.yml` (gitignored) and editing values.

#### Scenario: Example file uses disabled defaults

- **WHEN** a developer reads `config/auto-apply-policy.example.yml`
- **THEN** `auto_threshold` is `null`
- **AND** `daily_quota.total` is `0`
- **AND** every per-ATS quota is `0`

#### Scenario: Live config file is gitignored

- **WHEN** the user creates `config/auto-apply-policy.yml`
- **THEN** `git status` does not list it as a tracked file
