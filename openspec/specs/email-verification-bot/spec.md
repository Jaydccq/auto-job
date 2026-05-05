# email-verification-bot Specification

## Purpose
TBD - created by archiving change add-email-verification-bot. Update Purpose after archive.
## Requirements
### Requirement: `@auto-job/email-bot` workspace package

The system SHALL provide a private workspace package `packages/email-bot/` exposing:

- `pollVerificationEmails(opts?)` — query Gmail for ATS verification emails matching the allowlist
- `verifyLink(controller, url, opts?)` — open URL in dedicated Chrome via humanized tab, click confirm button, capture snapshots
- `processNextVerificationEmail(controller)` — single-pass orchestrator: poll → pick first → verifyLink → label as processed
- `loadAllowlist(opts?)` — read `config/email-verification-allowlist.yml`
- Errors: `EmailBotDisabledError` (no allowlist), `LinkHostNotAllowedError`, `MultiLinkAmbiguousError`, `ConfirmButtonNotFoundError`

#### Scenario: Importable from server

- **WHEN** server code declares `import { processNextVerificationEmail } from "@auto-job/email-bot"`
- **THEN** typecheck passes

### Requirement: Allowlist-driven host validation; defaults empty (disabled)

`verifyLink` SHALL refuse any URL whose hostname is not present in `loadAllowlist()`. The allowlist file SHALL ship as `.example.yml` only; the live `config/email-verification-allowlist.yml` SHALL be gitignored. Loading a missing live file returns an empty allowlist (= bot effectively disabled).

#### Scenario: Empty allowlist disables all clicks

- **WHEN** no `config/email-verification-allowlist.yml` exists
- **AND** `verifyLink(controller, "https://www.workday.com/verify?token=abc")` is called
- **THEN** the call throws `EmailBotDisabledError`

#### Scenario: Host not in allowlist throws

- **WHEN** allowlist contains `myworkdayjobs.com` but not `evil-clone.com`
- **AND** `verifyLink(controller, "https://evil-clone.com/verify?...")` is called
- **THEN** the call throws `LinkHostNotAllowedError` carrying the offending host

### Requirement: Single-link policy

`extractVerificationLink(emailBody)` SHALL identify exactly ONE link to an allowlisted host. If 0 or 2+ allowlisted-host links are present, the function SHALL throw `MultiLinkAmbiguousError` with the candidate URLs listed.

#### Scenario: Multiple allowlisted-host links throws

- **WHEN** an email body contains 2 distinct links both pointing at `myworkdayjobs.com` paths
- **AND** the bot tries to extract a single link
- **THEN** `MultiLinkAmbiguousError` is thrown
- **AND** the email is NOT clicked

### Requirement: Humanized 8+ second reading delay before click

`verifyLink` SHALL apply a minimum 8-second pre-click delay PLUS the standard humanizer reading delay computed from the confirm-button text. Total delay = `max(8000, readingDelay(buttonText))`.

#### Scenario: Reading delay enforced at minimum 8 seconds

- **WHEN** `verifyLink` runs against a URL whose confirm button has text "Confirm" (6 chars → ~360ms reading delay)
- **THEN** the time between page-load and click is ≥ 8000ms (verifiable via test timing, allowing 200ms tolerance for instrumentation jitter)

### Requirement: Per-host confirm-button selector with fallback

Allowlist entries MAY specify `confirm_button_selector: "..."` per host. When unset, the bot SHALL try generic fallbacks in order: `button:has-text("Confirm")`, `button:has-text("Activate")`, `button:has-text("Verify")`, `a:has-text("Confirm")`, `button[data-action="confirm"]`, `[role="button"]:has-text("Confirm")`. If no selector matches, throw `ConfirmButtonNotFoundError`.

#### Scenario: Generic fallback finds button

- **WHEN** the verification page renders `<button>Confirm</button>` and the allowlist has no per-host selector
- **THEN** the click targets the matching button via the generic fallback

#### Scenario: No matching button throws

- **WHEN** the page has no element matching any fallback and no per-host selector helps
- **THEN** `ConfirmButtonNotFoundError` is thrown
- **AND** a snapshot is captured for review

### Requirement: Gmail label as idempotency primitive

The bot SHALL apply Gmail label `auto-job/processed` to every email it acts on (creating the label on first run if absent). The polling query SHALL exclude this label so messages are not re-processed.

#### Scenario: Processed email is labeled

- **WHEN** `processNextVerificationEmail` successfully clicks the confirm button for message id `abc123`
- **THEN** message `abc123` carries the `auto-job/processed` label after the call

#### Scenario: Already-processed emails skipped on next poll

- **WHEN** the previous run labeled an email as `auto-job/processed`
- **AND** `pollVerificationEmails` runs again
- **THEN** that email is NOT in the returned list

### Requirement: Snapshot capture pre + post click

For every `verifyLink` invocation, the system SHALL write `data/email-bot-snapshots/{messageId}-{timestamp}/` containing `pre-click.html`, `pre-click.png`, `post-click.html`, `post-click.png`, `meta.json` (sender, subject, extracted URL, button selector, click timing). Snapshots are gitignored.

#### Scenario: Snapshot directory created with all 5 files

- **WHEN** `verifyLink` succeeds end-to-end
- **THEN** the snapshot directory exists with the five files

### Requirement: CLI

The repository SHALL provide `scripts/email-bot.ts` (npm script `email-bot`) exposing subcommands:

- `list` — print pending verification emails (allowlist-matching, not yet processed)
- `run` — process the next pending email; print result
- `sweep` — process up to N pending emails (configurable, default 5); respects per-host cooldown
- `allowlist` — print effective allowlist with sources

Unknown subcommand or missing args → exit 2 with help.

#### Scenario: list shows pending emails

- **WHEN** Gmail has 2 emails matching the allowlist that lack `auto-job/processed` label
- **AND** `email-bot list` runs
- **THEN** both are printed with sender / subject / URL host

