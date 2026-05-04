## Why

Phase 4 closes the loop on the user's stated goal: "complete all job application operations" — including creating new accounts on companies' application portals where the user has none yet. This is the **highest-risk** phase: account creation triggers identity verification, captcha, and cross-site bot-fingerprint sharing more aggressively than any other operation.

Per architecture decision A5, this change ships **after Phase 5 (risk-telemetry)** so that:
1. Detection signals from auto-signup are recorded immediately
2. Cooldown automation is already wired — first signal triggers 168h ATS pause without manual intervention
3. The dashboard makes the operator visible to their own risk surface

Per Phase 1 anchor decision A1 + the architecture spec's Phase 4 entry, **this change requires explicit user-signed acknowledgment** in the private repo's README (or a dedicated `RISK_ACK.md`) before any production usage.

## What Changes

- **NEW** workspace package `packages/auto-signup/` (`@auto-job/auto-signup`)
  - `SignupFlow<TFormData>` interface — mirror of `ApplyFlow`, but for the signup form rather than the application form
  - Per-ATS adapters: `greenhouse-signup`, `lever-signup`, `ashby-signup`, `workday-signup` (each handles the "create account" form before the apply form)
  - `signupGate(request)` — refuses unless `RISK_ACK.md` exists AND today's signup count is under user-set quota AND the ATS is not in cooldown
  - `runSignupFlow(controller, request, opts)` — fills signup form, vault-stores the new password (vault.put with user-supplied OR vaultGenerate based on request), returns `{accountCreatedAt, vaultRef, requiresEmailVerification}`
  - When `requiresEmailVerification: true`, hands off the message id (or expected email subject pattern) to Phase 3 email-bot for verification handling
- **NEW** `RISK_ACK.md` template in private repo root — text file the user must edit and sign with their name + date acknowledging the risks listed
- **NEW** signup-quota config in `auto-apply-policy.yml`:
  - `signup_quota: { total_per_week: 0, per_ats_per_week: { ... all 0 } }` — defaults disabled
  - `signup_password_policy: { reuse_user_supplied: true, fallback_to_vault_generate: true }` — user explicitly chose A3 "same password reuse OK"
- **NEW** `runSignupThenApply(controller, request)` orchestrator that combines:
  1. signup → markStatus `account_created`
  2. wait for verification email (poll Phase 3 bot)
  3. verify-link → markStatus `account_verified`
  4. login + apply (re-uses Phase 2C `processApprovedEntry` flow)
- **NEW** CLI `scripts/auto-signup.ts list/run/dry-run/sweep` — lists candidate signups based on apply-queue entries that lack a vault credential
- Tests: signup-gate matrix (RISK_ACK presence, quota, cooldown); per-ATS signup adapter selectors; password reuse vs generate; `runSignupThenApply` orchestration with mocked Phase 3 + Phase 2C

## Capabilities

### New Capabilities

- `auto-signup`: per-ATS account creation flows + quota gate + password vault integration + Phase 3 email-verification handoff + Phase 2C apply handoff

### Modified Capabilities

- `apply-queue`: add status `signup_required` (set when an applicable apply entry has no vault credential), `account_created`, `account_verified`
- `auto-apply` (Phase 2B): orchestrator detects `signup_required` and routes through `runSignupThenApply`

## Impact

- **Affected code:** `packages/auto-signup/` (new), apply-queue types extension, runner extension, `RISK_ACK.md` (new template)
- **Dependencies:** `@auto-job/browser`, `@auto-job/humanize`, `@auto-job/credentials`, `@auto-job/risk-telemetry`, `@auto-job/email-bot`, `@auto-job/auto-apply`
- **External systems:** ATS signup endpoints (HIGHEST sensitivity)
- **Reversibility:** revert removes the signup package + CLI; existing accounts created via signup are NOT auto-deleted (user must manually delete from each ATS)
- **Repo:** **PRIVATE**
- **Order constraint:** ships AFTER `add-risk-telemetry` (architecture A5)
- **User informed acknowledgment required** before merge: signed `RISK_ACK.md` in the private repo committed alongside this change
