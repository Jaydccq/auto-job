# Client-App Delivery Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure auto-job into a desktop application — single Electron app, single port, three evaluation backends (Codex CLI default, Claude CLI, OpenRouter API), no terminal commands required for daily use.

**Architecture:** Six-stage migration. (0) Reorganize `bridge/` + `web/` into one `server/` directory. (1) Drop the SDK adapter, keep CLI + fake adapters. (2) Add an OpenRouter API adapter. (3) Merge bridge and dashboard into one Fastify process on port 47319. (4) Optional one-day LaunchAgent quick win so the bridge auto-starts during the desktop-app build. (5) Build an Electron desktop app that embeds the server, exposes a menu-bar icon, and opens the dashboard as a native window. (6) Retire the LaunchAgent once the desktop app handles auto-launch.

**Tech Stack:** TypeScript (existing), Fastify (existing), Chrome MV3 extension (unchanged), Bun-first workspace packages for the apps/ + packages/ split, Electron 33+ with electron-builder, OpenRouter API for the new adapter, Node 20+.

**Relationship to existing plans:** Complementary to `docs/exec-plans/active/2026-04-27-auto-job-architecture-independence.md`, which owns rebrand / fork severing / module boundaries. This plan owns runtime delivery format. The two share `package.json` edits — coordinate via separate commits but no semantic conflicts.

---

## Background

**Problem:** To use the Chrome extension or dashboard today, the user must:

1. `cd` into the repo, `bun run server` — foreground Node process
2. `bun run dashboard` in a second terminal — another foreground Node process
3. Manually `Ctrl-C` both when done

Plus the codebase has fork-inherited cruft: 4 evaluation adapters where 2 are unused (`fake` for tests, `sdk` was a Phase 4 placeholder that never shipped); two separate Node servers (`bridge/` on 47319, `web/dashboard-server.mjs` on 47329) duplicating concerns; nine `bun run ext:*` scripts that are mode permutations.

**What this plan delivers:**
- Stage 0: One `server/` directory replaces `bridge/` + `web/`. Bun package commands wire it up.
- Stage 1: Adapter set is `fake | real-claude | real-codex` (default). `sdk-pipeline.ts` deleted.
- Stage 2: `real-openrouter` adapter added — uses OpenRouter's OpenAI-compatible HTTP API with an API key (no CLI auth needed).
- Stage 3: One server process on `127.0.0.1:47319` serves `/evaluate`, `/jobs/:id/subscribe`, `/dashboard/`, `/dashboard/api/*`. Dashboard reads token from a server-rendered meta tag.
- Stage 4 (optional): macOS LaunchAgent auto-starts the server during the Stage 5 build window.
- Stage 5: Electron app — main process imports the server module directly (no subprocess), `BrowserWindow` opens the dashboard, `Tray` provides menu-bar UI, `auto-launch` starts it at login.
- Stage 6: Remove LaunchAgent (covered by app's auto-launch), prune obsolete root scripts.

## Goal

**Done = all of the following:**

- After Stage 3: `bun run server` starts one Node process; `http://127.0.0.1:47319/dashboard/` works; extension popup connects to the same port.
- After Stage 5: Double-clicking `Auto Job.app` (built via `electron-builder`) launches the desktop app. Menu-bar icon shows status. "Open Dashboard" opens the embedded dashboard. The app auto-launches at login. Quitting stops the embedded server cleanly.
- All existing scan / evaluate / batch / extension / Gmail / dashboard flows still work. `verify-pipeline.mjs`, server tests, extension build all pass.
- Default evaluation runner is Codex CLI (`real-codex`). Claude CLI and OpenRouter are switchable via menu-bar setting or env var.

## Scope

**In scope:**
- Reorganize `bridge/` + `web/` into a single `server/` package
- Adopt workspace packages (`apps/extension`, `apps/server`, `apps/desktop`, `packages/shared`)
- Delete `sdk-pipeline.ts` and the 4+ package scripts pointing at it
- Add `openrouter-pipeline.ts` (uses OpenRouter HTTP API)
- Single port (47319) serving everything
- Electron desktop app with menu bar, dashboard window, auto-launch, server-as-module
- Optional macOS LaunchAgent transitional layer
- Documentation updates

**Out of scope:**
- Rewriting Codex/Claude CLI auth — they keep their per-user keychain models
- Migrating to Anthropic SDK — explicitly removed (only OpenRouter API + the two CLIs)
- Touching `extension/` UI/contracts (only the bridge URL it points at can change)
- Restructuring `scripts/` (scanner CLIs stay where they are; can be deferred to a separate plan)
- Linux / Windows packaging (Electron supports them, but verification is macOS-only here)
- Renaming the project (covered by architecture-independence plan)
- Removing fork attribution / `update-system.mjs` (covered by architecture-independence plan)
- Changing scan / evaluate semantics (modes/, prompts, scoring all unchanged)
- Touching user data (`data/`, `reports/`, `cv.md`, `config/profile.yml`)

## Assumptions

1. **macOS-only verification**, Darwin 25.2+. Electron supports Win/Linux but we don't sign / test those here.
2. **Bun-first package commands** — use Bun for documented installs and script execution while keeping the Node-compatible toolchain required by `bb-browser`, Playwright, Fastify, Electron, and TypeScript.
3. **Codex CLI is the default backend.** It needs to be on `$PATH` and authenticated. The desktop app surfaces backend errors clearly (e.g. "codex not on PATH") rather than silently falling back.
4. **OpenRouter API key** lives in `~/.config/auto-job/openrouter.key` (mode 0600) or `OPENROUTER_API_KEY` env var. Desktop app's settings panel lets the user paste it once.
5. **Server-as-module in Electron** — the Electron main process imports `server/index.ts`'s `createServer()` and runs it in-process. No child process. Means: server crash = app crash (visible to user, easy to restart). Acceptable.
6. **Existing token model preserved** — `bridge/.bridge-token` stays; extension still authenticates with it; dashboard reads it from a server-rendered meta tag.
7. **Stage ordering matters.** Don't start Stage 5 (Electron) before Stages 0-3. Stage 4 (LaunchAgent) is independently shippable and can run in parallel with Stage 5 development.
8. **No git history rewrite.** All restructure commits are normal `git mv` + edits; the diff is large but the history is preserved.

## Open Decisions

| ID | Question | Default if no answer |
|----|----------|----------------------|
| OD1 | **Electron vs Tauri 2 for the desktop app?** | **Electron** — TypeScript-only, simpler integration with existing Fastify server, no Rust learning curve, no sidecar codesign hassle. Pick Tauri only if distribution matters more than dev velocity. |
| OD2 | Pursue Stage 4 (LaunchAgent transitional) or skip directly to Stage 5? | Pursue Stage 4 — 1 day of work delivers immediate "no more terminal" wins while Stage 5 takes ~5-7 days |
| OD3 | OpenRouter default model (when user hasn't picked one)? | `anthropic/claude-3.5-sonnet` — closest to native Claude CLI behavior |
| OD4 | Where does the OpenRouter API key live? | `~/.config/auto-job/openrouter.key` (chmod 600). Env var `OPENROUTER_API_KEY` overrides. |
| OD5 | Does the desktop app start auto-launching by default after install, or via an explicit "Start at login" toggle? | **Explicit toggle** in settings, default OFF. User opts in. Less surprising. |

## Architecture Target

```
+------------------------------------------------------------------+
|  Auto Job.app (Electron — Stage 5)                             |
|                                                                  |
|   +--------------------+      +-----------------------------+    |
|   | Tray icon          | ---> | BrowserWindow (dashboard)   |    |
|   |  - Status: Running |      |  loads /dashboard/          |    |
|   |  - Open Dashboard  |      |  (embedded server)          |    |
|   |  - Backend: Codex  |      +-----------------------------+    |
|   |  - Settings        |                                         |
|   |  - View Logs       |                                         |
|   |  - Quit            |                                         |
|   +--------+-----------+                                         |
|            |                                                     |
|            | imports + supervises (in-process)                   |
|            v                                                     |
|   +-------------------------------------------------------+      |
|   | server (was bridge/ + web/) — Fastify on 127.0.0.1:47319 |   |
|   |   /health                                             |      |
|   |   /evaluate, /jobs/:id, /jobs/:id/subscribe (SSE)     |      |
|   |   /tracker/merge                                      |      |
|   |   /reports, /reports/:id                              |      |
|   |   /newgrad/score, /newgrad/enrich                     |      |
|   |   /autofill/profile                                   |      |
|   |   /dashboard/        (NEW)                            |      |
|   |   /dashboard/api/*   (NEW — was on port 47329)        |      |
|   +---------+--------------------------+----------------+--+    |
|             |                          |                |       |
|             v                          v                v       |
|   +------------------+   +-------------------+  +-------------+ |
|   | adapters         |   | filesystem        |  | OpenRouter  | |
|   |  fake (test)     |   | data/, reports/   |  | HTTP API    | |
|   |  real-codex (def)|   | cv.md, modes/     |  | (fetch)     | |
|   |  real-claude     |   +-------------------+  +-------------+ |
|   |  real-openrouter |                                          |
|   +--------+---------+                                          |
|            |                                                    |
|            v (CLI subprocess for claude/codex; HTTP for openrouter) |
|                                                                  |
+------------------------------------------------------------------+
                            ^
                            | HTTP loopback, X-Auto-Job-Token
                            |
+---------------------------+--------------------------------------+
| Chrome browser                                                   |
|   extension popup ---> :47319/evaluate  ---> evaluation          |
|   dashboard tab ------> :47319/dashboard ---> view               |
+------------------------------------------------------------------+
```

## File Structure (Target)

```
auto-job/
├── apps/
│   ├── desktop/                    [NEW — Stage 5]
│   │   ├── src/
│   │   │   ├── main.ts            (Electron main process)
│   │   │   ├── tray.ts            (menu-bar icon + menu)
│   │   │   ├── window.ts          (BrowserWindow for dashboard)
│   │   │   └── settings.ts        (backend picker, OpenRouter key)
│   │   ├── icons/                  (idle.png, running.png, error.png)
│   │   ├── electron-builder.yml
│   │   └── package.json
│   ├── extension/                  [MOVED from extension/]
│   │   └── (unchanged contents)
│   └── server/                     [MERGED from bridge/ + web/]
│       ├── src/
│       │   ├── index.ts           (createServer + start)
│       │   ├── routes/
│       │   │   ├── bridge.ts      (was server.ts route registrations)
│       │   │   ├── dashboard.ts   (NEW — serves dashboard HTML)
│       │   │   └── dashboard-api.ts (NEW — was web/dashboard-server.mjs)
│       │   ├── adapters/
│       │   │   ├── fake-pipeline.ts
│       │   │   ├── claude-pipeline.ts
│       │   │   ├── codex-pipeline.ts        (renamed from sdk path?)
│       │   │   └── openrouter-pipeline.ts   (NEW)
│       │   ├── contracts/         (PipelineAdapter, EvaluationInput, etc.)
│       │   ├── lib/
│       │   └── public/            (was web/template.html, web/assets/)
│       └── package.json
├── packages/
│   └── shared/                     [NEW — types shared by server + extension + desktop]
│       ├── src/
│       │   ├── contracts/         (bridge wire schema)
│       │   └── index.ts
│       └── package.json
├── scripts/                        [UNCHANGED — scanner CLIs]
├── modes/                          [UNCHANGED]
├── batch/                          [UNCHANGED]
├── data/                           [UNCHANGED — gitignored]
├── reports/                        [UNCHANGED — gitignored]
├── config/                         [UNCHANGED]
├── templates/                      [UNCHANGED + plist (Stage 4)]
├── docs/                           [UNCHANGED + new client-app docs]
├── workspace manifest              [NEW]
├── package.json                    [UPDATED — workspace root]
└── (root .mjs scripts unchanged for now — separate cleanup plan)
```

---

## Stage 0: Workspace + Directory Restructure

**Why first:** Every subsequent stage modifies files. Doing the move first means later stages don't have to handle "old path → new path" branches.

### Task 0.1: Create the workspace skeleton

**Files:**
- Create: workspace manifest
- Create: `apps/.gitkeep`, `packages/.gitkeep`
- Modify: `package.json` (add `"private": true`, remove dependencies that move into workspaces)

- [ ] **Step 1: Install Bun if not present**

Run: `which bun || curl -fsSL https://bun.sh/install | bash`
Expected: Bun version printed after shell reload.

- [ ] **Step 2: Create the workspace file**

Write the workspace manifest:

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

- [ ] **Step 3: Mark root as workspace root**

In `package.json`, add `"private": true` (top-level — workspaces require this):

```json
{
  "name": "auto-job",
  "private": true,
  "version": "1.0.0",
  ...
}
```

- [ ] **Step 4: Verify Bun can inspect the workspace**

```bash
bun install
bun pm ls
```

Expected: lists root only (no apps/packages yet). No errors.

- [ ] **Step 5: Commit**

```bash
git add package.json
git commit -m "chore(workspace): initialize package workspace skeleton"
```

### Task 0.2: Move `bridge/` to `apps/server/`

**Files:**
- Rename: `bridge/` → `apps/server/`
- Modify: `apps/server/package.json` (rename + scope)
- Modify: `package.json` (delete legacy bridge prefix references; replace with Bun package commands)

- [ ] **Step 1: Move the directory with git**

```bash
mkdir -p apps
git mv bridge apps/server
```

- [ ] **Step 2: Rename the package**

Edit `apps/server/package.json`:

```json
{
  "name": "@auto-job/server",
  "version": "0.1.0",
  ...
}
```

- [ ] **Step 3: Update all relative path references**

Run: `grep -rn "bridge/" --include="*.ts" --include="*.mjs" --include="*.json" --include="*.md" .`
For each match outside `archive/` or `.git/`:
- code/ts: replace `bridge/src/...` with `apps/server/src/...` if absolute, or update relative imports
- package scripts: replace `--prefix bridge` with `--filter @auto-job/server`

Key root-script changes:

```diff
-"builtin-scan": "./bridge/node_modules/.bin/tsx scripts/...",
+"builtin-scan": "./apps/server/node_modules/.bin/tsx scripts/...",
```

(Better long-term: install `tsx` at the workspace root so scripts can use the root binary. Defer that polish to Stage 6.)

- [ ] **Step 4: Reinstall**

```bash
bun install
```

Expected: `apps/server/node_modules` populated; no errors.

- [ ] **Step 5: Verify the server still builds and tests pass**

```bash
bun run --cwd apps/server typecheck
bun run --cwd apps/server test
```

Expected: green.

- [ ] **Step 6: Verify scanners still find the tsx binary**

```bash
bun run linkedin-scan -- --score-only --limit 1 --dry-run
```

Expected: scanner runs (or fails on missing site auth, which is environmental — not a code problem).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor(workspace): move bridge/ to apps/server/"
```

### Task 0.3: Move `extension/` to `apps/extension/`

**Files:**
- Rename: `extension/` → `apps/extension/`
- Modify: `apps/extension/package.json`

- [ ] **Step 1: Move with git**

```bash
git mv extension apps/extension
```

- [ ] **Step 2: Rename the package**

Edit `apps/extension/package.json`:

```json
{
  "name": "@auto-job/extension",
  ...
}
```

- [ ] **Step 3: Update root scripts**

In root `package.json`:

```diff
-"ext:build": "bun run ext:build",
+"ext:build": "bun run ext:build",
```

- [ ] **Step 4: Reinstall, build, typecheck**

```bash
bun install
bun run --cwd apps/extension typecheck
bun run ext:build
```

Expected: green.

- [ ] **Step 5: Smoke the built extension in Chrome**

Reload the unpacked extension in chrome://extensions; popup still loads.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor(workspace): move extension/ to apps/extension/"
```

### Task 0.4: Inventory what's in `web/` and plan the merge

**Files:** read-only.

- [ ] **Step 1: Read every file in web/**

```bash
ls -la web/
```

For each: note its purpose. Expected files:
- `dashboard-server.mjs` — Express-like Node server (will be replaced)
- `template.html` — dashboard HTML shell (will move to server static)
- `build-dashboard.mjs` — produces a static `web/index.html` (decide: keep as separate command for portfolio export)
- `index.html` — static export (gitignored or generated, no source-of-truth role)
- `assets/` if present — JS/CSS

- [ ] **Step 2: Inventory dashboard-server.mjs endpoints**

```bash
grep -n "app\.\(get\|post\|put\|delete\|use\)" web/dashboard-server.mjs
```

List every route. Each will become a Fastify route in `apps/server/src/routes/dashboard-api.ts` during Stage 3.

- [ ] **Step 3: Document the inventory in this plan's Progress Log**

Add a code block listing the routes with their methods. Stage 3 references this list.

- [ ] **Step 4: No code changes — commit only if the plan was edited**

(Skip if plan unchanged.)

### Task 0.5: Create `packages/shared`

**Files:**
- Create: `packages/shared/package.json`, `packages/shared/tsconfig.json`, `packages/shared/src/index.ts`

- [ ] **Step 1: Scaffold the package**

```bash
mkdir -p packages/shared/src
```

`packages/shared/package.json`:

```json
{
  "name": "@auto-job/shared",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "src/index.ts",
  "types": "src/index.ts"
}
```

`packages/shared/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src"]
}
```

`packages/shared/src/index.ts`:

```typescript
// Shared types between server, extension, and desktop. Populated incrementally.
export {};
```

- [ ] **Step 2: Move shared contracts in**

The extension currently re-exports types from `apps/server/src/contracts/`. Identify which types are shared:

```bash
grep -n "from.*bridge.*contracts\|from.*server.*contracts" apps/extension/src/
```

For each shared type (e.g. `EvaluationInput`, `JobEvent`, `JobSnapshot`, `BridgeWireResponse`), move it to `packages/shared/src/contracts/`.

- [ ] **Step 3: Add cross-package dependencies**

In `apps/server/package.json` and `apps/extension/package.json`, add:

```json
"dependencies": {
  "@auto-job/shared": "workspace:*",
  ...
}
```

- [ ] **Step 4: Update imports**

In server and extension code, change `from "./contracts"` to `from "@auto-job/shared"` for the moved types.

- [ ] **Step 5: Reinstall + typecheck both apps**

```bash
bun install
bun run --cwd packages/shared typecheck && bun run --cwd apps/server typecheck && bun run --cwd apps/extension typecheck && bun run --cwd apps/desktop typecheck
```

Expected: green.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor(workspace): extract @auto-job/shared for cross-app types"
```

**Stage 0 exit criteria:** `bun run --cwd packages/shared typecheck && bun run --cwd apps/server typecheck && bun run --cwd apps/extension typecheck && bun run --cwd apps/desktop typecheck` green; extension builds; server tests pass; `bun run linkedin-scan` (and other scanners) still resolve `tsx` correctly.

---

## Stage 1: Adapter Cleanup — Drop SDK, Keep Fake + CLI

### Task 1.1: Identify SDK adapter usage

**Files:** read-only.

- [ ] **Step 1: Find every reference**

```bash
grep -rn "sdk-pipeline\|real-sdk\|legacy-bridge:sdk\|legacy-start:sdk" .
```

Expected: matches in `apps/server/src/adapters/sdk-pipeline.ts`, `package.json`, `scripts/bridge-start.mjs`, possibly `docs/`.

### Task 1.2: Delete the SDK adapter

**Files:**
- Delete: `apps/server/src/adapters/sdk-pipeline.ts` (and its test if any)
- Modify: `apps/server/src/adapters/index.ts` (or wherever the adapter registry lives)
- Modify: `scripts/bridge-start.mjs` (remove `sdk` mode)
- Modify: `package.json` (remove `legacy-bridge:sdk`, `legacy-start:sdk`)

- [ ] **Step 1: Delete the file**

```bash
git rm apps/server/src/adapters/sdk-pipeline.ts
git rm apps/server/src/adapters/sdk-pipeline.test.ts 2>/dev/null || true
```

- [ ] **Step 2: Remove from registry**

Open `apps/server/src/adapters/index.ts` (or the module that exposes adapters). Remove the SDK case from the switch / map.

Expected post-edit (illustrative):

```typescript
export type AdapterMode = "fake" | "real-claude" | "real-codex" | "real-openrouter";
//                                                              ^^^^^^^^^^^^^^^^^^^^ added in Stage 2

export function createAdapter(mode: AdapterMode): PipelineAdapter {
    switch (mode) {
        case "fake":          return new FakePipeline();
        case "real-claude":   return new ClaudePipeline();
        case "real-codex":    return new CodexPipeline();
        // case "real-openrouter": added in Stage 2
        default: throw new Error(`unknown adapter mode: ${mode}`);
    }
}
```

- [ ] **Step 3: Remove from `bridge-start.mjs`**

Find the `case "sdk":` block in `scripts/bridge-start.mjs` and delete it. Update the help text too.

- [ ] **Step 4: Remove from `package.json`**

Delete these scripts:
- `legacy-bridge:sdk`
- `legacy-start:sdk`

- [ ] **Step 5: Run typecheck and tests**

```bash
bun run --cwd packages/shared typecheck && bun run --cwd apps/server typecheck && bun run --cwd apps/extension typecheck && bun run --cwd apps/desktop typecheck
bun run --cwd apps/server test
```

Expected: green.

- [ ] **Step 6: Verify no stragglers**

```bash
grep -rn "sdk-pipeline\|real-sdk\|legacy-bridge:sdk\|legacy-start:sdk" .
```

Expected: only in this plan, archive/, or release notes.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor(server): remove SDK adapter (replaced by OpenRouter in Stage 2)"
```

### Task 1.3: Collapse remaining mode scripts

The remaining scripts are `legacy bridge script`, `legacy-bridge:claude`, `legacy-bridge:fake`, `legacy start script`, `legacy-start:claude`, `legacy-start:fake`. After OpenRouter lands we'll add `legacy-bridge:openrouter` — but the right answer is to collapse all of them into one env-driven script.

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Replace 6 scripts with 2**

```diff
-"legacy bridge script":         "node scripts/bridge-start.mjs real-codex",
-"legacy-bridge:claude":  "node scripts/bridge-start.mjs real-claude",
-"legacy-bridge:fake":    "node scripts/bridge-start.mjs fake",
-"legacy start script":          "bun run ext:build && node scripts/bridge-start.mjs real-codex",
-"legacy-start:claude":   "bun run ext:build && node scripts/bridge-start.mjs real-claude",
-"legacy-start:fake":     "bun run ext:build && node scripts/bridge-start.mjs fake",
+"server":             "node scripts/bridge-start.mjs ${AUTO_JOB_BACKEND:-real-codex}",
+"ext:build":          "bun run --cwd apps/extension build"
```

Run the extension build separately with `bun run ext:build` when the unpacked extension needs to be refreshed.

- [ ] **Step 2: Update `bridge-start.mjs` to read the env var**

Change the arg parsing to fall back to `process.env.AUTO_JOB_BACKEND` if no positional arg.

- [ ] **Step 3: Search and update callers**

```bash
grep -rn "bun run server" --include="*.md" --include="*.mjs" --include="*.ts" .
```

For each match, update to `bun run server` or `AUTO_JOB_BACKEND=fake bun run server`.

- [ ] **Step 4: Sanity smoke**

```bash
AUTO_JOB_BACKEND=fake bun run server &
sleep 3
curl -s -H "X-Auto-Job-Token: $(cat apps/server/.bridge-token)" http://127.0.0.1:47319/health
kill %1
```

Expected: `{"status":"ok",...}` printed.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(scripts): collapse legacy bridge script mode variants into env-driven server script"
```

**Stage 1 exit criteria:** `apps/server/src/adapters/` contains exactly `fake-pipeline.ts`, `claude-pipeline.ts`, `codex-pipeline.ts`. `package.json` has one server script. All tests pass.

---

## Stage 2: OpenRouter API Adapter

OpenRouter exposes an OpenAI-compatible chat completions endpoint that fronts Anthropic, OpenAI, Google, and others. This adapter lets the user run evaluations without having Claude or Codex CLI installed/authenticated — useful for the desktop app's "no terminal setup" promise.

### Task 2.1: Read the contract that fake/claude/codex pipelines implement

**Files:** read-only.

- [ ] **Step 1: Read the adapter contract**

```bash
cat apps/server/src/contracts/pipeline.ts
```

Document the public interface (likely `PipelineAdapter` with methods like `evaluate(input): AsyncGenerator<JobEvent>`).

- [ ] **Step 2: Read the simplest existing adapter (fake) for shape**

```bash
cat apps/server/src/adapters/fake-pipeline.ts
```

Use this as the structural template for the OpenRouter adapter — same lifecycle, different "do the work" body.

### Task 2.2: Write the failing test

**Files:**
- Create: `apps/server/src/adapters/openrouter-pipeline.test.ts`

- [ ] **Step 1: Write the test**

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { OpenRouterPipeline } from "./openrouter-pipeline";

describe("OpenRouterPipeline", () => {
    beforeEach(() => {
        vi.stubEnv("OPENROUTER_API_KEY", "sk-or-test-key");
    });

    it("emits pending → evaluating → complete for a basic input", async () => {
        const fetchMock = vi.fn(async () => new Response(
            // Minimal SSE-like response — adapter should parse it
            new ReadableStream({
                start(controller) {
                    controller.enqueue(new TextEncoder().encode(
                        'data: {"choices":[{"delta":{"content":"# Block A\\n"}}]}\n\n' +
                        'data: {"choices":[{"delta":{"content":"Role: ..."}}]}\n\n' +
                        'data: [DONE]\n\n'
                    ));
                    controller.close();
                }
            }),
            { status: 200, headers: { "Content-Type": "text/event-stream" } }
        ));
        global.fetch = fetchMock as typeof fetch;

        const pipeline = new OpenRouterPipeline({
            apiKey: "sk-or-test-key",
            model: "anthropic/claude-3.5-sonnet"
        });

        const events: string[] = [];
        for await (const evt of pipeline.evaluate({
            url: "https://example.com/job",
            pageText: "We are hiring an engineer.",
            title: "Engineer",
            evaluationMode: "default",
            structuredSignals: {}
        })) {
            events.push(evt.phase);
        }

        expect(events[0]).toBe("pending");
        expect(events).toContain("evaluating");
        expect(events.at(-1)).toBe("complete");
        expect(fetchMock).toHaveBeenCalledWith(
            "https://openrouter.ai/api/v1/chat/completions",
            expect.objectContaining({
                method: "POST",
                headers: expect.objectContaining({
                    "Authorization": "Bearer sk-or-test-key",
                    "Content-Type": "application/json"
                })
            })
        );
    });

    it("throws if no API key", () => {
        vi.stubEnv("OPENROUTER_API_KEY", "");
        expect(() => new OpenRouterPipeline({ apiKey: "" }))
            .toThrow(/OPENROUTER_API_KEY/);
    });

    it("emits error event when API returns non-200", async () => {
        global.fetch = vi.fn(async () => new Response("rate limited", { status: 429 })) as typeof fetch;

        const pipeline = new OpenRouterPipeline({
            apiKey: "sk-or-test-key",
            model: "anthropic/claude-3.5-sonnet"
        });

        const events = [];
        for await (const evt of pipeline.evaluate({ url: "x", pageText: "y", title: "z", evaluationMode: "default", structuredSignals: {} })) {
            events.push(evt);
        }

        expect(events.at(-1)?.phase).toBe("error");
        expect(events.at(-1)?.error).toMatch(/429|rate/i);
    });
});
```

- [ ] **Step 2: Run, watch fail**

```bash
bun run --cwd apps/server test -- openrouter-pipeline.test.ts
```

Expected: `Cannot find module ./openrouter-pipeline`.

### Task 2.3: Implement the adapter

**Files:**
- Create: `apps/server/src/adapters/openrouter-pipeline.ts`

- [ ] **Step 1: Read the prompt builder used by codex/claude pipelines**

The adapter has to render the system prompt from `modes/oferta.md` (or whichever mode was requested). Look at how `claude-pipeline.ts` does it — likely there's a `renderPrompt(input, mode)` helper. Reuse it.

- [ ] **Step 2: Write the adapter**

```typescript
import type { PipelineAdapter, EvaluationInput, JobEvent } from "../contracts/pipeline";
import { renderPrompt } from "../lib/prompt-builder"; // existing helper
import { writeReport } from "../lib/report-writer";    // existing helper

interface OpenRouterConfig {
    apiKey: string;
    model?: string;        // default anthropic/claude-3.5-sonnet
    baseUrl?: string;      // default https://openrouter.ai/api/v1
    timeout?: number;      // default 600_000 (10 min)
}

export class OpenRouterPipeline implements PipelineAdapter {
    private cfg: Required<OpenRouterConfig>;

    constructor(cfg: OpenRouterConfig) {
        if (!cfg.apiKey) {
            throw new Error("OPENROUTER_API_KEY required for OpenRouter adapter");
        }
        this.cfg = {
            apiKey: cfg.apiKey,
            model: cfg.model ?? "anthropic/claude-3.5-sonnet",
            baseUrl: cfg.baseUrl ?? "https://openrouter.ai/api/v1",
            timeout: cfg.timeout ?? 600_000
        };
    }

    async *evaluate(input: EvaluationInput): AsyncGenerator<JobEvent> {
        yield { phase: "pending", jobId: input.jobId ?? crypto.randomUUID() };
        yield { phase: "detecting" };

        const prompt = await renderPrompt(input);
        yield { phase: "evaluating" };

        const ac = new AbortController();
        const timer = setTimeout(() => ac.abort(), this.cfg.timeout);

        try {
            const res = await fetch(`${this.cfg.baseUrl}/chat/completions`, {
                method: "POST",
                signal: ac.signal,
                headers: {
                    "Authorization": `Bearer ${this.cfg.apiKey}`,
                    "Content-Type": "application/json",
                    "HTTP-Referer": "https://auto-job.local",
                    "X-Title": "Auto Job"
                },
                body: JSON.stringify({
                    model: this.cfg.model,
                    messages: [
                        { role: "system", content: prompt.system },
                        { role: "user",   content: prompt.user }
                    ],
                    stream: true,
                    temperature: 0.3
                })
            });

            if (!res.ok) {
                const text = await res.text();
                yield { phase: "error", error: `OpenRouter ${res.status}: ${text.slice(0, 200)}` };
                return;
            }

            let buffer = "";
            const reader = res.body!.getReader();
            const decoder = new TextDecoder();

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });

                // Parse SSE chunks; OpenRouter emits OpenAI-style {choices: [{delta: {content}}]}
                const lines = buffer.split("\n");
                buffer = lines.pop() ?? "";
                for (const line of lines) {
                    if (!line.startsWith("data:")) continue;
                    const payload = line.slice(5).trim();
                    if (payload === "[DONE]") continue;
                    try {
                        const json = JSON.parse(payload);
                        const delta = json.choices?.[0]?.delta?.content;
                        if (delta) {
                            // (optional) yield streaming token events here if the contract supports them
                            // for now, accumulate; report is written at the end
                            (this as any)._accumulated = ((this as any)._accumulated ?? "") + delta;
                        }
                    } catch {
                        // ignore malformed chunks
                    }
                }
            }

            const fullReport = (this as any)._accumulated as string;
            const reportPath = await writeReport(input, fullReport);
            yield { phase: "complete", reportPath };
        } catch (err) {
            yield { phase: "error", error: (err as Error).message };
        } finally {
            clearTimeout(timer);
        }
    }
}
```

(Polish — the cast to `any` should be replaced with a proper accumulator field; this is pseudocode-shaped illustrative. The engineer implementing should clean it up.)

- [ ] **Step 3: Re-run the test**

```bash
bun run --cwd apps/server test -- openrouter-pipeline.test.ts
```

Expected: green.

- [ ] **Step 4: Add to the adapter registry**

In `apps/server/src/adapters/index.ts`, add the case:

```typescript
case "real-openrouter": return new OpenRouterPipeline({
    apiKey: process.env.OPENROUTER_API_KEY ?? readKeyFile(),
    model: process.env.OPENROUTER_MODEL
});
```

`readKeyFile()` reads `~/.config/auto-job/openrouter.key` (mode-checked).

- [ ] **Step 5: Update `scripts/bridge-start.mjs`**

Add `"real-openrouter"` to the accepted modes list.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(server): add OpenRouter API adapter"
```

### Task 2.4: Document the OpenRouter setup

**Files:**
- Create: `docs/adapters/openrouter.md`
- Modify: `docs/BROWSER_EXTENSION.md` (link to it)

- [ ] **Step 1: Write the doc**

```markdown
# OpenRouter Adapter

OpenRouter (https://openrouter.ai) is an OpenAI-compatible HTTP gateway for
Anthropic, OpenAI, Google, and other model providers. Use this adapter when:

- You don't have Claude CLI / Codex CLI installed locally
- You want to switch models without changing CLI authentication
- You're running the desktop app in a setting where CLI tools aren't appropriate

## Setup

1. Sign up at https://openrouter.ai and create an API key.
2. Save the key:

```bash
mkdir -p ~/.config/auto-job
echo "sk-or-..." > ~/.config/auto-job/openrouter.key
chmod 600 ~/.config/auto-job/openrouter.key
```

Or set `OPENROUTER_API_KEY` in your environment.

3. Run the server with the OpenRouter backend:

```bash
AUTO_JOB_BACKEND=real-openrouter bun run server
```

Or pick it from the desktop app's menu-bar settings.

## Model Selection

Default model: `anthropic/claude-3.5-sonnet`.

Override:

```bash
OPENROUTER_MODEL=anthropic/claude-3.5-sonnet bun run server
OPENROUTER_MODEL=openai/gpt-4o              bun run server
OPENROUTER_MODEL=google/gemini-2.0-flash    bun run server
```

See https://openrouter.ai/models for the full catalog.

## Cost

OpenRouter passes provider costs through with a small markup. Evaluation
prompts are typically 2-8K input tokens and 1-3K output tokens. At Claude 3.5
Sonnet rates (~$3/M input, $15/M output), one evaluation costs roughly
$0.02-$0.05.
```

- [ ] **Step 2: Commit**

```bash
git add docs/adapters/openrouter.md docs/BROWSER_EXTENSION.md
git commit -m "docs(adapters): document OpenRouter setup and model selection"
```

**Stage 2 exit criteria:** `OpenRouterPipeline` class exists, has unit tests, is in the adapter registry. Setting `AUTO_JOB_BACKEND=real-openrouter` + a valid key allows evaluations end-to-end. Smoke test: paste a JD URL in the extension; report is generated through OpenRouter.

---

## Stage 3: Single Process, Single Port

### Task 3.1: Move dashboard HTML and assets into `apps/server/src/public/`

**Files:**
- Move: `web/template.html` → `apps/server/src/public/dashboard.html`
- Move: `web/assets/*` (if exists) → `apps/server/src/public/assets/`

- [ ] **Step 1: Move with git**

```bash
mkdir -p apps/server/src/public
git mv web/template.html apps/server/src/public/dashboard.html
[ -d web/assets ] && git mv web/assets apps/server/src/public/assets
```

- [ ] **Step 2: Commit (file move only — references not yet updated)**

```bash
git commit -m "refactor(server): move dashboard HTML into apps/server/src/public/"
```

### Task 3.2: Add Fastify static + dashboard route

**Files:**
- Modify: `apps/server/package.json` (add `@fastify/static` if missing)
- Create: `apps/server/src/routes/dashboard.ts`
- Create: `apps/server/src/routes/dashboard.test.ts`
- Modify: `apps/server/src/server.ts` (or `index.ts`) to mount the route

- [ ] **Step 1: Install `@fastify/static`**

```bash
bun add --cwd apps/server @fastify/static
```

- [ ] **Step 2: Write the failing test**

```typescript
// apps/server/src/routes/dashboard.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startTestServer } from "../test-helpers/harness";

describe("dashboard route", () => {
    let server: Awaited<ReturnType<typeof startTestServer>>;
    beforeAll(async () => { server = await startTestServer({ mode: "fake" }); });
    afterAll(async () => { await server.stop(); });

    it("GET /dashboard/ returns the dashboard HTML with token meta", async () => {
        const res = await fetch(`${server.url}/dashboard/`);
        expect(res.status).toBe(200);
        expect(res.headers.get("content-type")).toMatch(/text\/html/);
        const html = await res.text();
        expect(html).toContain('meta name="auto-job-token"');
        expect(html).toContain(server.token);
    });

    it("GET /dashboard/ does not require auth header", async () => {
        const res = await fetch(`${server.url}/dashboard/`);
        expect(res.status).toBe(200);
    });

    it("GET /dashboard/assets/main.js serves a static asset (if present)", async () => {
        const res = await fetch(`${server.url}/dashboard/assets/main.js`);
        expect([200, 404]).toContain(res.status);
        if (res.status === 200) {
            expect(res.headers.get("content-type")).toMatch(/javascript/);
        }
    });
});
```

- [ ] **Step 3: Run, watch fail**

```bash
bun run --cwd apps/server test -- dashboard.test.ts
```

Expected: 404 because route doesn't exist yet.

- [ ] **Step 4: Implement the route**

```typescript
// apps/server/src/routes/dashboard.ts
import { FastifyInstance } from "fastify";
import fastifyStatic from "@fastify/static";
import { join } from "node:path";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const PUBLIC_DIR = join(fileURLToPath(import.meta.url), "..", "..", "public");

export async function registerDashboard(app: FastifyInstance, opts: { token: string }) {
    await app.register(fastifyStatic, {
        root: join(PUBLIC_DIR, "assets"),
        prefix: "/dashboard/assets/",
        decorateReply: false
    });

    app.get("/dashboard/", async (req, reply) => {
        const html = await readFile(join(PUBLIC_DIR, "dashboard.html"), "utf8");
        const injected = html.replace(
            "</head>",
            `<meta name="auto-job-token" content="${escapeHtml(opts.token)}"></head>`
        );
        reply.type("text/html; charset=utf-8").send(injected);
    });
}

function escapeHtml(s: string): string {
    return s.replace(/[&<>"']/g, c => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]!));
}
```

Wire it up in `server.ts`:

```typescript
import { registerDashboard } from "./routes/dashboard";
// ... after other route registrations
await registerDashboard(app, { token: serverToken });
```

- [ ] **Step 5: Re-run the test**

```bash
bun run --cwd apps/server test -- dashboard.test.ts
```

Expected: green.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(server): serve dashboard HTML with token meta tag at /dashboard/"
```

### Task 3.3: Port dashboard API endpoints from `web/dashboard-server.mjs`

**Files:**
- Read: `web/dashboard-server.mjs`
- Create: `apps/server/src/routes/dashboard-api.ts`
- Create: `apps/server/src/routes/dashboard-api.test.ts`

- [ ] **Step 1: Use the inventory from Stage 0 Task 0.4**

Open the inventory you wrote into the Progress Log (Task 0.4 step 3). For each route, generate one test + one Fastify handler.

- [ ] **Step 2: Write all failing tests at once**

For each endpoint, a test that calls it through the server and checks the shape. Use a single test file with `describe.each(routes)` to keep it tight.

- [ ] **Step 3: Run, watch them all fail**

```bash
bun run --cwd apps/server test -- dashboard-api.test.ts
```

Expected: every test fails with 404.

- [ ] **Step 4: Implement endpoints one at a time**

For each, copy the handler body from `web/dashboard-server.mjs`, rewrite from Express to Fastify (`req.params`, `req.query`, `reply.send`), wire into the auth middleware (require `X-Auto-Job-Token`).

- [ ] **Step 5: Run tests after each port**

```bash
bun run --cwd apps/server test -- dashboard-api.test.ts
```

Expected: tests turn green one by one.

- [ ] **Step 6: Commit (one commit per ~3 endpoints, or one batch commit if small)**

```bash
git add -A
git commit -m "feat(server): port dashboard API endpoints from web/dashboard-server.mjs"
```

### Task 3.4: Update dashboard JS to talk to the new endpoint

**Files:**
- Modify: `apps/server/src/public/dashboard.html` (was `web/template.html`)

- [ ] **Step 1: Replace bare fetch calls**

Find every `fetch("http://127.0.0.1:47329/api/...")` (or relative `/api/...`) in the dashboard's inline JS. Replace with a token-aware helper:

```javascript
const TOKEN = document.querySelector('meta[name="auto-job-token"]').content;
async function api(path, opts = {}) {
    const res = await fetch(`/dashboard/api${path}`, {
        ...opts,
        headers: {
            "X-Auto-Job-Token": TOKEN,
            ...(opts.headers ?? {}),
            ...(opts.body ? { "Content-Type": "application/json" } : {})
        }
    });
    if (!res.ok) throw new Error(`${path}: ${res.status}`);
    return res.json();
}
```

- [ ] **Step 2: Replace every direct fetch in the dashboard JS**

```bash
grep -n "fetch(" apps/server/src/public/dashboard.html
```

Update each.

- [ ] **Step 3: Smoke test**

```bash
bun run server   # default real-codex
# in browser:
open http://127.0.0.1:47319/dashboard/
```

Expected: tracker, reports, pipeline, scan history, keywords tabs all load.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor(dashboard): use server-injected token and unified API endpoint"
```

### Task 3.5: Deprecate `web/dashboard-server.mjs`

**Files:**
- Modify: `web/dashboard-server.mjs`, `package.json`, `web/build-dashboard.mjs`

- [ ] **Step 1: Replace the file body with a deprecation notice**

```javascript
#!/usr/bin/env node
console.error(
    "web/dashboard-server.mjs is deprecated. The dashboard is now served by the\n" +
    "main server at http://127.0.0.1:47319/dashboard/.\n\n" +
    "Run `bun run server` and open the URL above.\n"
);
process.exit(1);
```

- [ ] **Step 2: Remove `dashboard` script from `package.json`** (keep typo `dashborad` if you want, but make both echo the new URL):

```json
"dashboard": "echo 'open http://127.0.0.1:47319/dashboard/'",
"dashborad": "echo 'open http://127.0.0.1:47319/dashboard/'"
```

- [ ] **Step 3: Decide what to do with `build-dashboard.mjs`**

This script generates a static `web/index.html` for portfolio export. It's separate from the server, so it can stay — but update it to read the source from `apps/server/src/public/dashboard.html`. (One-line path change.)

- [ ] **Step 4: Verify**

```bash
grep -rn "47329" --include="*.md" --include="*.mjs" --include="*.ts" .
```

Expected: only this plan, archived plans, and the deprecation notice mention 47329.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(web): deprecate standalone dashboard-server.mjs"
```

### Task 3.6: Full verification

- [ ] **Step 1: Run all checks**

```bash
bun run --cwd packages/shared typecheck && bun run --cwd apps/server typecheck && bun run --cwd apps/extension typecheck && bun run --cwd apps/desktop typecheck
bun run --cwd apps/server test
bun run ext:build
bun run verify
```

Expected: all green.

- [ ] **Step 2: End-to-end smoke**

Start the server, open the extension, paste a JD URL, watch evaluation complete, open dashboard, see the new report appear in the reports tab.

**Stage 3 exit criteria:** Single Node process serves both extension API and dashboard. `web/dashboard-server.mjs` deprecated. Dashboard works through 47319 with auth.

---

## Stage 4: LaunchAgent Quick Win (Optional, ~1 day)

Skip this stage if you want to go straight to Stage 5. Otherwise it gives you "extension always sees server" within a day, while Stage 5 takes a week.

### Task 4.1: Create plist template + installer

**Files:**
- Create: `templates/io.hongxi.auto-job.plist.template`
- Create: `scripts/install-launch-agent.mjs`
- Create: `scripts/uninstall-launch-agent.mjs`
- Create: `scripts/app-status.mjs`, `scripts/app-logs.mjs`

(Same as the previous plan revision — copying inline for self-containment.)

- [ ] **Step 1: Plist template**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key><string>io.hongxi.auto-job</string>
    <key>ProgramArguments</key>
    <array>
        <string>{{NODE_PATH}}</string>
        <string>{{REPO_PATH}}/scripts/bridge-start.mjs</string>
    </array>
    <key>WorkingDirectory</key><string>{{REPO_PATH}}</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key><string>{{USER_PATH}}</string>
        <key>HOME</key><string>{{HOME_PATH}}</string>
        <key>AUTO_JOB_BACKEND</key><string>real-codex</string>
        <key>AUTO_JOB_BRIDGE_HOST</key><string>127.0.0.1</string>
        <key>AUTO_JOB_BRIDGE_PORT</key><string>47319</string>
    </dict>
    <key>RunAtLoad</key><true/>
    <key>KeepAlive</key>
    <dict>
        <key>Crashed</key><true/>
        <key>SuccessfulExit</key><false/>
    </dict>
    <key>StandardOutPath</key><string>{{LOG_DIR}}/server.out.log</string>
    <key>StandardErrorPath</key><string>{{LOG_DIR}}/server.err.log</string>
    <key>ProcessType</key><string>Background</string>
</dict>
</plist>
```

- [ ] **Step 2: Installer**

```javascript
// scripts/install-launch-agent.mjs
#!/usr/bin/env node
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_PATH = resolve(fileURLToPath(import.meta.url), "../..");
const HOME = homedir();
const LABEL = "io.hongxi.auto-job";
const TEMPLATE = join(REPO_PATH, "templates", `${LABEL}.plist.template`);
const TARGET = join(HOME, "Library", "LaunchAgents", `${LABEL}.plist`);
const LOG_DIR = join(HOME, "Library", "Logs", "CareerOps");

if (process.platform !== "darwin") { console.error("macOS only."); process.exit(1); }

mkdirSync(LOG_DIR, { recursive: true });
const filled = readFileSync(TEMPLATE, "utf8")
    .replaceAll("{{NODE_PATH}}", execSync("which node").toString().trim())
    .replaceAll("{{REPO_PATH}}", REPO_PATH)
    .replaceAll("{{USER_PATH}}", execSync("zsh -i -c 'echo $PATH'").toString().trim())
    .replaceAll("{{HOME_PATH}}", HOME)
    .replaceAll("{{LOG_DIR}}", LOG_DIR);

if (existsSync(TARGET)) { try { execSync(`launchctl unload "${TARGET}"`, { stdio: "ignore" }); } catch {} }
writeFileSync(TARGET, filled, { mode: 0o644 });
execSync(`launchctl load "${TARGET}"`, { stdio: "inherit" });
console.log(`Installed: ${TARGET}\nLogs:      ${LOG_DIR}/server.{out,err}.log`);
```

- [ ] **Step 3: Uninstaller, status, logs scripts**

(Same as previous plan revision — see git history if needed.)

- [ ] **Step 4: Wire up `bun run app:*`**

```json
"app:install":   "node scripts/install-launch-agent.mjs",
"app:uninstall": "node scripts/uninstall-launch-agent.mjs",
"app:status":    "node scripts/app-status.mjs",
"app:logs":      "node scripts/app-logs.mjs",
"app:restart":   "launchctl kickstart -k gui/$(id -u)/io.hongxi.auto-job"
```

- [ ] **Step 5: Install + reboot test**

```bash
bun run app:install
bun run app:status   # RUNNING
# reboot, log back in
bun run app:status   # still RUNNING
```

- [ ] **Step 6: Commit (one commit per file or one batch)**

```bash
git add -A
git commit -m "feat(app): macOS LaunchAgent for auto-start during desktop-app build"
```

**Stage 4 exit criteria:** Reboot test passes. Extension shows Connected without manual server start. Logs at `~/Library/Logs/CareerOps/`.

---

## Stage 5: Electron Desktop App

This is the largest stage (~5-7 days). Sub-divided into 5 tasks.

### Task 5.1: Scaffold `apps/desktop`

**Files:**
- Create: `apps/desktop/package.json`, `apps/desktop/tsconfig.json`, `apps/desktop/src/main.ts`, `apps/desktop/electron-builder.yml`
- Create: `apps/desktop/icons/` (idle.png, running.png, error.png, app.icns)

- [ ] **Step 1: Initialize the package**

```bash
mkdir -p apps/desktop/src apps/desktop/icons
cd apps/desktop
bun init
```

`apps/desktop/package.json`:

```json
{
  "name": "@auto-job/desktop",
  "private": true,
  "version": "0.1.0",
  "main": "dist/main.js",
  "scripts": {
    "dev": "tsx src/main.ts",
    "build": "esbuild src/main.ts --bundle --platform=node --target=node20 --external:electron --outfile=dist/main.js",
    "package": "bun run build && electron-builder --mac"
  },
  "dependencies": {
    "@auto-job/server": "workspace:*",
    "@auto-job/shared": "workspace:*"
  },
  "devDependencies": {
    "electron": "^33.0.0",
    "electron-builder": "^25.0.0",
    "esbuild": "^0.24.0",
    "tsx": "^4.19.0",
    "typescript": "^5.6.0"
  }
}
```

- [ ] **Step 2: Install**

```bash
bun install
```

- [ ] **Step 3: Minimal main.ts that just opens an empty window**

```typescript
// apps/desktop/src/main.ts
import { app, BrowserWindow } from "electron";

app.whenReady().then(() => {
    const win = new BrowserWindow({ width: 1200, height: 800 });
    win.loadURL("about:blank");
});

app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
});
```

- [ ] **Step 4: Smoke**

```bash
bun run --cwd apps/desktop dev
```

Expected: blank Electron window appears.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(desktop): scaffold Electron app skeleton"
```

### Task 5.2: Embed the server in the main process

**Files:**
- Modify: `apps/desktop/src/main.ts`
- Possibly modify: `apps/server/src/index.ts` to export a `createServer()` function instead of starting on import.

- [ ] **Step 1: Refactor server entry to expose `createServer()`**

Look at `apps/server/src/index.ts` (or `server.ts`). Today it likely starts on import. Refactor to:

```typescript
// apps/server/src/index.ts
export async function createServer(opts: { backend?: AdapterMode } = {}) {
    const app = buildFastifyApp(...);
    return {
        app,
        async start(port = 47319, host = "127.0.0.1") {
            await app.listen({ port, host });
            return app;
        },
        async stop() { await app.close(); }
    };
}

// keep the existing CLI entry
if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const server = await createServer({ backend: process.env.AUTO_JOB_BACKEND as AdapterMode });
    await server.start();
}
```

- [ ] **Step 2: Verify CLI server still works after the refactor**

```bash
bun run server &
curl http://127.0.0.1:47319/health
kill %1
```

- [ ] **Step 3: Embed in Electron**

```typescript
// apps/desktop/src/main.ts
import { app, BrowserWindow } from "electron";
import { createServer } from "@auto-job/server";

let server: Awaited<ReturnType<typeof createServer>>;

app.whenReady().then(async () => {
    server = await createServer({ backend: "real-codex" });
    await server.start();

    const win = new BrowserWindow({ width: 1200, height: 800 });
    win.loadURL("http://127.0.0.1:47319/dashboard/");
});

app.on("before-quit", async () => {
    if (server) await server.stop();
});

app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
});
```

- [ ] **Step 4: Smoke**

```bash
bun run --cwd apps/desktop dev
```

Expected: window opens, dashboard loads inside it. Server accessible at 127.0.0.1:47319 from Chrome too.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(desktop): embed server as in-process module"
```

### Task 5.3: Menu-bar tray + menu items

**Files:**
- Create: `apps/desktop/src/tray.ts`, `apps/desktop/src/menu.ts`
- Modify: `apps/desktop/src/main.ts`

- [ ] **Step 1: Add the tray icon**

```typescript
// apps/desktop/src/tray.ts
import { Tray, Menu, BrowserWindow, shell, app } from "electron";
import { join } from "node:path";

export function createTray(window: BrowserWindow, opts: {
    onRestart: () => Promise<void>;
    backend: () => string;
}): Tray {
    const tray = new Tray(join(__dirname, "..", "icons", "running.png"));
    tray.setToolTip("Auto Job");

    function rebuildMenu() {
        const menu = Menu.buildFromTemplate([
            { label: `Backend: ${opts.backend()}`, enabled: false },
            { type: "separator" },
            { label: "Open Dashboard", click: () => { window.show(); window.focus(); } },
            { label: "Restart Server", click: () => opts.onRestart() },
            { label: "View Logs", click: () => shell.openPath(/* log path */ "") },
            { type: "separator" },
            { label: "Quit", click: () => app.quit() }
        ]);
        tray.setContextMenu(menu);
    }
    rebuildMenu();
    return tray;
}
```

- [ ] **Step 2: Wire into main.ts**

```typescript
import { createTray } from "./tray";
// after window is created:
const tray = createTray(win, {
    backend: () => process.env.AUTO_JOB_BACKEND ?? "real-codex",
    onRestart: async () => { await server.stop(); server = await createServer(); await server.start(); }
});
```

- [ ] **Step 3: Smoke**

```bash
bun run --cwd apps/desktop dev
```

Expected: menu-bar icon appears. Each menu item works.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(desktop): add menu-bar tray with status, restart, open-dashboard"
```

### Task 5.4: Settings — backend picker + OpenRouter key

**Files:**
- Create: `apps/desktop/src/settings.ts`
- Create: `apps/desktop/src/settings-window.html` (small preferences UI)
- Modify: `apps/desktop/src/main.ts`

- [ ] **Step 1: Add a settings window**

A minimal HTML form: dropdown for backend (`fake | real-claude | real-codex | real-openrouter`), text field for OpenRouter API key, checkbox for "Start at login".

- [ ] **Step 2: Wire menu item "Settings…"**

Opens the settings window. On save, writes to `~/.config/auto-job/settings.json`, restarts the embedded server with the new backend.

- [ ] **Step 3: OpenRouter key handling**

If user pastes a key, write it to `~/.config/auto-job/openrouter.key` (chmod 600). The OpenRouter adapter already reads this path (Stage 2).

- [ ] **Step 4: Auto-launch toggle**

Use Electron's built-in `app.setLoginItemSettings()`:

```typescript
app.setLoginItemSettings({
    openAtLogin: settings.startAtLogin,
    openAsHidden: true,    // start in tray, no window
    args: ["--hidden"]
});
```

- [ ] **Step 5: Smoke**

Toggle each option, verify behavior.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(desktop): settings window for backend, OpenRouter key, auto-launch"
```

### Task 5.5: Build + package

**Files:**
- Create: `apps/desktop/electron-builder.yml`

- [ ] **Step 1: Configure electron-builder**

```yaml
appId: io.hongxi.auto-job
productName: Auto Job
mac:
  category: public.app-category.productivity
  target: dmg
files:
  - "dist/**"
  - "icons/**"
  - "node_modules/**"
extraResources:
  - from: "../server/src/public"
    to: "public"
```

- [ ] **Step 2: Build**

```bash
bun run --cwd apps/desktop package
```

Expected: `apps/desktop/dist/Auto Job-0.1.0.dmg` created.

- [ ] **Step 3: Drag to /Applications, test**

Open `Auto Job.app` from /Applications.
Expected: app launches, tray icon visible, dashboard window opens.

- [ ] **Step 4: Test reboot + login**

If "Start at login" is on, app auto-starts after reboot.

- [ ] **Step 5: Commit + tag a v0 release locally**

```bash
git add -A
git commit -m "feat(desktop): electron-builder packaging config"
git tag desktop-v0.1.0
```

**Stage 5 exit criteria:** `Auto Job.app` runs from /Applications. Menu bar works. Settings persist. Embedded server runs on 47319, extension and dashboard both functional. Reboot test passes if auto-launch is on.

---

## Stage 6: Retire LaunchAgent + Final Cleanup

If Stage 4 was done, the LaunchAgent now overlaps with the desktop app's auto-launch.

### Task 6.1: Uninstall the LaunchAgent

- [ ] **Step 1: Run uninstaller**

```bash
bun run app:uninstall
```

- [ ] **Step 2: Remove the install/uninstall scripts**

```bash
git rm scripts/install-launch-agent.mjs scripts/uninstall-launch-agent.mjs
git rm scripts/app-status.mjs scripts/app-logs.mjs
git rm templates/io.hongxi.auto-job.plist.template
```

- [ ] **Step 3: Remove `app:*` scripts from `package.json`**

(Or repoint them at the desktop app: `app:install` becomes "open the .app".)

- [ ] **Step 4: Update docs**

`docs/CLIENT_APP.md` (or wherever LaunchAgent install was documented) — replace with desktop-app install instructions.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(app): retire LaunchAgent in favor of desktop app auto-launch"
```

### Task 6.2: Sweep for `bridge` / `web` references

After Stages 0-5, the `bridge/` and `web/` directories shouldn't be referenced anywhere. Catch stragglers.

- [ ] **Step 1: Search**

```bash
grep -rn "bridge/\|web/" --include="*.md" --include="*.mjs" --include="*.ts" --include="*.json" --include="*.yml" .
```

- [ ] **Step 2: Update each match**

Most should resolve to `apps/server/` or `apps/server/src/public/`.

- [ ] **Step 3: Update `CLAUDE.md`**

Reflect the new directory structure and entry points (one `bun run server` or just "open the app").

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor: clean up references to retired bridge/ and web/ paths"
```

**Stage 6 exit criteria:** Repo has no LaunchAgent install scripts, no `bridge/`, no `web/dashboard-server.mjs`. Single way to use the system: open `Auto Job.app`. Extension still works (dashboard URL unchanged at 47319).

---

## Verification Approach

**After each stage:**

```bash
bun run --cwd packages/shared typecheck && bun run --cwd apps/server typecheck && bun run --cwd apps/extension typecheck && bun run --cwd apps/desktop typecheck
bun run --cwd apps/server test
bun run ext:build
bun run verify
```

**Stage-specific smokes:**

| Stage | Smoke |
|-------|-------|
| 0 | `bun pm ls` shows workspace packages; existing scanners run |
| 1 | `AUTO_JOB_BACKEND=fake bun run server` starts; `/health` returns ok |
| 2 | `OPENROUTER_API_KEY=... AUTO_JOB_BACKEND=real-openrouter bun run server` evaluates a real JD |
| 3 | `http://127.0.0.1:47319/dashboard/` loads tracker + reports tabs |
| 4 | Reboot → `bun run app:status` shows RUNNING |
| 5 | Open `Auto Job.app` → tray icon → "Open Dashboard" → window with embedded dashboard |
| 6 | No `bridge/` or `web/dashboard-server.mjs` referenced anywhere live |

## Risks and Blockers

| Risk | Mitigation |
|------|-----------|
| Large `git mv` diff makes review hard | Each move is its own commit (Tasks 0.2, 0.3, 3.1) so reviewers see structure-only changes separately |
| Bun workspace layout breaks `tsx` resolution in scanners | Stage 0 Task 0.2 Step 6 explicitly verifies scanners still work; root-level `tsx` install in Stage 6 polish if needed |
| OpenRouter SSE format diverges from OpenAI's | Adapter test (Task 2.2) covers the contract; if OpenRouter changes its format, the test fails first, not the user |
| Codex CLI auth state not visible from Electron app | Settings panel "Test Backend" button (defer to Stage 5 polish) calls `/health` and reports per-adapter readiness |
| Embedding server in Electron main process means crash = app crash | Acceptable: user sees crash dialog, restarts app. Alternative (child process) adds complexity for marginal gain |
| Conflict with architecture-independence plan | Both plans modify `package.json` — coordinate by landing arch-independence Phase 1 (kills `update-system.mjs`) before this plan's Stage 1 (which prunes `legacy-bridge:*`). Different keys, no merge conflict expected. |
| `electron-builder` codesign fails on Sequoia | Skip notarization for personal use (drag .app to /Applications instead of distributing dmg); revisit if sharing |
| LaunchAgent (Stage 4) and desktop app (Stage 5) both running → two servers fight for port 47319 | Stage 6 Task 6.1 explicitly uninstalls the LaunchAgent before relying on the app for auto-launch |

## Decision Log

- 2026-04-27: User feedback — extension not merged into desktop app; only Claude/Codex CLI + OpenRouter API adapters; bridge/extension/web can be restructured; Electron or Tauri (recommend Electron); single port; codex default.
- 2026-04-27: Chose **Electron** over Tauri because (a) bridge is TypeScript and Electron's main process is Node — no sidecar needed, (b) avoids Rust learning curve and Tauri sidecar codesign complexity, (c) personal use makes bundle size irrelevant.
- 2026-04-27: Chose **Bun-first package commands** for the apps/ + packages/ split — no concept-rewrite needed.
- 2026-04-27: Chose **server-as-module in Electron main process** (not child process) — simpler, no IPC, and any crash is visible to the user.
- 2026-04-27: Default OpenRouter model is `anthropic/claude-3.5-sonnet` to mirror Claude CLI behavior.
- 2026-04-27: LaunchAgent stage is **optional and transitional** — gives a 1-day quick win during the ~1 week of Stage 5 development.

## Progress Log

- 2026-04-27 (initial): Plan created with LaunchAgent → tray → optional Tauri arc.
- 2026-04-27 (revision): Plan rewritten after user feedback. Key changes:
  - Added Stage 0 (workspace restructure into `apps/server`, `apps/extension`, `packages/shared`)
  - Stage 1 now removes the SDK adapter explicitly
  - Stage 2 adds the OpenRouter API adapter (new — replaces what SDK was supposed to do)
  - Old "Stage 3 tray app" replaced with "Stage 5 Electron desktop app"
  - LaunchAgent now optional (Stage 4) — explicitly transitional
  - Stage 6 added for cleanup (retire LaunchAgent, kill `bridge/web` references)
  - Removed Tauri stage (became OD1 — recommended Electron, deferred Tauri unless distribution matters)
- 2026-04-27 (Stage 0 Tasks 0.1-0.4 implemented on `feat/client-app-restructure`):
  - Task 0.1 commit `4ffde92`: workspace manifest + apps/.gitkeep + packages/.gitkeep + `"private": true`.
  - Task 0.2 commit `becfa28`: `git mv bridge apps/server`, package renamed to `@auto-job/server`, root scripts updated to workspace package commands, server tests 244/244 green.
  - Task 0.3 commit `4204a22`: `git mv extension apps/extension`, package renamed to `@auto-job/extension`, ext:build switched to the Bun-documented command, typecheck + build green.
  - Task 0.4 commit `b1e811c`: web/ inventory recorded (this entry — Stage 3 will absorb dashboard-server.mjs).
- Stage 0 Task 0.4 — `web/dashboard-server.mjs` route inventory (for Stage 3 reference):
  - Port 47329 loopback (env override `AUTO_JOB_PDF_PORT`, host `AUTO_JOB_PDF_HOST` default `127.0.0.1`).
  - Auth via `assertApiToken(req)` checking `x-auto-job-pdf-token` against `AUTO_JOB_PDF_TOKEN` env (random UUID fallback). Token injected into dashboard HTML at `GET /` via inline script.
  - CORS: single OPTIONS handler returns `*` / `GET,POST,OPTIONS` / `content-type,x-auto-job-pdf-token`.
  - Static: none — dashboard rendered in-process by `renderDashboardHtml()`. Reports served from `<repo>/reports/` with traversal guard.
  - Body parser: inline `readJsonBody` with 256 KiB cap.
  - Startup: kicks off `runGmailRefresh` non-blocking; lazy-reads bridge token at request time.

  | Method | Path | Auth | Purpose | Input | Output |
  |--------|------|------|---------|-------|--------|
  | OPTIONS | `*` | none | CORS preflight | — | 204 + CORS headers |
  | GET | `/` or `/index.html` | none | Render dashboard HTML with embedded API token | — | text/html |
  | GET | `/reports/{NNN-slug-YYYY-MM-DD}.md` | none | Serve evaluation report markdown | path | text/markdown or 404 |
  | GET | `/api/health` | none | Liveness + downloads dir | — | `{ok, downloadsDir}` |
  | POST | `/api/apply-docs/generate` | required | Generate CV / cover-letter PDF (spawns `generate-pdf.mjs` / `generate-cover-letter.mjs`); stores in in-memory docStore | `{type, company, role, score, notes, jobUrl, reportPath}` | `{ok, doc: {id, type, filename, outputPath}}` |
  | POST | `/api/apply-docs/download` | required | Copy generated doc from `output/` to `~/Downloads/` (auto-rename) | `{id}` | `{ok, doc: {...,savedPath}}` |
  | POST | `/api/apply-status` | required | Toggle tracker row Applied↔terminal; rewrites `data/applications.md` | `{num, applied}` | `{ok, status, changed}` |
  | POST | `/api/full-evaluation` | required | Queue full eval against bridge `POST /v1/evaluate`; reads cached JD + report URL | `{reportPath, company, role, score, status, notes, jobUrl?}` | 202, `{ok, jobId, bridgeBase}` |
  | POST | `/api/full-evaluation/status` | required | Poll bridge `/v1/jobs/{id}` snapshot | `{jobId}` | `{ok, job: {...}}` |
  | (any) | (other) | n/a | Fallback 404 | — | `{ok: false, error: 'not found'}` |
- Stage 0 Task 0.2 follow-on observations (worth noting for later stages):
  - `apps/server/src/runtime/config.ts` `findRepoRoot()` rewritten to walk up looking for `cv.md` + `modes/` + `data/` (was hard-coded to `..` from old `bridge/`). Robust but worth Stage 1 spot-check.
  - Two test files (`merge-tracker.test.ts`, `batch-runner.e2e.test.ts`) had `REPO_ROOT = resolve(import.meta.dirname, "../../..")` updated to `"../../../.."` due to extra dir-depth from the move.
  - `verify-pipeline.mjs` and `scripts/bridge-start.mjs` switched away from legacy bridge prefix commands. Any CI without Bun would break — sweep in Stage 6.
  - `web/dashboard-server.mjs` line 31 still references `bridge/.bridge-token` — intentionally left for Stage 3 to absorb.
- 2026-04-27 (Stage 3 complete on `feat/client-app-restructure`):
  - Commit 1 `7fe6375`: pure refactor — added 7 named exports + DI parameterization to web/dashboard-server.mjs.
  - Commit 2 `5f22096`: HTML + reports routes + auth allowlist (3 paths). +6 tests (247 → 253).
  - Commit 3 `4d28975`: 6 dashboard API endpoints with DI hooks. +13 tests (253 → 266).
  - Commit 4 `90aa06a`: dashboard JS uses bridge token + relative URLs. +1 regression test (266 → 267).
  - Commit 5 `deef483`: git mv web/dashboard-server.mjs → web/dashboard-handlers.mjs; new stub at original path; root scripts echo new URL; gmail-refresh startup hook intentionally NOT migrated.
  - Commit 6 `<sha>`: live smoke verified (HTML 200, API 401/200, bridge 200, 1 meta tag) + extension build green.
  - Out of scope (deferred): gmail-refresh startup hook, in-process loopback (currently fetches itself over 127.0.0.1), dashboard-server.mjs body fully removed.

- 2026-04-27 (Stage 4 complete): macOS LaunchAgent infrastructure landed
  on `feat/client-app-restructure`. Commits 711843f + 5335aea added
  `templates/io.hongxi.auto-job.plist.template`, install/uninstall/
  status/logs scripts, and `bun run app:*` targets. Not actually loaded
  yet — user runs `bun run app:install` when ready.

- 2026-04-27 (Stage 5 complete): Electron desktop app on
  `feat/client-app-restructure`.
  - 5.1 + 5.2 (commit 72ace28): apps/desktop scaffolded; in-process
    server via `createServer()` factory; sandboxed BrowserWindow at
    /dashboard/. Window-close stops server cleanly.
  - 5.3 (commit 5dfd259): menu-bar tray with Status / Backend / Open
    Dashboard / Restart / View Logs / Settings / Quit. window-all-closed
    no longer quits the app — tray is the persistent UI.
  - 5.4 (commit 6a8e5a7): settings window (backend dropdown,
    OpenRouter API key, Start at login). Settings persist to
    `~/.config/auto-job/settings.json`. IPC via contextBridge preload.
  - 5.5 (commits 290ab6b + b691a3f): electron-builder packaging.
    Initial commit produced a non-launching .app due to TypeScript
    source in @auto-job/server's main field; b691a3f fixed by
    adding tsc/esbuild build outputs to dist/ and using `exports`
    with a `development` condition so dev/test tools still resolve
    src/ while the packaged app reads dist/. Bundled .app launches,
    bridge listens on 47319, quit cleanly releases the port.

- 2026-04-27 (Stage 6 complete): mechanical cleanup. Live bridge/web
  references swept where actually broken (six `bridge/.bridge-token`
  paths in scripts + web/dashboard-handlers.mjs now point at
  `apps/server/.bridge-token`); `docs/BROWSER_EXTENSION.md` paths and
  backend-mode names updated to the post-restructure layout;
  `CLAUDE.md` Main Files table now lists `apps/server`, `apps/extension`,
  `apps/desktop`, `packages/shared`, and a new "Running the system"
  section documents the three valid setups (desktop app, LaunchAgent,
  manual); `README.md` gained a Quick start block. LaunchAgent
  infrastructure intentionally KEPT (Stage 6 plan revised) — desktop app
  and LaunchAgent serve different use cases (visual vs headless).

- 2026-04-27 (Stage final state): 267 server tests passing, all 4
  workspace projects typecheck clean, extension build green, .app
  bundle launches and serves dashboard. Branch ready for review on
  `feat/client-app-restructure`.
- 2026-04-28 (`/plan-eng-review` desktop handoff): captured two
  non-blocking concerns. `bun run --cwd apps/desktop dev`
  still fails in the tsx dev path with `ERR_INTERNAL_ASSERTION`, but this
  was already present in parent desktop commit `b691a3f` and the
  packaged app path remains the supported verification path. Tray/app
  icon assets are low-resolution placeholders and should be replaced when
  real artwork is available.
- 2026-04-28: Resolved both desktop handoff concerns. `dev` and `start`
  now compile first and run Electron from `dist/main.js`, avoiding the
  failing `tsx` loader path. Replaced the placeholder tray/app artwork
  with GPT-generated icon assets in `apps/desktop/icons/`.

## Final Outcome

Stages 0-6 are implemented and merged to `main`. The current supported
desktop path is the packaged Electron app:

```bash
bun run --cwd apps/desktop package:dir
open "apps/desktop/release/mac-arm64/Auto Job.app"
```

The desktop dev loop is now repaired by compiling before launch:

```bash
bun run --cwd apps/desktop dev
```

This avoids the `NODE_OPTIONS="--import tsx"` Electron loader path that
failed in parent desktop commit `b691a3f` with `ERR_INTERNAL_ASSERTION`.

Remaining deferred work:

1. Continue the separate architecture-independence Phases 2-6 after this
   desktop delivery handoff is accepted.

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | - | - |
| Codex Review | `/codex review` | Independent 2nd opinion | 0 | - | - |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | clean | Desktop dev-loop and icon concerns resolved |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | - | - |

**VERDICT:** ENG HANDOFF COMPLETE - desktop dev, build, package, and icon
paths are ready for normal use.
