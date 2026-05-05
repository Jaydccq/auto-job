# auto-signup Specification

## Purpose
TBD - created by archiving change add-auto-signup. Update Purpose after archive.
## Requirements
### Requirement: `@auto-job/auto-signup` workspace package

The system SHALL provide a private workspace package `packages/auto-signup/` exposing:

- `SignupFlow<TFormData>` interface (mirror of `ApplyFlow`)
- Per-ATS adapter instances: `greenhouseSignupFlow`, `leverSignupFlow`, `ashbySignupFlow`, `workdaySignupFlow`
- `signupFlowFor(ats)` factory; throws `UnsupportedATSError` for icims/linkedin/unknown
- `runSignupFlow(controller, request, opts?)` — single signup orchestrator
- `runSignupThenApply(controller, request, opts?)` — combined signup → email verify → apply pipeline
- `signupGate(request)` — pre-action gate enforcing RISK_ACK + quota + cooldown
- Errors: `RiskAckMissingError`, `SignupQuotaExceededError`, `RequiresPhoneVerificationError`, `SignupSubmitFailedError`

LinkedIn is INTENTIONALLY excluded from supported signup ATS.

#### Scenario: signupFlowFor refuses LinkedIn

- **WHEN** `signupFlowFor("linkedin")` is called
- **THEN** the call throws `UnsupportedATSError` with a message indicating LinkedIn is excluded from auto-signup

### Requirement: RISK_ACK.md hard gate

`signupGate(request)` SHALL read `RISK_ACK.md` from the repository root and verify it contains the literal sentence:

```
I, <NAME>, acknowledge the risks documented in `docs/superpowers/specs/2026-05-04-auto-job-architecture-design.md` (sections A2, A7, Threat Model §3).
```

Where `<NAME>` is any non-empty string. If the file is missing or the sentence is not present, the gate SHALL throw `RiskAckMissingError` with a clear message including the path and the required sentence.

The check SHALL re-run on every `runSignupFlow` invocation (not cached).

#### Scenario: Missing RISK_ACK throws

- **WHEN** `RISK_ACK.md` does not exist in the repo root
- **AND** `runSignupFlow(controller, request)` is called
- **THEN** the call throws `RiskAckMissingError`
- **AND** no browser action occurs

#### Scenario: RISK_ACK without the required sentence throws

- **WHEN** `RISK_ACK.md` exists but lacks the required acknowledgment sentence
- **THEN** `signupGate` throws `RiskAckMissingError` with a message quoting the missing sentence

#### Scenario: RISK_ACK with the sentence passes the gate

- **WHEN** `RISK_ACK.md` contains the required sentence with `<NAME>` replaced by a non-empty value (e.g., "Hongxi Chen")
- **AND** other gate conditions (quota, cooldown) pass
- **THEN** `signupGate` returns `{enqueue: true}` (or equivalent OK signal)

### Requirement: Vault save BEFORE form submit

`runSignupFlow` SHALL call `vaultPut` (or `vaultGenerate`) BEFORE submitting the signup form. If form submission fails, the credential SHALL remain in the vault for retry. If vault save fails, the form SHALL NOT be submitted.

#### Scenario: Vault save precedes submit (verifiable via mock call order)

- **WHEN** `runSignupFlow` runs against a fakeTab + mocked vault
- **THEN** the mock vault's `put` method is called BEFORE any submit-related tab method
- **AND** if the vault put throws, no submit-related tab method is ever called

### Requirement: Weekly signup quotas; defaults zero

The `auto-apply-policy.yml` schema SHALL be extended with `signup_quota: { total_per_week: 0, per_ats_per_week: {...} }`. All defaults are 0 (disabled). The `signupGate` SHALL refuse with `SignupQuotaExceededError` if the per-ATS-per-week count of `account_created` events for the current ISO week is at or above the configured limit.

#### Scenario: Default policy disables all signups

- **WHEN** no `signup_quota` is configured
- **AND** `signupGate(request)` is called for any ATS
- **THEN** the call throws `SignupQuotaExceededError` (because per-ATS quota is 0)

#### Scenario: Signups counted by ISO week boundary

- **WHEN** policy allows `greenhouse: 2` per week and 2 `account_created` telemetry events for greenhouse exist this week
- **AND** `signupGate({ats: "greenhouse"})` is called
- **THEN** the call throws `SignupQuotaExceededError`

### Requirement: Phase 5 cooldown integration

`signupGate` SHALL refuse signups for ATS that are currently in cooldown per `@auto-job/risk-telemetry`'s `isInCooldown(ats)`. The error SHALL be `SignupQuotaExceededError` with reason `"ats <X> in cooldown until <ISO>"`.

#### Scenario: Cooldown blocks signup

- **WHEN** `isInCooldown("workday")` returns true
- **AND** `signupGate({ats: "workday"})` is called
- **THEN** the call throws with reason mentioning the cooldown end time

### Requirement: Email verification handoff via Phase 3

When `runSignupFlow` completes a signup that requires email verification, it SHALL return `{requiresEmailVerification: true, expectedSubject, expectedFromHostPattern}`. The `runSignupThenApply` orchestrator SHALL poll the Phase 3 email-bot's `pollVerificationEmails(filter)` and call `verifyLink` once a matching email arrives within a 5-minute timeout. On timeout, the apply-queue entry SHALL transition to status `signup_pending_email`.

#### Scenario: Successful end-to-end signup → verify → apply

- **WHEN** `runSignupThenApply` runs and signup succeeds
- **AND** the email-bot mock returns a matching verification email within 1 second
- **AND** verifyLink succeeds
- **AND** the subsequent apply succeeds
- **THEN** the apply-queue entry's final status is `submitted` (set by Phase 2C `processApprovedEntry`)

#### Scenario: Email verification timeout transitions to signup_pending_email

- **WHEN** signup succeeds but no matching email arrives in 5 minutes
- **THEN** the apply-queue entry's status is `signup_pending_email`
- **AND** the operator can later manually trigger verification via `email-bot run`

### Requirement: Snapshot capture for every signup

For every `runSignupFlow` call, the system SHALL write `data/signup-snapshots/{ats}-{tenant}-{timestamp}/` containing `pre-form.{html,png}`, `filled-form.{html,png}`, `post-submit.{html,png}`, `meta.json`, `data.json` (PII included, password ALWAYS redacted). Snapshots are gitignored.

#### Scenario: Snapshot directory has all 8 files

- **WHEN** `runSignupFlow` completes (success or failure)
- **THEN** the snapshot directory exists with all 8 expected files
- **AND** the password field in `data.json` is `<redacted>` regardless of vault interaction

### Requirement: Phone-verification detection bails cleanly

The signup flow SHALL detect pages that require phone (SMS) verification and SHALL fail with `RequiresPhoneVerificationError`. The apply-queue entry SHALL transition to `signup_blocked`.

#### Scenario: Phone verification detected

- **WHEN** the post-submit page contains a recognizable SMS-verification widget (heuristic: input with `type="tel"` named "verification_code" or text containing "we've sent a code to")
- **THEN** `RequiresPhoneVerificationError` is thrown and the snapshot directory captures the blocking state

### Requirement: New apply-queue statuses

The apply-queue type system SHALL be extended with statuses: `signup_required`, `account_created`, `account_verified`, `signup_pending_email`, `signup_blocked`.

#### Scenario: Type system exposes new statuses

- **WHEN** `ApplyStatus` is inspected after this change
- **THEN** it includes `signup_required`, `account_created`, `account_verified`, `signup_pending_email`, `signup_blocked`

### Requirement: CLI

The repository SHALL provide `scripts/auto-signup.ts` (npm script: `auto-signup`) with subcommands:

- `list` — print apply-queue entries with `signup_required` status
- `dry-run <id>` — run signup form fill but DO NOT submit (mirrors Phase 2B fill-only mode for safety)
- `run <id>` — invoke `runSignupThenApply` for the single id
- `sweep` — process up to N (configurable) entries; respects quotas + cooldowns

Unknown subcommand → exit 2 with help.

#### Scenario: dry-run never submits

- **WHEN** `auto-signup dry-run <id>` runs
- **THEN** the signup adapter's `submit` method is NOT called
- **AND** the snapshot directory captures the filled-form state but no post-submit state

