# Browser cache pruning

Date: 2026-05-04

## Background

Working tree is ~2.5 GB. Most of it is gitignored runtime data, but
`data/browser-profiles/newgrad-scan/` alone holds 1.5 GB and
`~/.auto-job/chrome-profile/` holds 284 MB of accumulated Chromium state.
Both are "own-browser" profiles used by `linkedin-scan` / `builtin-scan` /
`indeed-scan` / `newgrad-scan` (see `docs/architecture/own-browser.md`).

The bulk of that footprint is HTTP cache, V8 code cache, GPU shader cache,
and Chromium-side ML model packs (`SODA*`, `optimization_guide_model_store`,
`component_crx_cache`, `WasmTtsEngine`, `OnDeviceHeadSuggestModel`). All of
these regenerate on demand and are unrelated to scan correctness or login
state.

## Goal

1. One-time prune to reclaim ~1.2 GB across both profile locations.
2. A repeatable `npm run prune-cache` so the cleanup is durable instead of
   becoming a recurring manual task.

## Scope

- IN: `data/browser-profiles/*/` and `~/.auto-job/chrome-profile/`
- IN: regenerable cache and ML-model directories listed in "Safe targets"
- OUT: any auth-related state (cookies, local/session storage, IndexedDB,
       login data, web data, preferences, bookmarks, history, "Local State")
- OUT: profile root files (Preferences, First Run, Local State, etc.)

## Safe targets (whitelist)

Profile-root level:
- `SODA`, `SODALanguagePacks`, `WasmTtsEngine`
- `optimization_guide_model_store`, `OnDeviceHeadSuggestModel`
- `component_crx_cache`
- `GraphiteDawnCache`, `ShaderCache`, `GrShaderCache`

Per `Default/`:
- `Cache`, `Code Cache`, `GPUCache`
- `DawnWebGPUCache`, `DawnGraphiteCache`, `ShaderCache`

## Forbidden paths (denylist — never touch)

`Cookies*`, `Login Data*`, `Web Data*`, `Local Storage`, `Session Storage`,
`IndexedDB`, `Storage`, `History*`, `Visited Links`, `Preferences`,
`Bookmarks*`, `Top Sites*`, `Network`, `Sessions`, `Local State`.

## Assumptions

- No Chrome/Chromium process is currently using either profile (we will
  detect `SingletonLock` and bail if present).
- `data/browser-profiles/` is gitignored (verified) so deletions don't
  affect git state.
- `~/.auto-job/chrome-profile/` is the user-home profile referenced in
  `CLAUDE.md` and `docs/architecture/own-browser.md`.

## Implementation steps

1. Add `scripts/prune-browser-cache.mjs`
   - Default profile roots: `data/browser-profiles/*` and
     `$HOME/.auto-job/chrome-profile`
   - `--dry-run` flag: prints sizes only.
   - Refuses to run when `SingletonLock` exists in a profile.
   - Walks whitelist; never touches denylist; ignores anything not on the
     whitelist (no recursive deletion of unknown paths).
   - Prints total bytes freed.
2. Wire `npm run prune-cache` and `npm run prune-cache:dry` in
   root `package.json`.
3. Run `npm run prune-cache:dry` — verify the planned targets and total.
4. Run `npm run prune-cache` — execute the one-time cleanup.
5. Verify with `du -sh data/browser-profiles ~/.auto-job/chrome-profile`.

## Verification approach

- Before/after `du -sh` for both profile roots, recorded in progress log.
- Spot-check that `Default/Cookies` and `Default/Local Storage` still
  exist with same byte counts after pruning.
- Smoke test: next scan run should complete normally (deferred to next
  scheduled scan; no regression expected).

## Progress log

- 2026-05-04: plan filed.
- 2026-05-04: `scripts/prune-browser-cache.mjs` added; `npm run prune-cache`
  and `npm run prune-cache:dry` wired in `package.json`.
- 2026-05-04: dry-run reported 1.7 GB across `data/browser-profiles/newgrad-scan`
  and `~/.auto-job/chrome-profile`. No `SingletonLock` present.
- 2026-05-04: real run executed. Result: 1.7 GB freed.
  - `data/browser-profiles`: 1.5 GB → 41 MB
  - `~/.auto-job/chrome-profile`: 284 MB → 35 MB
- 2026-05-04: verified `Default/Cookies`, `Default/Local Storage`,
  `Default/IndexedDB` byte sizes unchanged in both profiles. Login state
  preserved.

## Key decisions

- **Whitelist, not blacklist.** Easier to keep correct: if Chrome adds a
  new ML model dir tomorrow, the script ignores it instead of deleting it
  blindly.
- **No recursion into unknown dirs.** Safer against future Chrome changes.
- **Repeatable script over one-shot.** Caches will refill; we want this
  to be `npm run prune-cache`, not a wiki page someone has to find.

## Risks and blockers

- If a scan is mid-run, deleting `Cache/` while files are open could
  produce stale entries. Mitigated by the `SingletonLock` check.
- ML model packs (`SODA*`, etc.) will be re-downloaded by Chromium on
  next launch — adds ~30s of bandwidth one time per profile. Acceptable.

## Final outcome

Done. 1.7 GB reclaimed. `npm run prune-cache` is now the durable
mechanism — re-run any time profiles bloat again. Plan can move to
`archive/` once it has been referenced from any future cleanup.
