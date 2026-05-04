## Why

`auto-job` currently depends on `bb-browser`, an upstream tool consumed via PATH binary spawning across three scan scripts. The dependency cannot evolve with auto-job's needs (auto-apply, ATS support, audit logging) without forking and maintaining an unrelated 36-platform/103-command tool. Owning the browser layer unblocks the project's stated future direction (automated job applications) while letting us cut 90%+ of the surface area we don't use.

Phase 1 (this change) only replaces the **read** path — scan operations. Phase 2 (separate change, requires user-approved revision of `CLAUDE.md` ethical clauses) will add **write** capability for auto-applying.

## What Changes

- **NEW** workspace package `packages/browser/` published as `@auto-job/browser`, exposing `BrowserController` + `Tab` + four hardcoded site adapters (builtin, indeed, jobright, linkedin)
- **NEW** Chrome lifecycle helper `ensureChrome()` that idempotently launches/attaches a dedicated isolated Chrome instance against profile `~/.auto-job/chrome-profile/` on debug port `47320`
- Three scan scripts rewritten to import the new library instead of spawning `bb-browser`:
  - `scripts/linkedin-scan-bb-browser.ts` → `scripts/linkedin-scan.ts`
  - `scripts/job-board-scan-bb-browser.ts` → `scripts/job-board-scan.ts`
  - `scripts/newgrad-scan-autonomous.ts` (updated in place; CDP path swap)
- `package.json` script entries (`linkedin-scan`, `builtin-scan`, `indeed-scan`, `newgrad-scan`) repointed at new files
- `verify-pipeline.mjs` extended to run new package's typecheck + tests
- `CLAUDE.md` Hot file map and run-flow sections updated; new `docs/architecture/own-browser.md`
- Old `*-bb-browser.ts` files and `./bb-browser/` directory **NOT removed in this change** — kept as manual fallback for a 7-day stability window. Removal happens in a follow-up change once acceptance is held.

**Not breaking** for daily user workflow: same `npm run *-scan` invocations, same outputs. **Breaking** internally for any code that directly spawned `bb-browser` outside the three scripts above (none known).

## Capabilities

### New Capabilities

- `own-browser`: In-process TypeScript library for CDP-attached browser automation. Owns the `BrowserController` + `Tab` API, Chrome lifecycle (`ensureChrome`), and the four site adapters auto-job consumes. Replaces the bb-browser CLI dependency for the scan path.

### Modified Capabilities

(none — `openspec/specs/` is currently empty; all behavior is new)

## Impact

- **Affected code:** `packages/browser/` (new), `scripts/{linkedin,job-board}-scan.ts` (new), `scripts/newgrad-scan-autonomous.ts` (modified), `package.json` (modified scripts), `verify-pipeline.mjs` (modified), `CLAUDE.md` (modified), `docs/architecture/own-browser.md` (new), `.gitignore` (add `~/.auto-job/` if not user-level)
- **Dependencies:** No new npm packages (playwright `^1.58.1` already root dep). Adds runtime requirement that user has Chrome / Chrome for Testing / Chromium installed.
- **External systems:** Creates `~/.auto-job/chrome-profile/` on first run (gitignored, user-machine local).
- **Reversibility:** Old `*-bb-browser.ts` scripts and `./bb-browser/` stay during 7-day window — full rollback is reverting `package.json` script lines.
- **Authoritative spec:** `docs/superpowers/specs/2026-05-03-own-browser-design.md` (already approved, contains all anchor + sub-decisions)
