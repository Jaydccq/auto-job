## Why

Architecture decision **A5 mandates Phase 5 ships before Phase 4**: don't enable the highest-risk action (auto-signup) without monitoring already in place. This change builds the risk-telemetry layer that observes every auto-* operation, counts detection signals per ATS / per host / per day, and automatically transitions the system into cooldown when thresholds breach.

Phase 5 also gives the user a **dashboard widget** (CLI table for now) to see "what's the detection rate on Workday this week?" before deciding whether to lift quotas.

The Phase 2A `applyGate` already has cooldown LOGIC; what was missing is the SIGNAL collection that triggers cooldown transitions. Phase 5 closes that loop.

## What Changes

- **NEW** workspace package `packages/risk-telemetry/` (`@auto-job/risk-telemetry`)
  - Append-only event log: `data/risk-events.jsonl` (gitignored)
  - Event schema: `{timestamp, kind, ats, tenant?, signal?, severity, source: "scan" | "fill" | "submit" | "verify-link", note?}`
  - Recorders: `recordScanResult`, `recordFillOutcome`, `recordSubmitOutcome`, `recordVerifyLinkOutcome`, `recordDetectionSignal`
- **NEW** detection rules:
  - `analyzeForDetection(snapshot)` — runs heuristic checks on a captured fill/submit snapshot (presence of CAPTCHA element, "Access Denied", 403 status, "Verification Required" text, login-redirect URL pattern)
  - Returns `{ signal: "captcha"|"http_403"|"verification_required"|"login_redirect"|null, evidence: string }`
- **NEW** cooldown automator:
  - `evaluateCooldowns()` reads recent events, computes per-ATS detection rate, transitions ATS into `cooldown` registry when thresholds breach
  - Cooldown registry: `data/risk-cooldowns.jsonl` (also gitignored) — entries with `{ats, started_at, ends_at, reason}`
  - `isInCooldown(ats)` query — used by Phase 2A `applyGate` (extension, not refactor) and by Phase 3 email-bot
- **NEW** dashboard CLI `scripts/risk-dashboard.ts`:
  - `risk-dashboard summary` — table of last-7-days events per ATS: scans / fills / submits / verifies / detections / current cooldown status
  - `risk-dashboard events --ats <id> --since 7d` — raw event log slice
  - `risk-dashboard cooldowns` — current active cooldowns with remaining hours
  - `risk-dashboard force-cooldown <ats> --hours <n>` — manual cooldown injection (rare ops use)
- **NEW** integration hooks:
  - `runApplyFlow` (Phase 2B) calls `recordFillOutcome` after fill, `recordSubmitOutcome` after submit (when applicable)
  - `verifyLink` (Phase 3) calls `recordVerifyLinkOutcome`
  - All scan scripts (`*-scan.ts`) call `recordScanResult` after the scan completes
- **EXTENDED** `applyGate` (Phase 2A) reads `isInCooldown` from telemetry instead of computing cooldown from queue projections (cleaner separation; queue projections still drive quota counts)

## Capabilities

### New Capabilities

- `risk-telemetry`: per-ATS / per-tenant event log + detection-signal recognition + auto-cooldown transitions + dashboard CLI

### Modified Capabilities

- `apply-queue` (Phase 2A): `applyGate` cooldown source switches from queue-projection to telemetry registry (semantics same; data source cleaner)

## Impact

- **Affected code:** `packages/risk-telemetry/` (new), `apps/server/src/apply-queue/gate.ts` (modify cooldown query), `packages/auto-apply/src/run.ts` (add recordFillOutcome / recordSubmitOutcome calls), `packages/email-bot/src/verify-link.ts` (add recordVerifyLinkOutcome), `scripts/risk-dashboard.ts` (new), all `scripts/*-scan.ts` (add recordScanResult)
- **Dependencies:** none new
- **External systems:** none — purely local telemetry
- **Reversibility:** revert removes the package + dashboard; `applyGate` reverts to queue-projection cooldown
- **Repo:** **PRIVATE**
- **Order constraint:** This change ships **before** `add-auto-signup` per architecture decision A5
