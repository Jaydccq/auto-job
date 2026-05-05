## 1. Workspace skeleton

- [x] 1.1 `packages/risk-telemetry/` with src/test/package.json/tsconfig/vitest config
- [x] 1.2 No new external deps; pnpm install at root

## 2. Event log

- [x] 2.1 `src/types.ts` — `RiskEvent` type, signal kinds enum, severity enum
- [x] 2.2 `src/events.ts` — `recordEvent(event, opts?)` append-only writer; `loadEvents(opts?)` reader with optional filters (ats, kind, since)
- [x] 2.3 Convenience recorders: `recordScanResult`, `recordFillOutcome`, `recordSubmitOutcome`, `recordVerifyLinkOutcome`, `recordDetectionSignal`
- [x] 2.4 Unit tests: append + read round-trip, filter semantics, atomic concurrent appends

## 3. Detection rules

- [x] 3.1 `src/analyze.ts` — `analyzeForDetection(snapshot)` with the 5 heuristic rules (captcha element, http 403/429, verification text, login redirect, silent degradation)
- [x] 3.2 Snapshot input shape: `{html: string, statusCode: number, finalUrl: string, expectedOrigin?: string, formStandardFieldsMissing?: number}`
- [x] 3.3 Returns `{signal, evidence}` or null
- [x] 3.4 Unit tests with synthetic snapshots per rule

## 4. Cooldown automator

- [x] 4.1 `src/cooldowns.ts` — `loadCooldowns(opts?)`, `recordCooldown(entry)`, `isInCooldown(ats, opts?)`
- [x] 4.2 Cooldown durations from config (loadPolicy from existing apply-queue policy with new signal-cooldown subsection)
- [x] 4.3 `evaluateCooldowns(opts?)` reads recent events, computes per-ATS detection counts, writes new cooldown entries when thresholds breach
- [x] 4.4 `loadPolicy` extension: add `signal_cooldowns: { captcha: 168, http_403: 168, http_429: 168, verification_required: 72, login_redirect: 168, silent_degradation: 24 }`
- [x] 4.5 Unit tests: each signal triggers correct cooldown duration; expired entries don't block; active entries do

## 5. applyGate integration

- [x] 5.1 Edit `apps/server/src/apply-queue/gate.ts` — replace cooldown computation with `isInCooldown(ats)` from telemetry
- [x] 5.2 Fallback to queue-projection logic when telemetry registry is empty (smooth migration)
- [x] 5.3 Update gate.test.ts — telemetry-driven cooldown scenario; queue-fallback scenario

## 6. Per-package recorder integration

- [x] 6.1 `packages/auto-apply/src/run.ts` — call `recordFillOutcome` after fill, `recordSubmitOutcome` after submit (when applicable)
- [x] 6.2 `packages/auto-apply/src/run.ts` — on caught DetectionSignalError, also call `recordDetectionSignal`
- [x] 6.3 `packages/email-bot/src/verify-link.ts` — call `recordVerifyLinkOutcome` and `recordDetectionSignal` as appropriate
- [x] 6.4 Each scan script (`scripts/*-scan.ts`) — call `recordScanResult` after scan completes (success or error)
- [x] 6.5 Update tests for each package to verify recorder calls (mock `@auto-job/risk-telemetry`)

## 7. Dashboard CLI

- [x] 7.1 `scripts/risk-dashboard.ts` with `summary / events / cooldowns / force-cooldown` subcommands
- [x] 7.2 Pretty-printed table output (no extra deps; manual ASCII formatting)
- [x] 7.3 npm script `risk-dashboard`

## 8. Verify + commit + push private + open private PR

- [x] 8.1 npm run verify passes; new package wired into pipeline
- [x] 8.2 .gitignore: data/risk-events.jsonl, data/risk-cooldowns.jsonl, package node_modules/dist
- [x] 8.3 Commit on branch `feat/risk-telemetry` (private)
- [x] 8.4 Push private; open PR
