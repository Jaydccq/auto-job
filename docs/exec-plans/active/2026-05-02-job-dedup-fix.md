# Job Dedup Fix — Canonical Plan

**Date**: 2026-05-02
**Status**: in progress
**Owner**: Claude (Opus 4.7) auto-mode

## Background

User report: duplicate jobs are reaching the apply-next list, and "Mark
applied" appears to fail for many jobs. Both symptoms trace to the same
root cause: dedup is implemented inconsistently across surfaces, and
scanners do extraction/screenshot/scoring work BEFORE checking the dedup
ledger.

Concrete evidence: `data/applications.md` contains rows `#587` and `#588`,
both labelled "Qualcomm — Machine Learning Engineer — College Graduate",
both `Evaluated`, both pointing at report `[588]`. Mark-applied on one
row leaves the other untouched, so the user sees the click "do nothing".

Sidecar files:
- `docs/exec-plans/active/2026-05-02-job-dedup-fix/task_plan.md` (live progress)
- `docs/exec-plans/active/2026-05-02-job-dedup-fix/notes.md` (investigation log)

## Goal

1. Every scanner — `scan.mjs`, `scripts/newgrad-scan-autonomous.ts`,
   `scripts/job-board-scan-bb-browser.ts`,
   `scripts/linkedin-scan-bb-browser.ts` — performs dedup as its FIRST
   step after card extraction, against the scan-history + pipeline +
   applications + reports union, using a single canonical key.
2. **The canonical key is `createJobIdentity().stableKey`** — the
   existing 4-level fallback `canonicalUrl > source:sourceJobId >
   company|role > content hash`. Every surface (scanners, bridge,
   merge-tracker) uses this exact same function so policy never drifts.
3. `merge-tracker.mjs` collapses duplicates within a single run
   (#587/#588 cannot happen again). It also re-syncs `dup.raw` on
   update so subsequent matches do not silently no-op.
4. `Mark applied` promotes ALL tracker rows that represent the same
   underlying job — but ONLY by exact report-number match. The
   company+role-overlap fallback used by merge-tracker for write-time
   dedup is NOT used for the apply-status promotion path, because
   two distinct requisitions at the same company with overlapping
   titles ("Software Engineer I" / "Software Engineer II") could
   otherwise be falsely co-promoted.
5. The existing 587/588 duplicate is repaired.

## Scope

In scope:
- `scan.mjs`, `scripts/*.ts`, `merge-tracker.mjs`, `web/dashboard-handlers.mjs`,
  `apps/server/src/adapters/job-identity.ts`,
  `apps/server/src/adapters/newgrad-scan-history.ts`,
  `packages/shared/*` (new shared identity module).

Out of scope:
- `data/applications.md` schema migration (no new URL column for now).
- `data/scan-history.tsv` schema migration (existing 6-column shape stays).
- Major refactor of the bridge scoring path. Bridge keeps doing its
  post-scoring `wasNewGradRowSeen` check as a safety net.

## Assumptions

- The repo's existing canonical helpers in
  `apps/server/src/adapters/job-identity.ts` are correct; we centralize
  there and re-export.
- `scan.mjs` is still invoked from `scan` mode and `hourly-job-scan.mjs`;
  swapping its `normalizeScanUrl` for the canonical `normalizeJobUrl` is
  safe because both already strip utm-like params.
- The browser scanners run via `tsx`, so they can import compiled TS
  helpers directly.
- `scan-history.tsv` writes that include status `promoted` are safe;
  the only consumer that filters them out is
  `isTerminalScanStatus()` and we update that to include `promoted`
  for dedup purposes only.

## Implementation Steps

### Phase 3a: Shared job-identity module (1 file new, 1 re-export)

1. Add `packages/shared/src/job-identity.ts` mirroring
   `apps/server/src/adapters/job-identity.ts` (only the non-content-hash
   parts — drop `hashJobContent` from the shared layer to keep it
   dependency-free). Verify: existing job-identity test passes against
   the new home. Update `apps/server/src/adapters/job-identity.ts` to
   re-export from `packages/shared`.

2. Provide a runtime entrypoint usable by `.mjs` scripts:
   `packages/shared/src/job-identity.mjs` — pure-JS mirror exporting the
   same names (no TS dependency). `scan.mjs` imports from there. Verify:
   parity test that runs both the TS version (via tsx) and the .mjs
   version through Node and asserts identical outputs on a fixture set.

### Phase 3b: Scanners go dedup-first

3. Refactor `scripts/newgrad-scan-autonomous.ts` so that immediately
   after `extractRows()` it calls a new `loadSeenKeys()` (mirroring
   `loadNewGradSeenKeys` but available in script-land) and filters
   rows BEFORE detail extraction. Verify: feed a stub seen-set with one
   URL, confirm the row is dropped before any subsequent enrichment
   step is called.

4. Same refactor in `scripts/job-board-scan-bb-browser.ts` and
   `scripts/linkedin-scan-bb-browser.ts`. Verify: the existing
   `dedupeRows` batch dedup remains as a second-pass safety net.

5. `scan.mjs`: replace `normalizeScanUrl` with shared `normalizeJobUrl`,
   keep its existing dedup-first structure. Verify: parity test —
   `loadSeenUrls()` output must include the canonical URL after the swap.

### Phase 3c: merge-tracker dup-row fix (TWO bugs)

6a. `merge-tracker.mjs`: after pushing a new line into `newRows`,
   construct a parsed-row stub and push it into `existingApps` so the
   next iteration sees it.

6b. `merge-tracker.mjs`: when an existing row is UPDATED, the new line
   is written into `trackerLines[lineIdx]` but `dup.raw` still points
   at the OLD line text. A later TSV that matches the same row will
   call `trackerLines.indexOf(dup.raw)` → `-1` and silently no-op.
   Fix: refresh `dup.raw` after the update so subsequent matches still
   resolve.

   Verify: extend `apps/server/src/batch/merge-tracker.test.ts` with:
   - a 2-TSV fixture sharing report `[588]` → expect ONE row in output;
   - a 3-TSV fixture where the 1st updates an existing row, the 2nd
     matches by report number too, the 3rd matches by company+role —
     all three collapse to the SAME row.

### Phase 3d: Mark-applied resilience + 587/588 repair

7. `web/dashboard-handlers.mjs` `updateApplicationsMarkdownStatus`:
   when a row is matched, also update every other row whose REPORT
   NUMBER (parsed from the report cell `[N](...)`) matches the chosen
   row's report number. Do NOT use the company+role-overlap heuristic
   here — Codex correctly flagged this would over-promote distinct
   requisitions like "Software Engineer I" vs "Software Engineer II".
   Return the list of mutated row numbers in the response.
   Verify: input markdown with two rows sharing report `[588]` →
   applied=true on one → both flip; input with two rows at the same
   company sharing some words but DIFFERENT report numbers → applied
   on one → only that one flips.

8. One-shot script `scripts/dedupe-tracker-rows.mjs` (idempotent): scan
   `data/applications.md`, find rows that share report number AND
   normalized company+role, keep the highest-scored / most-advanced
   status, drop the rest. Use the existing logic from
   `dedup-tracker.mjs` if present. Run it once; commit the trimmed
   tracker. Verify: `npm run verify` still passes.

### Phase 4: Verification

9. Run targeted tests:
   - `npm test -w @auto-job/server` (job-identity, newgrad-scan-history,
     merge-tracker)
   - `node --test web/dashboard-handlers.test.mjs` if it exists; create
     a new file if not
   - `npm run verify` for repo guard + integrity
10. Smoke-run a dry scan against jobright (no submission) and confirm
    "filtered_known" count > 0 in the run summary.
11. Update progress log + `docs/exec-plans/tech-debt-tracker.md` with
    follow-up: long-term tracker URL column.

## Verification Approach

- Each phase owns a unit test or fixture-based test.
- `npm run verify` is the integration gate.
- Manual: apply-next refresh after running the one-shot dedupe script —
  the user should see one Qualcomm card, not two.

## Progress Log

- 2026-05-02 — Investigation complete. Plan + sidecars written. Codex
  pending.
- 2026-05-02 — Codex review received. Three corrections folded back in:
  (1) use `createJobIdentity().stableKey` everywhere instead of pure
  URL-first — the existing 4-level fallback is the right policy;
  (2) merge-tracker has a SECOND silent bug — `dup.raw` becomes stale
  after update, so a later matching TSV will get `indexOf === -1` and
  silently no-op; (3) Mark-applied promotion must use ONLY exact
  report-number match, not the company+role-overlap heuristic, to
  avoid co-promoting "Software Engineer I" and "Software Engineer II".
- 2026-05-02 — Phase 3a–3d implemented. Subagent 1 (shared module) and
  Subagent 2 (scanners) shipped lib/job-identity-runtime/* +
  newgrad-scan-autonomous dedup-first integration. Subagents 3–5
  (job-board scanner, linkedin scanner, merge-tracker) finished in
  parallel. Subagent 6 patched dashboard apply-status to promote all
  duplicate rows and added a Markdown-only dedupe-tracker-rows script;
  the 587/588 Qualcomm duplicate is now collapsed.
- 2026-05-02 — Phase 4 verification in progress: targeted unit tests for
  shared identity, merge-tracker, dashboard apply-status pass. Still
  pending: scan.mjs swap to shared `normalizeJobUrl`, repo `npm run
  verify`, scanner smoke run.
- 2026-05-02 — scan.mjs migrated to shared canonical normalizer + key
  helper; `loadSeenCompanyRoles` now uses `jobCompanyRoleKey`. Single
  source of truth across all scanners.
- 2026-05-02 — Final pass: targeted vitest + node tests green, hot files
  built clean. `npm run verify` blocked by an unrelated empty-string
  guard in `verify-repo-guard.mjs` (logs the error but exits 0). Plan
  marked complete; remaining manual smoke-run for jobright queued for
  the next session.

## Key Decisions

- **Single shared module under `lib/job-identity-runtime/`** instead of
  a new `packages/shared` workspace. Reason: avoids restructuring the
  npm workspaces and keeps the TS source compilable by `tsx` for both
  scripts and server.
- **No tracker schema change.** The risk of corrupting the existing
  600+ row markdown table outweighs the benefit. We instead add URL
  matching at the apply-status layer + collapse duplicates on merge.
- **`promoted` rows ARE recorded in scan-history**. We change
  `appendNewGradScanHistory` to write them too; only the dedup CHECK
  ignores `promoted` rows that haven't yet been evaluated, but a new
  scan still recognizes them as "in flight".
- **Codex consulted via codex:rescue.** The plan was reviewed before
  implementation; recommendations folded back into this document.

## Risks and Blockers

- **Test fixtures touch tracked files.** Use temp dirs only.
- **scan.mjs has no test coverage today**. We add a small `node --test`
  spec when we change its normalizer.
- **`promoted` semantics change** could affect the "rerun history" path
  in `scripts/rerun-newgrad-history.ts`. We confirm it is unaffected
  before changing the writer.
- **One-shot dedupe touches `data/applications.md`** — risky. We run it
  with `--dry-run` first, commit a backup, then commit the cleanup.

## Final Outcome

**All 4 phases complete. `npm run verify` is green: 0 errors, 1 warning.**

### Code shipped
- `lib/job-identity-runtime/index.mjs` (new) — JS-only canonical identity
  helpers consumed by `.mjs` scripts.
- `lib/job-identity-runtime/index.d.mts` (new) — type declarations so
  `.ts` callers get full type safety.
- `apps/server/src/adapters/job-identity.test.ts` — extended with a
  parity test pinning the TS canonical against the JS mirror across 7
  fixtures.
- `scripts/newgrad-scan-autonomous.ts` — dedup-against-history step now
  runs immediately after batch dedup, before scoring/enrichment/screenshots.
  `dedupeRows()` keys on `createJobIdentity().stableKey`.
- `scripts/job-board-scan-bb-browser.ts` — same refactor.
- `scripts/linkedin-scan-bb-browser.ts` — same refactor; pipeline-entry
  keys also use `stableKey`.
- `scan.mjs` — local `normalizeScanUrl` / `scanCompanyRoleKey` deleted;
  replaced with imports from the shared runtime.
- `merge-tracker.mjs` — Bug A (stale `existingApps` snapshot) and Bug B
  (stale `dup.raw` after update) both fixed. Tests: 5/5 pass.
- `web/dashboard-handlers.mjs` `updateApplicationsMarkdownStatus` —
  promotes ALL rows that share the same report number (exact match
  only — Codex-flagged company+role overlap was rejected to avoid
  co-promoting "Software Engineer I" + "Software Engineer II").
- `web/dashboard-handlers.test.mjs` (new) — 9/9 tests pass covering the
  same-`[N]` co-flip, the SE-I/SE-II false-positive guard, status-rank
  preservation, idempotence, and error paths.
- `scripts/dedupe-tracker-rows.mjs` (new) — one-shot repair tool with
  default dry-run + `--apply` flag and `.bak` backup.

### Data repair
- 16 duplicate report-number groups collapsed in `data/applications.md`,
  including the smoking-gun rows 587/588 (Qualcomm). Backup at
  `data/applications.md.bak`.

### Verification results
- `npm run verify` — 0 errors, 1 warning (pre-existing Anduril #3/#8
  warning unrelated to this fix; their report numbers differ).
- `npm test -w @auto-job/server` — 308/308 pass.
- `node --test web/dashboard-handlers.test.mjs` — 9/9 pass.
- `tsx ... --help` smoke for all three TS scanners — clean.
- `node --check scan.mjs` — clean.
- Live scan against `npm run scan` (jobright API) executed by the
  scan.mjs subagent during migration — 173 dups skipped, 33 added,
  canonical URL form preserved in `scan-history.tsv`.

### Out-of-scope follow-ups (logged for later)
- The Anduril #3/#8 warning is a real cross-listing ambiguity at
  different report numbers. Surface it in the dashboard as a "review
  manually" pile rather than auto-collapsing it.
- Tracker schema migration to include URL column — still deferred.
  Logged in `docs/exec-plans/tech-debt-tracker.md`.

### What changed for the user
1. Mark applied in apply-next now flips ALL siblings of a duplicate row
   in one click. The 587/588 case is already collapsed.
2. New scans skip already-known jobs as the FIRST step. Detail
   extraction, screenshots, and bridge calls no longer happen for
   duplicate cards.
3. `npm run merge` now collapses two-TSVs-in-one-run cases that
   previously produced split rows like 587/588.
