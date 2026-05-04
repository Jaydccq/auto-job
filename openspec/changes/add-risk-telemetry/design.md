## Context

Architecture A5 says "ship 5 before 4" because auto-signup is the highest-risk action: it creates a NEW account on a site, links it to your fingerprint, and triggers email-verification ceremony — all signals that bot-detection systems weight heavily. Without telemetry to observe failures, we'd be flying blind into the highest-risk operation.

Phase 5 is defensive infrastructure. It records every auto-action's outcome, recognizes detection signals, and pulls the cord (cooldown transition) before degradation cascades into a permanent device-fingerprint ban.

## Goals / Non-Goals

**Goals:**
- Single append-only event log records EVERY auto-* operation outcome
- Heuristic detection-signal recognition runs on captured snapshots (no extra network calls)
- Cooldown transitions are automatic + visible in the dashboard
- Dashboard CLI gives at-a-glance per-ATS health: detection rate, current cooldown, last action
- `applyGate` queries the cooldown registry — single source of truth

**Non-Goals:**
- Real-time streaming dashboard (CLI tables refresh on call)
- Cross-machine telemetry aggregation (single-user system)
- ML-based detection (heuristic rules only — easier to explain, audit, and adjust)
- Active anti-bot adversary detection (we only react to OUR actions' outcomes)
- Notification routing (no email/Slack alerts; user runs `risk-dashboard` themselves)

## Decisions

### D1 — JSONL event log; latest-line-wins NOT applicable here

Unlike the apply-queue (where status mutations override prior lines for the same id), telemetry events are immutable facts. Every line is a distinct event. Queries project by aggregating across lines (e.g., "count of `signal=captcha` events for `ats=workday` in last 7d").

### D2 — Heuristic detection-signal rules vs ML

Hardcoded rules:
1. CAPTCHA element present (selectors: iframe[src*="recaptcha"], div[class*="h-captcha"], etc.)
2. HTTP 403/429 status from main resource
3. Body text matches /access denied|verification required|are you human/i
4. Final URL after navigation matches a login pattern when expected to be on apply page
5. Form fill threw before completion (silent missing fields = degradation)

Each rule yields a labeled signal: `captcha`, `http_403`, `http_429`, `verification_required`, `login_redirect`, `silent_degradation`.

ML would need labeled training data and adds opacity. Heuristics are good-enough for our scale.

### D3 — Cooldown thresholds per signal type

| Signal | Cooldown |
|---|---|
| captcha | 168h (7d) |
| http_403, http_429 | 168h |
| verification_required | 72h (3d, milder) |
| login_redirect | 168h |
| silent_degradation | 24h (lightest — could be transient) |

Configurable in `config/auto-apply-policy.yml` per signal kind. Defaults conservative.

### D4 — Cooldown registry is source-of-truth, queue projection deprecated

Phase 2A's gate computed cooldown from queue projection (counted `status:detected` entries). That mixes "queue history" and "operational health". Phase 5 separates: queue tracks per-application work, telemetry tracks per-ATS health.

`applyGate` post-Phase-5 queries `isInCooldown(ats)` from telemetry. Queue projection still drives quota counts. Migration: existing Phase 2A `status:detected` entries are translated into telemetry events on first read (one-time replay).

### D5 — Dashboard CLI prints tables; no GUI

CLI is enough for solo operator. Future Phase 5+1 can build a web widget that calls the same data layer. Architecture preserves that path.

### D6 — Force-cooldown is intentional escape hatch

`risk-dashboard force-cooldown <ats> --hours <n>` lets the operator manually cooldown an ATS (e.g., "I noticed something weird, give me 2 days to investigate"). Records as a special event with `source: "manual"`. Removed when expired or overridden.

## Risks / Trade-offs

- **False positives in heuristics** — generic `verification required` text may appear in non-verification contexts. Mitigation: heuristic rules ship conservative; user can disable a rule via config.
- **Telemetry log unbounded growth** — JSONL grows forever. Mitigation: rotation script `risk-dashboard rotate` archives old events to compressed file; query layer reads both. (Not implemented in v1; manual rotation acceptable.)
- **Cooldown registry race** — two processes writing concurrently could interleave. Mitigation: append-only writes are POSIX-atomic; conflicts are advisory only (the cooldown is still in effect either way).
- **Operator force-cooldown overuse** — easy to over-pause. Mitigation: dashboard surfaces force-cooldowns prominently with "manual" tag; reviewer sees this in retrospectives.

## Migration Plan

Pure additive new package. Existing `applyGate` cooldown logic gets ONE LINE change to call `isInCooldown(ats)` from telemetry. Falls back to queue-projection if telemetry registry is empty (smooth migration).

## Open Questions

None at design time.
