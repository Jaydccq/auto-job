## 0. Pre-flight: RISK_ACK template + repo prep

- [x] 0.1 Create `RISK_ACK.example.md` template in private repo root with the required sentence and clear instructions
- [x] 0.2 Document in private repo README that Phase 4 requires user to copy + sign `RISK_ACK.example.md` → `RISK_ACK.md` before merging this PR
- [x] 0.3 Verify `add-risk-telemetry` is merged into private/main BEFORE starting this change (prerequisite per architecture A5)

## 1. Workspace skeleton

- [x] 1.1 `packages/auto-signup/` with src/test/package.json/tsconfig/vitest config
- [x] 1.2 Deps: `@auto-job/browser`, `@auto-job/humanize`, `@auto-job/credentials`, `@auto-job/risk-telemetry`, `@auto-job/email-bot`, `@auto-job/auto-apply`
- [x] 1.3 pnpm install at root

## 2. Core types + interface + errors

- [x] 2.1 `src/types.ts` — `SignupFlow<TFormData>`, `SignupRequest`, `SignupResult`
- [x] 2.2 `src/errors.ts` — `RiskAckMissingError`, `SignupQuotaExceededError`, `RequiresPhoneVerificationError`, `SignupSubmitFailedError`, `UnsupportedSignupATSError`
- [x] 2.3 `src/risk-ack.ts` — `verifyRiskAck(opts?)` reads `RISK_ACK.md` and validates the required sentence
- [x] 2.4 `src/signup-gate.ts` — `signupGate(request)` chains: verifyRiskAck → quota check → cooldown check (via @auto-job/risk-telemetry isInCooldown)

## 3. Per-ATS signup adapters

- [x] 3.1 `src/greenhouse/signup.ts` — adapter for greenhouse-hosted "create account" form
- [x] 3.2 `src/lever/signup.ts`
- [x] 3.3 `src/ashby/signup.ts`
- [x] 3.4 `src/workday/signup.ts` — Workday "Create Account" wizard (often multi-step)
- [x] 3.5 `src/registry.ts` — `signupFlowFor(ats)` factory; throws for icims, linkedin, unknown

## 4. Vault-first signup orchestrator

- [x] 4.1 `src/run.ts` — `runSignupFlow(controller, request, opts?)`:
  - signupGate → throw if not OK
  - Generate or accept password (per request)
  - **vaultPut FIRST** before any form submit
  - Open tab, identify form, humanize-fill
  - Submit (single allowSubmit:true call site, defended by gate)
  - Detect phone-verification page → RequiresPhoneVerificationError + snapshot
  - Capture pre-form / filled-form / post-submit snapshots
  - recordSignupOutcome telemetry event
  - Return `{accountCreatedAt, vaultRef, requiresEmailVerification, expectedSubject?, expectedFromHostPattern?}`

## 5. Combined orchestrator: signup → verify → apply

- [x] 5.1 `src/run-then-apply.ts` — `runSignupThenApply(controller, request, opts?)`:
  - markStatus `signup_required` initial
  - call runSignupFlow → markStatus `account_created`
  - if requiresEmailVerification: poll Phase 3 email-bot (max 5 min) → on success: verifyLink + markStatus `account_verified`; on timeout: markStatus `signup_pending_email`
  - if account_verified: hand off to Phase 2C `runApplyFlow` (allowSubmit handled by Phase 2C approval flow — auto-signup does NOT auto-approve apply submission unless `auto_approve_after_signup: true` in policy, default false)

## 6. Apply-queue runner integration

- [x] 6.1 Edit `apps/server/src/apply-queue/runner.ts` — `processNextApplyEntry` checks if entry has vault credential; if not AND signup_quota > 0 AND RISK_ACK valid, route through `runSignupThenApply` instead of `runApplyFlow`
- [x] 6.2 Add new statuses to types.ts: `signup_required`, `account_created`, `account_verified`, `signup_pending_email`, `signup_blocked`
- [x] 6.3 Update gate.ts to skip entries in `signup_pending_email` or `signup_blocked` (don't reprocess)

## 7. CLI

- [x] 7.1 `scripts/auto-signup.ts` with `list / dry-run / run / sweep` subcommands
- [x] 7.2 npm script `auto-signup` in root package.json

## 8. Tests

- [x] 8.1 RISK_ACK gate tests (missing file, missing sentence, present sentence with various names)
- [x] 8.2 signupGate tests (quota exceeded, cooldown active, all clear)
- [x] 8.3 Per-ATS signup adapter tests (mock detectsForm, fillForm)
- [x] 8.4 Vault-FIRST order test (mock vault throws → submit never called)
- [x] 8.5 runSignupThenApply integration test with mocked email-bot + apply
- [x] 8.6 Phone-verification detection test (synthetic HTML with SMS widget)
- [x] 8.7 dry-run subcommand test (no submit; snapshot captured)

## 9. Verify + commit + push private + open private PR

- [x] 9.1 npm run verify passes; new package wired into pipeline
- [x] 9.2 .gitignore: data/signup-snapshots/, RISK_ACK.md (the LIVE one — template stays in repo), package node_modules/dist
- [x] 9.3 **Author of PR commits a signed RISK_ACK.md** to the branch — this PR cannot merge without it
- [x] 9.4 Commit on branch `feat/auto-signup` (private)
- [x] 9.5 Push private; open PR
- [x] 9.6 PR description includes a checklist confirming Phase 5 telemetry is already merged and active
