# Gmail Tracker — Phase 3: Dashboard Applications Tab

**Goal:** Surface Phase 2's `data/gmail-applications.jsonl` aggregate to the user via the local dashboard. Additive only — the existing Tracker tab continues to consume the per-signal model for backwards compatibility.

**Architecture:** A new tab `Applications` is inserted between `Tracker` and `Pipeline`. `web/build-dashboard.mjs` adds `parseGmailApplications` and injects the result as `D.gmailApplications`. `web/template.html` adds the pane and a `renderApplications()` JS function that sorts rows by attention priority then last-update descending and renders them in a table with state badge, attention level, company, role, message count, and reason.

**Scope:** Additive. No existing function changed semantically. `parseGmailRefreshStatus`, `parseGmailSignals`, `parseGmailApplications` all gated behind the same `includeGmailSignals` flag — when the local server passes that flag, all three load. CLI builds (`bun run dashboard:build`) leave Gmail data unloaded as before.

## Files Modified

- `web/build-dashboard.mjs` — added `parseGmailApplications`; injected into `buildDashboardData`.
- `web/template.html` — new tab button, new `<section id="tab-apps">` pane, new `renderApplications()` JS, keyboard shortcuts shifted (Pipeline → 5, Scan → 6, Keywords → 7).
- `web/index.html` — regenerated empty-state build.

## Verification

- `bun run test:gmail` 30/30 passes (no scanner change).
- `bun run test:gmail-apps` 37/37 passes (no aggregator change).
- Replay test: rebuilt dashboard with `includeGmailSignals: true` against the user's 295-signal corpus → embedded 271 applications. First app rendered as `Kinstead | rejected | urgent`, matching Phase 2's replay output.
- Empty-state test: rebuilt with `data/` empty → table renders the "No applications yet" placeholder.

## Final Outcome

Phase 3 shipped in 1 commit (`abb0683`). The user now sees:
- A new top-level Applications tab in the dashboard with per-thread state, attention level, message count, and reason.
- Backwards-compatible Tracker tab unchanged.
- Empty-state behavior when scanner has not yet emitted the applications file.

The Phase 4 (deadline parsing) and Phase 5 (sender taxonomy YAML) plans remain unwritten — both are quality improvements the user previously approved as deferrable.

## Key Decisions

- **Additive, not replacement.** Tracker tab continues to use signals + tracker rows. Migrating that to the new applications model would be a separate, larger refactor.
- **No new tests.** The aggregator (Phase 2) is fully unit-tested; the parser change is a copy of `parseGmailSignals`. Visual verification + manual replay was sufficient.
- **Server-side gate unchanged.** `includeGmailSignals: true` continues to gate all three Gmail-derived data sources together.
