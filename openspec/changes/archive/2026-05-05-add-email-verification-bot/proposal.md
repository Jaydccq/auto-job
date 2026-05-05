## Why

Some ATS send "Please verify your email" or "Confirm this device" links AFTER an existing user submits an application. Today the user has to switch to Gmail, find the email, click the link manually. Phase 3 automates the safe subset: the bot watches Gmail for verification emails matching ATS hostnames, opens the link in the dedicated profile via humanized navigation, and clicks the obvious "Confirm" / "Activate" button.

The boundary is **EXISTING accounts only**. Auto-signup and new-account verification are Phase 4. This change handles the case where the user already has an account but the ATS occasionally sends a re-verification email (common for Workday "is this you?" challenges and iCIMS device fingerprints).

## What Changes

- **NEW** workspace package `packages/email-bot/` (`@auto-job/email-bot`)
  - Reuses the existing Gmail OAuth pipeline (`config/gmail-oauth-token.json`, gitignored)
  - Polls Gmail with a narrow query: `newer_than:1h from:({allowed-ats-domains}) subject:(verify OR confirm OR activate OR "is this you")`
  - Per-email: extract single most-prominent link, validate hostname against allowlist, call `verifyLink(controller, link)`
- **NEW** allowlist `config/email-verification-allowlist.example.yml`:
  - Hostnames the bot is permitted to click. Default empty (= no clicks). User opts in by listing hosts.
  - Per-host: `auto-click: true|false` and `confirm-button-selector: "button[data-action='confirm']"` (overridable)
- **NEW** `verifyLink(controller, url, opts?)` orchestrator:
  - Validates URL host against allowlist → refuses with clear error otherwise
  - Opens link in tab, waits for page load + settle
  - Identifies the confirm/activate button via per-host selector (or generic fallbacks)
  - **Reading delay** (humanizer) before click — minimum 8 seconds so the bot looks like a careful human
  - Clicks via `HumanizedTab` (Bezier mouse, dwell) — `submit gate` is N/A here (link clicking, not form submitting)
  - Captures snapshot pre-click + post-click for audit
- **NEW** Gmail label `auto-job/processed` — every email the bot acts on gets this label so it never re-clicks the same link
- **NEW** runner: `processNextVerificationEmail(controller)` — single-pass scan + handle one email
- **NEW** CLI `scripts/email-bot.ts list/run/sweep`

## Capabilities

### New Capabilities

- `email-verification-bot`: Gmail-driven verification link clicker. Reads emails, validates host allowlist, opens via humanized navigation, clicks the obvious confirm button. Existing accounts only (NOT new-account signup verification — that's Phase 4).

### Modified Capabilities

(none — additive; reuses Gmail OAuth from existing `gmail-scan`)

## Impact

- **Affected code:** `packages/email-bot/` (new), `scripts/email-bot.ts` (new), `config/email-verification-allowlist.example.yml` (new)
- **Dependencies:** existing Gmail API client (already in repo), `@auto-job/browser`, `@auto-job/humanize`
- **External systems:** Gmail (read + label-write); ATS verification endpoints (HTTP click via humanized tab)
- **Reversibility:** revert removes the package + CLI; Gmail labels persist as historical record
- **Authoritative spec:** architecture spec Phase 3
- **Repo:** **PRIVATE**
