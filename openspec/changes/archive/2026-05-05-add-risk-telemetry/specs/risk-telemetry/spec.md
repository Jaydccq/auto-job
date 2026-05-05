## ADDED Requirements

### Requirement: `@auto-job/risk-telemetry` workspace package

The system SHALL provide a private workspace package `packages/risk-telemetry/` exposing:

- `recordScanResult(input)`, `recordFillOutcome(input)`, `recordSubmitOutcome(input)`, `recordVerifyLinkOutcome(input)`, `recordDetectionSignal(input)` — append events to `data/risk-events.jsonl`
- `analyzeForDetection(snapshot)` — heuristic detection rules return `{signal, evidence} | null`
- `evaluateCooldowns(opts?)` — scan recent events, transition ATS into cooldown when thresholds breach
- `isInCooldown(ats, opts?)` — query the cooldown registry
- `loadEvents(opts?)`, `loadCooldowns(opts?)` — readers for dashboard

#### Scenario: Importable from server + auto-apply + email-bot

- **WHEN** any of those packages declares `import { recordFillOutcome } from "@auto-job/risk-telemetry"`
- **THEN** typecheck passes

### Requirement: Append-only event log with stable schema

`data/risk-events.jsonl` SHALL hold immutable events with shape `{timestamp, kind, ats, tenant?, signal?, severity, source, note?}`. Every recorder SHALL append exactly one line per call (atomic via O_APPEND).

#### Scenario: Each record* call appends one line

- **WHEN** `recordFillOutcome({ats: "greenhouse", tenant: "stripe", success: true})` is called
- **THEN** the events file gains exactly one new line representing the call

#### Scenario: Event lines are valid JSON

- **WHEN** any recorder is called
- **THEN** the appended line parses as JSON and contains `timestamp`, `kind`, `ats`, `severity`, `source`

### Requirement: Heuristic detection rules

`analyzeForDetection(snapshot)` SHALL evaluate the following rules in order and return the first matching signal:

1. CAPTCHA element present (selectors: `iframe[src*="recaptcha"]`, `[class*="h-captcha"]`, `[id*="captcha" i]`) → `captcha`
2. HTTP status 403 or 429 captured for the main resource → `http_403` or `http_429`
3. Body text matches `/access denied|verification required|are you human|please confirm/i` → `verification_required`
4. Final URL host differs from expected origin AND matches a login pattern (`/login`, `/signin`, `/auth`) → `login_redirect`
5. Form had ≥3 missing standard fields → `silent_degradation`

Returns `null` if no rule matched.

#### Scenario: CAPTCHA element triggers captcha signal

- **WHEN** snapshot HTML contains `<iframe src="https://www.recaptcha.net/...">`
- **AND** `analyzeForDetection(snapshot)` is called
- **THEN** the result is `{signal: "captcha", evidence: <selector match>}`

#### Scenario: 403 status triggers http_403

- **WHEN** snapshot's main response status is 403
- **THEN** the result is `{signal: "http_403", evidence: "HTTP 403"}`

#### Scenario: Plain success page returns null

- **WHEN** snapshot HTML contains a normal application form with no detection signals
- **THEN** `analyzeForDetection` returns `null`

### Requirement: Automated cooldown transitions

`evaluateCooldowns(opts?)` SHALL read events from the last 7 days, group by `ats`, count signals per kind, and SHALL transition an ATS into cooldown when ANY signal of severity ≥ "warning" appears within the lookback window. The cooldown duration depends on the signal kind (per the policy table in design.md).

The cooldown registry `data/risk-cooldowns.jsonl` SHALL be append-only with `{ats, started_at, ends_at, reason, source}`. The most recent line per `ats` wins.

#### Scenario: One captcha event triggers 168h cooldown

- **WHEN** an event `{kind: "detection_signal", ats: "workday", signal: "captcha"}` is recorded at time T
- **AND** `evaluateCooldowns()` runs subsequently
- **THEN** the cooldown registry has an entry for `workday` with `ends_at` ≥ T + 168h

#### Scenario: silent_degradation triggers shorter 24h cooldown

- **WHEN** a `silent_degradation` event is recorded for `ats: "lever"`
- **AND** `evaluateCooldowns()` runs
- **THEN** the lever cooldown ends within 24h ± 1h of the event

### Requirement: `isInCooldown(ats)` query

`isInCooldown(ats, opts?)` SHALL return `true` if the cooldown registry has an active (non-expired) entry for the given ATS, `false` otherwise.

#### Scenario: Active cooldown returns true

- **WHEN** the registry has `{ats: "workday", ends_at: <future>}`
- **AND** `isInCooldown("workday")` is called
- **THEN** the result is `true`

#### Scenario: Expired cooldown returns false

- **WHEN** the registry has `{ats: "lever", ends_at: <past>}`
- **THEN** `isInCooldown("lever")` returns `false`

### Requirement: applyGate uses telemetry as cooldown source

The `applyGate` function (from Phase 2A) SHALL be modified to call `isInCooldown(ats)` from `@auto-job/risk-telemetry` instead of computing cooldown from queue projections. If the telemetry registry is empty (e.g., fresh install), `applyGate` SHALL fall back to the queue-projection logic for backward compatibility.

#### Scenario: Telemetry cooldown blocks enqueue

- **WHEN** the telemetry registry has an active cooldown for `greenhouse`
- **AND** `applyGate(eval, policy, queue)` is called for a greenhouse evaluation
- **THEN** the result is `{enqueue: false, reason: "ats greenhouse in cooldown until ..."}`

#### Scenario: Empty registry falls back to queue logic

- **WHEN** `data/risk-cooldowns.jsonl` does not exist
- **AND** the queue contains a `status:detected` entry for greenhouse within the last 7 days
- **THEN** `applyGate` still recognizes the cooldown via queue projection

### Requirement: Dashboard CLI

The repository SHALL provide `scripts/risk-dashboard.ts` (npm script: `risk-dashboard`) with subcommands:

- `summary` — print a per-ATS table for last 7 days: scans / fills / submits / verifies / detections / current cooldown status
- `events --ats <id> --since <duration>` — print raw event log slice
- `cooldowns` — print active cooldowns with remaining hours
- `force-cooldown <ats> --hours <n>` — manually inject a cooldown entry tagged `source: "manual"`

Unknown args → exit 2 with help.

#### Scenario: summary table has one row per ATS that has any events

- **WHEN** the event log contains events for greenhouse, workday, lever
- **AND** `risk-dashboard summary` runs
- **THEN** the printed table has rows for those 3 ATS (plus any others with events)

#### Scenario: force-cooldown injects a manual entry

- **WHEN** `risk-dashboard force-cooldown workday --hours 48` runs
- **THEN** the cooldown registry gains a new entry for workday with `source: "manual"` and `ends_at` ≈ now + 48h
- **AND** subsequent `isInCooldown("workday")` returns `true`
