# Gmail Tracker — Phase 4: Deadline Parsing

**Goal:** Extract deadline dates from interview / online_assessment / action_required message bodies and surface them as `dueAt` on signal records and timeline entries. Promote `attention.level` to `urgent` when an upcoming deadline is within 48h.

**Architecture:** Pure function `parseDeadline(text, referenceDate)` added to `scripts/gmail-applications.mjs`. Wired into `extractSignalFromMessage` (scanner) so the full 4000-char body is available — the 220-char stored snippet is too short to reliably contain deadline phrasing. `buildApplicationRecord` propagates the stored `dueAt` to the timeline; if missing, falls back to re-parsing the snippet (best-effort). `computeApplicationAttention` scans timeline `dueAt` values for action-state apps and promotes to `urgent` when the next future deadline lands within `URGENT_DEADLINE_HOURS = 48`.

**Tech Stack:** Node 20 ESM, `node:test`. No new dependencies.

## Files Modified

- `scripts/gmail-applications.mjs` — added `parseDeadline`, `DEADLINE_EVENTS` constant, deadline-aware timeline build, urgent-promotion logic in `computeApplicationAttention`.
- `scripts/gmail-applications.test.mjs` — 12 new tests (8 for parser + 4 for wiring/attention).
- `scripts/gmail-oauth-refresh.mjs` — imports `parseDeadline`, calls it on full `searchText`, persists `dueAt` on the signal record for deadline-bearing event types.
- `docs/GMAIL_SIGNALS.md` — updated attention table (urgent now also fires on near deadlines) + parseDeadline phrasings documented.
- `docs/exec-plans/tech-debt-tracker.md` — recorded Phase 5 (sender taxonomy YAML) as deferred and Phase 4 weekday-phrasing coverage gap.

## Supported Phrasings

- ISO date: `2026-05-05`, `2026/05/05`
- Relative: `complete within 5 days`, `due in 2 weeks`, `submit in 3 days`
- Named: `by May 5`, `before April 30`, `until June 1, 2026` (year defaults to reference year; rolls to next year if the resulting date is more than 30 days in the past)

Out of scope (tracked in tech-debt): weekday phrasings (`by next Friday`, `EOD Monday`), timezone-aware time parsing, relative casual phrasings (`tomorrow`, `end of week`).

## Verification

- `bun run test:gmail-apps` 49/49 passes (37 prior + 12 new).
- `bun run test:gmail` 30/30 still passes (no Phase 1 regression).
- Standalone replay against the user's 295-signal corpus produced 0 deadlines on the truncated stored snippets, confirming the rationale for moving extraction to the scanner-side full-body path. Live scans will produce non-zero deadlines on emails containing supported phrasings.

## Final Outcome

Phase 4 shipped in 2 commits on `feature/gmail-tracker-phase4`. The state-machine and aggregation layer (Phase 2) gained a `dueAt` channel; the dashboard (Phase 3) automatically reflects urgent-deadline promotions because it reads `attention.level` directly. Phase 5 (sender taxonomy YAML) is recorded as deferred per the original design.

## Key Decisions

- **Deadline extraction runs in the scanner, not in the aggregator.** The 220-char stored snippet is too short to reliably contain deadline phrasing; the scanner has access to the full 4000-char body before truncation.
- **`parseDeadline` covers the common 80% of phrasings** (ISO + relative-N-days + named-month-day). Weekday phrasings and timezone-aware time parsing are tracked as tech debt rather than blocking Phase 4 ship.
- **`URGENT_DEADLINE_HOURS = 48`** matches the Phase 2 default. Configurable later if needed.
- **Past deadlines do not promote.** Only future `dueAt` values within 48h trigger urgent — matches user expectation (an expired deadline isn't actionable).
