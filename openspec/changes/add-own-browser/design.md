## Context

`auto-job` is a personal local-first job-search runtime. It currently invokes `bb-browser` (a third-party 36-platform/103-command CLI by epiral) via PATH binary spawning across three scan scripts. The dependency uses ~6 of bb-browser's commands and 3 of its 36 site adapters. Each invocation goes through process spawn → JSON envelope parse → in-process consumption.

Two pressures drive this change:

1. **Future direction:** auto-job's stated goal is automating job applications. That requires browser-mediated form filling and submission — surface bb-browser does not provide and we cannot extend without forking and maintaining unrelated functionality.
2. **Boundary clarity:** the current setup blocks direct typed access to browser state, forces JSON serialization at every command, and depends on a globally-installed external binary (PATH brittleness, version drift).

This change is **Phase 1** of a two-phase migration. Phase 1 is read-only (replace scan path). Phase 2 (separate change) adds write capability and requires explicit revision of `CLAUDE.md`'s "never submit" ethical clause.

Authoritative design context: `docs/superpowers/specs/2026-05-03-own-browser-design.md` (already approved). This OpenSpec design re-states the load-bearing decisions but does not duplicate the full architecture diagrams — see the superpowers spec for those.

## Goals / Non-Goals

**Goals:**

- Replace bb-browser as the browser-automation layer for the four scan flows: `linkedin-scan`, `builtin-scan`, `indeed-scan`, `newgrad-scan`.
- Provide a typed, in-process TypeScript API (`@auto-job/browser`) usable from any TS workspace package or script.
- Use a dedicated, isolated Chrome profile so future auto-apply work cannot accidentally affect the user's daily browsing session.
- Build on `playwright connectOverCDP` (zero new dependencies — playwright is already a root dep).
- Keep `./bb-browser/` and the old scan scripts available as a manual fallback for one week post-cutover. Removal happens in a follow-up change.

**Non-Goals (Phase 1):**

- Auto-fill, auto-submit, auto-click on Apply or any "next/continue" button. Phase 2.
- MCP server mode (bb-browser ships one; auto-job has never used it).
- Daemon process or HTTP server. Auto-job's consumers are long-running TS processes — no shared-CDP-across-processes scenario exists.
- bb-browser-style site/* generic CLI dispatch.
- Removing `./bb-browser/` directory in this change. Deferred to a follow-up change after the 7-day stability window.
- Editing `CLAUDE.md` ethical clauses. Phase 2 only.

## Decisions

### A1 — Phase 1 is read-only; Phase 2 (write) is a separate change

**Why:** Auto-submit collides with the project's existing `CLAUDE.md` rule ("Never submit, click Apply, click Next, or click Submit on the user's behalf"). That ethical revision is a product-direction decision that deserves its own deliberate review pass, and bundling it with the technical bb-browser swap would conflate the two debates.

**Alternative considered:** Single-phase write-from-day-one (faster to demo auto-apply but ships ethical change + technical change together — hard to roll back independently).

### A2 — Dedicated isolated Chrome profile, not the user's daily Chrome

**Why:** bb-browser's "use your real browser" model is elegant for read-only tooling but becomes a liability when Phase 2 starts auto-clicking. A separate profile (`~/.auto-job/chrome-profile/`) means an automation bug cannot affect the user's logged-in Gmail tab, OAuth sessions, payment cards, or browsing history. Costs one-time logins to four job sites — trivially worth it.

**Alternative considered:** Attach to user's daily Chrome (P) — rejected on safety grounds. Hybrid (R) — rejected as YAGNI.

### A3 — In-process TypeScript library, no daemon, no CLI

**Why:** All auto-job consumers (scan scripts, the local server) are themselves long-running TS processes. There is no scenario in this codebase where multiple short-lived processes need to share a CDP socket. A library import is end-to-end type-safe, ~2-3 lines shorter at every callsite, easier to debug (one process, one stack), and adds zero new infrastructure.

**Alternative considered:** Optional-daemon mode (T) — rejected as YAGNI per user's "minimum necessary replacement surface" directive. Full bb-browser-shape three-layer (U) — rejected; ~10x the code for capability auto-job will not use.

### A4 — Playwright `connectOverCDP` as the protocol-layer driver

**Why:** Playwright is already a root dependency. `connectOverCDP` exactly matches the "attach to a Chrome with `--remote-debugging-port`" model bb-browser uses. Hand-rolling CDP would re-discover thousands of edge cases playwright has already solved (frame management, popup handling, navigation timing). Our value-add is the `BrowserController` API and the four site adapters above playwright — not the protocol implementation.

**Alternative considered:** `chrome-remote-interface` (W) — rejected; mid-weight wrapper but auto-job needs higher-level abstractions, not lower. Raw CDP from scratch (X) — rejected; ~2000 lines of protocol code violates "minimum necessary replacement surface."

### D1 — New workspace package `packages/browser/` (not nested in `apps/server`)

**Why:** Symmetric with `packages/shared`. Independently testable, importable from `apps/server`, `apps/desktop`, and root scripts without circular workspace dependencies.

### D2 — Hardcoded TS site adapters, no dynamic file loader

**Why:** auto-job uses exactly four site adapters today and there is no roadmap for arbitrary user-contributed adapters. A file-loader framework would be cargo-culted from bb-browser's open-source-tool architecture without a corresponding need.

### D3 — `ensureChrome()` is idempotent: launch if down, attach if up

**Why:** Hides the launch/attach choice from consumer scripts. The first scan of the day starts Chrome; subsequent scans (or parallel scripts) attach to the running instance. No "did I launch it?" state for callers to track.

### D5 — CDP debug port `47320`

**Why:** Sequential with the bridge port `47319`. Easy to remember; easy to `lsof -i :47320` when debugging. Using playwright's default `9222` would conflict if the user happens to run another playwright project locally.

### D7 — Tab-pool API rather than implicit single-tab

**Why:** LinkedIn scan opens many job-detail tabs in parallel. An explicit tab object avoids hidden state and makes concurrent operations type-safe.

### D8 — Keep `./bb-browser/` and old `*-bb-browser.ts` files during 7-day stability window

**Why:** Insurance. If a site adapter has a subtle parse bug only visible on certain real-world responses, the user can manually invoke the old script (`npx tsx scripts/linkedin-scan-bb-browser.ts ...`) without waiting for a hot-fix. Removal happens in a follow-up OpenSpec change with verification.

## Risks / Trade-offs

- **Risk:** Adapter parse drift between captured fixtures and live responses → Mitigation: capture fresh fixtures via `bb-browser site … --json` at port time; per-adapter unit tests vs the captured shape; side-by-side dual-run during the 7-day window catches divergence before deletion.
- **Risk:** Playwright `connectOverCDP` regressions on future Chrome versions → Mitigation: option to pin Chrome for Testing version inside `ensureChrome` if a breaking Chrome update lands; user-installed Chrome remains the auto-detected fallback.
- **Risk:** One-time profile login is more painful than estimated → Mitigation: ship a `npm run own-browser:login-helper` that opens each target site in the dedicated profile and waits for the user to confirm login is complete.
- **Risk:** Hidden coupling to bb-browser-specific JSON envelope quirks → Mitigation: dual-run during step 13 of the migration plan (old + new path on the same query, diff outputs); a single hidden divergence resets the 7-day stability clock.
- **Trade-off:** Dedicated Chrome profile means ~10-20 minutes of one-time logins versus instant access via daily Chrome. Accepted on safety grounds (see A2).
- **Trade-off:** No daemon means each `apps/server` request that needs a browser pays one CDP-attach cost (~500ms-1s). For Phase 1 (scan scripts hold the connection for their full run) this is zero overhead. Phase 2 may revisit if extension-triggered apply latency becomes user-visible.

## Migration Plan

Detailed step-by-step in `tasks.md`. Summary:

1. Scaffold `packages/browser/` (package.json, tsconfig, vitest.config).
2. Implement `BrowserController` + `Tab` against `playwright.chromium.connectOverCDP`.
3. Port site adapters one at a time (builtin → indeed → jobright → linkedin), each with captured fixtures and unit tests.
4. Rewrite consumer scripts (`job-board-scan.ts`, `linkedin-scan.ts`, update `newgrad-scan-autonomous.ts`).
5. Repoint `package.json` script entries.
6. Wire `packages/browser` test/typecheck into `npm run verify`.
7. Update `CLAUDE.md` Hot file map; add `docs/architecture/own-browser.md`.
8. **7-day stability window:** new path is default; old path stays on disk and can be invoked manually as fallback. Any fallback usage resets the clock.
9. Removal of `./bb-browser/` and `*-bb-browser.ts` files happens in a **follow-up OpenSpec change** after the window closes.

**Rollback strategy:** revert the `package.json` script entries that point at new files; old `*-bb-browser.ts` scripts and the `./bb-browser/` directory remain on disk during the window. Full functional rollback is a single commit revert.

## Open Questions

None. All anchor and sub-decisions were locked during brainstorming and recorded in the authoritative spec at `docs/superpowers/specs/2026-05-03-own-browser-design.md`. New questions discovered during implementation should be added here and resolved with user input before continuing.
