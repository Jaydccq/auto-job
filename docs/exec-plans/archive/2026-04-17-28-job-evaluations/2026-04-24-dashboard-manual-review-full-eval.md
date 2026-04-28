# Dashboard Manual Review Full Evaluation

## Background

`newgrad_quick` writes `manual_review` as a quick-screen report decision while
the tracker row status remains `Evaluated`. The dashboard currently shows only
the tracker status, so users cannot see which `Evaluated` rows still require a
human full-evaluation decision.

## Goal

Expose quick-screen decisions in the dashboard tracker and add a row-level
button that queues a full evaluation for `manual_review` rows.

## Scope

- Parse report `**Decision:** ...` metadata into dashboard data.
- Add a tracker column for quick-screen decision.
- Add a server endpoint that queues full evaluation through the existing bridge.
- Add a tracker row button for `manual_review` rows and client-side polling.
- Update dashboard docs and run targeted verification.

## Assumptions

- Full evaluation means calling bridge `/v1/evaluate` without
  `evaluationMode: "newgrad_quick"`.
- The dashboard full-eval button requires both `npm run dashboard` and a
  running `npm run ext:bridge`; otherwise it should fail visibly instead of
  silently mutating files.
- Static `web/index.html` can show the new column but cannot queue full
  evaluation because it has no server token.

## Implementation Steps

1. Add report decision parsing.
   Verify: a known report such as `reports/358-flexport-2026-04-24.md` exposes
   `decision: "manual_review"` in dashboard data.
2. Add tracker UI column and full-eval action.
   Verify: `manual_review` tracker rows show the decision and a full evaluation
   button; non-manual rows do not show an enabled full-eval button.
3. Add dashboard server endpoint for full evaluation.
   Verify: endpoint validates row/report inputs and posts a default evaluation
   request to bridge.
4. Run targeted checks.
   Verify: dashboard build succeeds and targeted parser/API tests pass where
   available.

## Verification Approach

- `npm run dashboard:build`
- Focused Node checks against `web/build-dashboard.mjs`
- Existing relevant tests if touched modules have test coverage

## Progress Log

- 2026-04-24T20:48:00Z: User asked where `manual_review` appears in the
  dashboard and requested a new column plus a full-evaluation button.
- 2026-04-24T20:54:00Z: Added report `Decision` parsing to dashboard data.
  Verified `reports/358-flexport-2026-04-24.md` parses as
  `decision="manual_review"`.
- 2026-04-24T20:54:00Z: Added a Tracker `Quick Decision` column and row-level
  **Full Eval** action for `manual_review` rows.
- 2026-04-24T20:54:00Z: Added dashboard server endpoints
  `/api/full-evaluation` and `/api/full-evaluation/status`; they use the local
  bridge token on disk and queue default bridge evaluations without exposing the
  bridge token to browser JavaScript.
- 2026-04-24T20:54:00Z: Verification passed:
  `node --check web/dashboard-server.mjs`,
  `node --check web/build-dashboard.mjs`,
  a focused `buildDashboardData()` parse check for Flexport's decision, and
  `npm run dashboard:build`.
- 2026-04-24T20:56:00Z: Started dashboard server on
  `http://127.0.0.1:47330/` because the default `47329` port was already in
  use. Started bridge on `http://127.0.0.1:47319/` and verified bridge health
  returned `mode=real`, `executor=codex`.
- 2026-04-24T20:56:00Z: API smoke test passed without queuing an evaluation:
  posting an empty body to `/api/full-evaluation` with a valid dashboard token
  returned `400 {"ok":false,"error":"reportPath is required"}`.

## Key Decisions

- Keep `manual_review` as report metadata rather than changing tracker status,
  because repo rules already map manual-review quick screens to tracker
  `Evaluated`.
- Queue full evaluation via the local dashboard server, not directly from
  browser JavaScript, so the bridge token stays on disk and is not embedded in
  the page.

## Risks and Blockers

- Full evaluation can take minutes; the dashboard should queue and poll rather
  than hold one long HTTP response open.
- If the bridge is not running, the button should report the bridge failure and
  leave tracker data unchanged.

## Final Outcome

Implemented. The dashboard tracker now shows quick-screen report decisions in
a dedicated column. Rows with `manual_review` expose a **Full Eval** button
when served through `npm run dashboard`; clicking it queues a default full
bridge evaluation and polls status until completion or failure. Static exports
show the decision column but cannot queue full evaluation. The verified local
server for this run is `http://127.0.0.1:47330/`.
