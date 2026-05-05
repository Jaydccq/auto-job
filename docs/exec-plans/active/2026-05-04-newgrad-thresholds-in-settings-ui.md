# Exec plan: Newgrad scan thresholds in desktop settings UI

## Background

`config/profile.yml -> newgrad_scan` thresholds (`list_threshold`,
`pipeline_threshold`, `detail_value_threshold`, `max_years_experience`,
`exclude_no_sponsorship`, `exclude_active_security_clearance`) are the most
frequently tuned knobs of the scanner pipeline. Today they require manual yaml
editing. A typical "I want more rows in the pipeline" change means dropping
`detail_value_threshold` from 6.5 to 5.5.

## Goal

Expose those 6 fields in the existing desktop Settings window so the user can
tune them without touching yaml. Out of scope: keyword arrays, blocked-company
lists, clearance lists, oferta/cover-letter sections.

## Scope (Option A from chat)

- `list_threshold` (int 0..9)
- `pipeline_threshold` (int 0..9)
- `detail_value_threshold` (number 0..10, one decimal)
- `hard_filters.max_years_experience` (int 0..10)
- `hard_filters.exclude_no_sponsorship` (bool)
- `hard_filters.exclude_active_security_clearance` (bool)

## Assumptions

- The desktop app and the bundled bridge share `AUTO_JOB_REPO_ROOT`, so writing
  to `${repoRoot}/config/profile.yml` is the same file the bridge reads.
- `loadNewGradScanConfig` is called per-evaluation, so a save takes effect on
  the next scan run with no bridge restart.
- We can use the `yaml` package's `parseDocument` API to preserve top-level
  comments and key ordering across edits. The existing repo already depends on
  `yaml@^2.8.3` in `apps/server`; we add the same dep to `apps/desktop`.
- Writes happen entirely in the Electron main process via IPC — no new bridge
  HTTP route, no auth round-trip.
- Renderer side fits in the existing single Settings window. No new window.

## Non-goals

- Editing keywords / blocked companies / clearance lists.
- Editing other profile sections (oferta, cover-letter, etc.).
- yaml syntax-level safety: the writer only mutates known leaf nodes, never
  inserts new keys.

## Implementation steps

1. Add `yaml@^2.8.3` to `apps/desktop/package.json` dependencies. `npm install`.
   Verify: `node -e "require('yaml')"` resolves from `apps/desktop`.

2. New file `apps/desktop/src/profile-config.ts`. Two exports:
   - `loadNewGradThresholds(repoRoot): NewGradThresholds`
   - `saveNewGradThresholds(repoRoot, partial): NewGradThresholds`
   Uses `yaml.parseDocument` so comments survive. Validates ranges; throws
   `Error` on invalid input. Falls back to module-defined defaults when the
   key is missing (does not insert).
   Verify: vitest covering load, save, comment preservation, range guards.

3. Wire IPC in `apps/desktop/src/main.ts`. Two handlers:
   - `newgrad-thresholds:get` → returns current values.
   - `newgrad-thresholds:set` → validates payload, writes, returns the
     normalized post-save values.
   Verify: `npm --prefix apps/desktop run typecheck`.

4. Extend `apps/desktop/src/settings-preload.ts` to expose
   `getNewGradThresholds()` / `setNewGradThresholds(payload)`.
   Verify: typecheck.

5. UI: append a "New-grad scan thresholds" section to
   `apps/desktop/src/settings-window.html`. Six inputs (4 number + 2 checkbox).
   Wire load on open + save in the existing Save handler in
   `apps/desktop/src/settings-window.ts`. Surface validation errors inline.
   Verify: typecheck + build, manual smoke (open Settings, change values, save,
   `cat config/profile.yml | grep -E "list_threshold|..."`).

## Verification approach

- Vitest for `profile-config.ts` covering: load defaults when absent, load
  current values when present, save preserves comments, range validation.
- Manual: Settings window → change `detail_value_threshold` 6.5 → 5.5 → Save →
  inspect `config/profile.yml` (line preserved with comment block intact),
  rerun `npm run newgrad-scan` and observe skip breakdown reflects the new
  threshold.

## Progress log

- 2026-05-04: plan written.
- 2026-05-04: Implemented A end-to-end.
  - Added `yaml@^2.8.3` to `apps/desktop`.
  - New `apps/desktop/src/profile-config.ts`: load/save the 6 fields via
    `yaml.parseDocument`. Smoke tested: changing 2 values touches exactly
    2 lines, full-restore is byte-identical.
  - `lineWidth: 0` on `doc.toString()` prevents the yaml library from
    re-flowing long quoted strings (caught during the first roundtrip —
    `narrative.exit_story` got wrapped to 80 cols). After the fix, save is
    surgical and idempotent.
  - One-time cosmetic side effect: long quoted strings (`exit_story`,
    `hero_metric`, `achievements`) collapsed onto single lines after the
    first roundtrip. Values unchanged. File now stable on subsequent saves.
  - IPC handlers `newgrad-thresholds:load` / `:save` registered in
    `settings-window.ts`; preload bridge updated. UI section added below
    the existing settings (4 numbers + 2 checkboxes), saved alongside
    the existing Save button. Helper text says "no restart needed."
  - Verification: `npm run typecheck` + `npm run build` green;
    `npm run verify:repo-guard` green.

## Final outcome

Option A shipped. User can tune the 6 most-edited newgrad_scan thresholds
from Settings; takes effect on the next scan. Keyword arrays / blocked
companies / clearance lists remain yaml-only (Option B/C deferred).

## Follow-up: Bridge status panel (2026-05-05)

Same Settings window now shows a read-only "Bridge status" card at the top:
URL, mode/executor, codex model + reasoning effort, anthropic model, deps
versions (claude/codex/playwright), bridge version, and a token preview.
Refresh button polls `/v1/health` on demand. Implementation:

- New IPC handler `bridge:health` in `settings-window.ts` reads
  `apps/server/.bridge-token` and fetches `/v1/health` on the bridge port.
- Preload bridge: `getBridgeHealth()`.
- HTML: status-card grid above the Evaluation backend dropdown.

Editable codex model / reasoning effort / claude model selectors are out of
scope for this iteration — currently driven only by env vars at boot.

## Risks

- yaml library `Document` mutation can move comments around in edge cases.
  Mitigation: only mutate `Scalar` value nodes (no key add/remove), and
  vitest assertion on the comment-preservation case.
- Desktop app needs to be rebuilt + relaunched for users on packaged builds.
  Acceptable for dev workflow (the user's primary use).

## Out of scope follow-ups

- Option B/C from the chat (full newgrad_scan section, full yaml editor).
- Bridge-side HTTP route, in case extension or other clients want the same.
