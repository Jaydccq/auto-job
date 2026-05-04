## Context

Phase 4 is the highest-risk capability in the auto-job roadmap. Account creation:
1. Submits NEW PII to a third-party site (different from re-using an existing account)
2. Triggers identity-verification ceremony (typically email + sometimes SMS)
3. Creates a stable account → fingerprint binding the bot detector can use to permanently flag this device
4. Often violates ATS Terms of Service explicitly (most ATS prohibit automated account creation)

This change is built defensively because of those risks:
- Hard prerequisite: signed `RISK_ACK.md` in the private repo
- Hard prerequisite: Phase 5 telemetry already running and visible to operator
- Quota defaults zero (user opts in per-ATS per-week)
- Per-signup snapshot capture for forensics
- Composes with Phase 3 email-bot for the verification step (no new email logic)
- Composes with Phase 2C approval flow for the post-signup apply (no separate submit path)

## Goals / Non-Goals

**Goals:**
- One signup adapter per supported ATS that fills the create-account form
- Vault integration: every new account's credentials saved BEFORE submitting the form (so we never end up with an account whose password we lost)
- `runSignupThenApply` chains signup → email verify → apply into one orchestrated path
- Dashboard visibility: every signup is a recorded telemetry event
- RISK_ACK gate: code refuses to call `runSignupFlow` without the acknowledgment file

**Non-Goals:**
- Universal "any signup form" support — per-ATS adapters only (4 supported)
- SMS verification handling (out of scope; if an ATS requires SMS, signup fails clearly and operator handles manually)
- Account deletion / cleanup automation
- Multi-email-account routing (one Gmail OAuth account, period)
- Bypassing CAPTCHA (consistent with rest of project: CAPTCHA → fail loudly + cooldown)
- Linkedin auto-signup (LinkedIn is excluded entirely from signup automation due to extreme detection sensitivity)

## Decisions

### D1 — RISK_ACK.md is a hard runtime gate, not just docs

`signupGate` reads `RISK_ACK.md` from the repo root. If the file doesn't exist OR doesn't contain the literal sentence "I, <NAME>, acknowledge the risks documented in `docs/superpowers/specs/2026-05-04-auto-job-architecture-design.md` (sections A2, A7, Threat Model §3)", the gate refuses. There's no env var override.

The check happens at every `runSignupFlow` call, not just at startup, so accidentally deleting the file mid-run would stop further signups.

### D2 — Vault.put BEFORE form submit

Sequence:
1. Generate or accept user-supplied password
2. `vaultPut(vaultKey(ats, tenant), email, password)` — save FIRST
3. Fill form
4. Submit (with `allowSubmit: true` — single call site mirrors Phase 2C)
5. Record outcome

If step 4 fails, we still have the credential in the vault and can retry. If we did the order in reverse and form submit succeeded but vault.put threw, we'd have created an unrecoverable account.

### D3 — Email always uses the user's main address (per-ATS aliases optional)

Default: `loadApplicationData().email` is the address used for all signups. The same email registers across many ATS — mirrors normal human behavior.

Optional: `signup_email_alias_pattern: "user+{ats}@gmail.com"` in policy — generates Gmail aliases per ATS for inbox segregation. If used, the email-bot's Gmail query needs the alias domain too.

### D4 — Verification handoff via shared message-id

`runSignupFlow` returns `{requiresEmailVerification, expectedSubject, expectedFromHostPattern}`. The orchestrator polls the Phase 3 email-bot's `pollVerificationEmails` filtered to those hints; first match within a 5-minute timeout wins. If no email arrives in 5 minutes, status `signup_pending_email` (operator can manually trigger later).

### D5 — Signup quota in WEEKS, not days

Daily quotas don't make sense for signups (you don't sign up for the same company twice). Weekly quotas reflect "how many new companies do I want to apply to this week". Default 0 (disabled). Recommended starting value when opting in: 2-3 per ATS per week.

### D6 — No LinkedIn signup support

LinkedIn flags new-account creation aggressively. Even our humanized flow is unlikely to pass their gauntlet, and being flagged on LinkedIn often cascades to other sites (LinkedIn auth is widely federated). Architecture explicitly excludes.

### D7 — Per-signup snapshot directory mirrors Phase 2B

`data/signup-snapshots/{ats}-{tenant}-{timestamp}/` with `pre-form.html`, `pre-form.png`, `filled-form.html`, `filled-form.png`, `post-submit.html`, `post-submit.png`, `meta.json`, `data.json` (PII redacted, password ALWAYS redacted).

## Risks / Trade-offs

- **ToS violation severity** — most ATS forbid auto-signup. This is the user's explicit choice (architecture A2 + RISK_ACK). Documented; no further mitigation possible.
- **Identity binding to fingerprint** — once an account is created, the fingerprint is logged. If detected later, the account can be banned + IP / device blacklisted. Mitigation: `signupGate` enforces low quota + telemetry-driven cooldown.
- **Email alias patterns flag suspicion** — Gmail aliases (`+ats`) are sometimes flagged by ATS as "throwaway emails". Mitigation: alias pattern is opt-in; default uses base email.
- **Verification email never arrives** — Gmail spam filter, ATS bug, IP block. Mitigation: 5-minute timeout transitions to `signup_pending_email`; operator can intervene.
- **Account-creation form requires phone verification** — bot can't handle SMS. Mitigation: detect phone-verification page, fail with `RequiresPhoneVerificationError`, mark status `signup_blocked`.
- **Operator forgets RISK_ACK exists** — CLI prints "RISK_ACK.md required: see template" with copyable instruction. The error is loud.

## Migration Plan

Pure additive new package + new statuses + new orchestrator. Existing apply-queue and Phase 2C approval flow continue working unchanged for entries where the user already has accounts.

For entries where the user lacks an account, the runner detects "no vault credential" and routes to `runSignupThenApply`. Operator can opt out per-entry via `auto-apply-approve skip <id> --reason "no signup wanted"`.

Rollback: revert removes the signup package + CLI. Accounts created during the live period remain on the ATS sites (manual cleanup needed if operator wants to remove them).

## Open Questions

None at design time. Future Phase 4+1 may add per-tenant signup-form detection (currently we hardcode per-ATS form structure).
