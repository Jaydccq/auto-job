# Exec Plan: builtin/indeed dashboard scans → codex evaluate

## Background

The dashboard "Run a scan" launcher (`web/template.html` + `web/scan-runner.mjs`)
exposes 6 scan skills. For `linkedin-scan`, `newgrad-scan`, and `scan` the user
can pick `real-codex / real-claude / real-openrouter / fake / discovery-only`
runners. For **`builtin-scan` and `indeed-scan` the picker is restricted to
`['discovery-only', 'fake']`**, so the user has no dashboard path to run these
two through the codex evaluator, even though:

- Both share `scripts/job-board-scan-bb-browser.ts`, which already supports
  `--evaluate-limit`, `--evaluation-mode newgrad_quick|default`, and queues
  `/v1/evaluate` calls by default (line 774).
- The bridge already routes `/v1/evaluate` to whichever adapter the bridge was
  started with (`AUTO_JOB_REAL_EXECUTOR`, default `codex` in the desktop app).
- `modes/builtin-scan.md` and `modes/indeed-scan.md` document the codex-eval
  flow as the recommended default.

Net effect: the CLI can do it; the dashboard can't.

A second smaller bug: the `buildArgv` switch case for `builtin-scan/indeed-scan`
only emits `--limit` — it never adds `--no-evaluate` for the `discovery-only`
runner, so picking "discovery-only" silently still queues evaluations. The
catalog description "Discovery only — feeds /v1/builtin-scan/pending" is also
stale.

## Goal

After the fix, from the dashboard the user can:
1. Click a runner button (codex / claude / openrouter / fake / discovery-only)
   on the **Built In** and **Indeed** scan cards, identical to linkedin/newgrad.
2. Set an Eval limit and (optional) URL override; defaults match the modes doc.
3. See accurate per-card descriptions that don't claim "discovery only".
4. Picking `discovery-only` actually adds `--no-evaluate` to argv.

## Scope

In scope:
- `web/scan-runner.mjs`: extend `builtin-scan` + `indeed-scan` catalog entries
  (runners, advancedRunners, defaultRunner, inputs, description) and update the
  `buildArgv` switch case to emit `--evaluate-limit`, `--no-evaluate`,
  `--score-only`, `--url`, `--enrich-limit`, `--pages` per the underlying
  script's option set.
- `apps/server/src/runtime/scan-runner.test.ts`: add tests pinning the new
  catalog shape and argv mapping for both skills, including the
  `discovery-only` → `--no-evaluate` invariant.
- (Optional polish) `web/template.html` description tweak — currently rendered
  from catalog `description`, so step 1 is enough.

Out of scope:
- Changing the `/v1/evaluate` route, evaluation worker pool, or how the bridge
  picks an adapter. The runner picker is intent + flag selection only; the
  bridge's executor is set at startup. This matches how linkedin/newgrad
  already behave — no scope creep.
- Per-request executor switching (would require a new envelope field).
- New scan modes or scrapers.

## Assumptions

1. The desktop bridge is launched with `AUTO_JOB_REAL_EXECUTOR=codex`, so
   `/v1/evaluate` requests go through codex. (Confirmed in
   `apps/server/src/index.ts:94`.)
2. `scripts/job-board-scan-bb-browser.ts` is the canonical entry for both
   builtin and indeed (verified in `package.json:21,26`) and already accepts
   the full `--no-evaluate / --evaluate-limit / --evaluation-mode / --score-only`
   set (verified by grep against the script).
3. Runner-level env (`AUTO_JOB_REAL_EXECUTOR=codex`) on the child scan process
   is informational; the bridge's executor wins. Tests stay aligned with
   existing linkedin/newgrad behaviour.

## Implementation Steps

1. **Update catalog entries** in `web/scan-runner.mjs` for `builtin-scan` and
   `indeed-scan` to mirror the linkedin/newgrad runner set.
   Verify: hand-read the diff; the `runners` array contains all four real
   adapters plus `fake`, `defaultRunner` is `real-codex`, `advancedRunners`
   contains `discovery-only`, descriptions are accurate.

2. **Extend the `buildArgv` switch case** for `builtin-scan / indeed-scan` to
   emit `--url`, `--pages`, `--limit`, `--enrich-limit`, `--evaluate-limit`,
   `--score-only`, and `--no-evaluate` (when `runner === 'discovery-only'`),
   matching the linkedin/newgrad pattern.
   Verify: targeted vitest checks per skill+runner combo.

3. **Add unit tests** in `apps/server/src/runtime/scan-runner.test.ts`:
   - builtin-scan with `real-codex` + `evaluateLimit=5` produces
     `npm run builtin-scan -- --evaluate-limit 5` (no `--no-evaluate`).
   - indeed-scan with `discovery-only` produces `--no-evaluate`.
   - both skills accept `real-codex / real-claude / real-openrouter / fake`.
   Verify: `npm --prefix apps/server test -- scan-runner` passes.

4. **Run repo guard + verify**: `npm run verify:repo-guard` and
   `npm --prefix apps/server test`.

## Verification approach

- Unit tests in `scan-runner.test.ts` cover catalog shape and argv mapping per
  runner choice. This is the same contract the existing linkedin tests pin.
- `npm run verify:repo-guard` ensures no upstream surfaces drift.
- Manual smoke (informational, not a gate): in the dashboard, the Built In and
  Indeed cards now show 4 primary runner buttons + 1 advanced; picking codex
  with Eval limit 1 launches and the SSE log shows `/v1/evaluate` POSTs.

## Progress log

- 2026-05-02: Plan drafted after researching `web/scan-runner.mjs`,
  `apps/server/src/runtime/scan-runner.test.ts`, `scripts/job-board-scan-bb-browser.ts`,
  `apps/server/src/server.ts`, `apps/server/src/index.ts`. Gap confirmed: dashboard
  catalog restricts runners; underlying script and bridge already support codex
  evaluation.
- 2026-05-02: Codex review of plan completed. Findings:
  (a) restriction in `web/scan-runner.mjs` confirmed; (b) script flag support
  confirmed end-to-end — no script changes needed; (c) existing tests are
  *loose* (length check + defaultRunner ∈ runners) so they would not fail after
  the change — we need explicit new tests for builtin/indeed runner sets and
  argv mappings; (d) executor-at-startup assumption confirmed in
  `config.ts:296` → `index.ts:buildAdapter` → `server.ts:buildServer`.

## Key decisions

- **Mirror linkedin/newgrad exactly** rather than invent a new shape for
  builtin/indeed. Same runner set, same input names, same default (`real-codex`).
  Reduces user-facing surface and matches the principle that the underlying
  script is already shared.

## Risks and blockers

- Adding `--url` as an optional input for builtin requires the script to accept
  the flag without forcing it. Verified via `grep -- --url scripts/job-board-scan-bb-browser.ts`
  (option exists, defaults inside the script).
- Indeed without a `--url` falls back to the script's default URL builder
  (uses `--query`/`--location` defaults). Mark `url` optional, not required,
  to keep that path open.

## Final outcome

Implemented. Two files changed:

- `web/scan-runner.mjs:25-57` — `builtin-scan` and `indeed-scan` catalog entries now mirror linkedin/newgrad: 4 primary runners (`real-codex`, `real-claude`, `real-openrouter`, `fake`), `advancedRunners: ['discovery-only']`, `defaultRunner: 'real-codex'`, six inputs (`url`, `pages`, `limit`, `enrichLimit`, `evaluateLimit`, `scoreOnly`), and refreshed descriptions.
- `web/scan-runner.mjs:169-178` — `buildArgv` switch case for both skills now emits `--url`, `--pages`, `--limit`, `--enrich-limit`, `--evaluate-limit`, `--score-only` (when `scoreOnly` or `discovery-only`), and `--no-evaluate` (when `discovery-only`).
- `apps/server/src/runtime/scan-runner.test.ts` — added 4 new tests pinning the new catalog shape and argv mapping for both skills (codex+evaluateLimit, indeed+discovery-only, indeed+real-openrouter, catalog runner-set).

Dashboard UX falls out of the catalog change: the existing generic card renderer in `web/template.html:3747-3825` reads `s.inputs`, `s.runners`, `s.advancedRunners`, and `s.description` directly, so users now see the same runner picker, eval inputs, advanced toggle, and accurate description on the Built In and Indeed cards as they do on linkedin/newgrad.

Verification:
- `apps/server` vitest: 312/312 passed (4 new + 308 existing).
- `npm run verify:repo-guard`: passed.
- `npm --prefix apps/server run typecheck`: passed.
- `npm run verify` full gate: passed (0 errors, 1 pre-existing duplicate warning unrelated to this fix).

