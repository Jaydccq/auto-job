# Settings tabs — executor switcher + personal files editor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tabify the desktop Settings window and add (1) an executor switcher (codex/claude/openrouter/fake) with model + reasoning controls that auto-restarts the bridge, and (2) a personal-files editor for the 5 user-layer files with yaml-syntax validation and pre-write backup.

**Architecture:** All UI lives in `settings-window.html` as four tabs (General / New-grad / Personal files / Bridge). Settings persistence extends the existing `~/.config/auto-job/settings.json` with `codexModel`, `codexReasoningEffort`, `anthropicModel`. Main process translates those to env vars before `createServer()` and reruns `restartServer()` when the user changes them. Personal-files reads/writes go through new IPC handlers behind a strict 5-id allowlist; yaml files are syntax-checked before save and a backup is written to `~/.auto-job/personal-files-backups/` first.

**Tech Stack:** Electron (main + preload + renderer), TypeScript, `yaml@^2.8.3` (already a dep), existing `tray.ts` `onRestart` hook.

---

## File Structure

| File | Responsibility |
|---|---|
| `apps/desktop/src/settings.ts` | Persistent Settings struct; gains `codexModel?`, `codexReasoningEffort?`, `anthropicModel?` |
| `apps/desktop/src/main.ts` | Startup: settings → env vars; settings:save delta → `restartServer()` |
| `apps/desktop/src/personal-files.ts` (new) | Allowlist + read/write/backup helpers |
| `apps/desktop/src/settings-window.ts` | IPC handlers for personal-files + restart hook injection |
| `apps/desktop/src/settings-preload.ts` | Renderer-facing API surface |
| `apps/desktop/src/settings-window.html` | Tab strip + 4 tab panes (General / Newgrad / Personal files / Bridge) |
| `docs/exec-plans/active/2026-05-05-settings-tabs.md` | Progress log appended during implementation |

---

## Task 1: Extend Settings interface

**Files:**
- Modify: `apps/desktop/src/settings.ts`

- [ ] **Step 1: Add the three new fields to the Settings interface and DEFAULT_SETTINGS**

```ts
export interface Settings {
  backend: Backend;
  startAtLogin: boolean;
  /** OpenRouter model slug, e.g. "anthropic/claude-3.5-sonnet". Used only when
   *  backend === "real-openrouter". Trimmed string; never null. */
  openrouterModel: string;
  /** Override for AUTO_JOB_CODEX_MODEL when backend === "real-codex". Empty = use bridge default. */
  codexModel: string;
  /** Override for AUTO_JOB_CODEX_REASONING_EFFORT. One of "low" | "medium" | "high" | "". */
  codexReasoningEffort: string;
  /** Override for ANTHROPIC_MODEL when backend === "real-claude". Empty = CLI default. */
  anthropicModel: string;
}

export const DEFAULT_SETTINGS: Settings = {
  backend: "real-codex",
  startAtLogin: false,
  openrouterModel: DEFAULT_OPENROUTER_MODEL,
  codexModel: "",
  codexReasoningEffort: "",
  anthropicModel: "",
};
```

- [ ] **Step 2: Update loadSettings() to read the new fields**

Inside `loadSettings()`, replace the `return { backend, startAtLogin, openrouterModel }` block with:

```ts
return {
  backend: isBackend(raw.backend) ? raw.backend : DEFAULT_SETTINGS.backend,
  startAtLogin:
    typeof raw.startAtLogin === "boolean" ? raw.startAtLogin : DEFAULT_SETTINGS.startAtLogin,
  openrouterModel: modelRaw || DEFAULT_OPENROUTER_MODEL,
  codexModel: typeof raw.codexModel === "string" ? raw.codexModel.trim() : "",
  codexReasoningEffort:
    typeof raw.codexReasoningEffort === "string" ? raw.codexReasoningEffort.trim() : "",
  anthropicModel:
    typeof raw.anthropicModel === "string" ? raw.anthropicModel.trim() : "",
};
```

- [ ] **Step 3: Verify with typecheck**

Run: `npm --prefix apps/desktop run typecheck`
Expected: clean exit.

---

## Task 2: Translate settings to env vars at startup

**Files:**
- Modify: `apps/desktop/src/main.ts` (around the existing `currentBackend` / `currentOpenrouterModel` initialization)

- [ ] **Step 1: Replace the model-state initialization with a richer struct and an env-var applier**

Find the lines:

```ts
let currentBackend: AdapterMode = resolveBackend();
let currentOpenrouterModel: string = loadSettings().openrouterModel;
```

Replace with:

```ts
let currentSettings = loadSettings();
let currentBackend: AdapterMode = resolveBackend();

function applyExecutorEnv(s: Settings): void {
  const setOrUnset = (key: string, value: string) => {
    if (value) process.env[key] = value;
    else delete process.env[key];
  };
  setOrUnset("AUTO_JOB_CODEX_MODEL", s.codexModel);
  setOrUnset("AUTO_JOB_CODEX_REASONING_EFFORT", s.codexReasoningEffort);
  setOrUnset("ANTHROPIC_MODEL", s.anthropicModel);
}

applyExecutorEnv(currentSettings);
```

Add the `Settings` import at the top of the file alongside `loadSettings`.

- [ ] **Step 2: Update startServer() to read currentSettings**

Find:

```ts
server = createServer({
  backend: currentBackend,
  openrouterModel: currentOpenrouterModel,
});
```

Replace with:

```ts
server = createServer({
  backend: currentBackend,
  openrouterModel: currentSettings.openrouterModel,
});
```

And the log line — replace `currentOpenrouterModel` reference with `currentSettings.openrouterModel`.

- [ ] **Step 3: Typecheck**

Run: `npm --prefix apps/desktop run typecheck`
Expected: clean exit.

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src/settings.ts apps/desktop/src/main.ts
git commit -m "feat(desktop): persist codex/anthropic model overrides in settings"
```

---

## Task 3: Restart bridge when executor settings change

**Files:**
- Modify: `apps/desktop/src/settings-window.ts`
- Modify: `apps/desktop/src/main.ts`

- [ ] **Step 1: Pass restart hook into openSettingsWindow**

In `apps/desktop/src/settings-window.ts`, change the function signature:

```ts
export interface OpenSettingsHooks {
  onSaved: (next: Settings) => Promise<void> | void;
  onRestart: () => Promise<void>;
}

export function openSettingsWindow(hooks: OpenSettingsHooks): void {
```

Update internal references from `onSaved(next)` to `hooks.onSaved(next)`.

- [ ] **Step 2: Compute needsRestart in settings:save**

Replace the `settings:save` handler body with:

```ts
ipcMain.handle("settings:save", async (_e, payload: SavePayload) => {
  const current = loadSettings();
  const trimmedModel =
    typeof payload.openrouterModel === "string" ? payload.openrouterModel.trim() : "";
  const trimmedCodexModel =
    typeof payload.codexModel === "string" ? payload.codexModel.trim() : "";
  const trimmedCodexEffort =
    typeof payload.codexReasoningEffort === "string"
      ? payload.codexReasoningEffort.trim()
      : "";
  const trimmedAnthropic =
    typeof payload.anthropicModel === "string" ? payload.anthropicModel.trim() : "";
  const next: Settings = {
    backend: payload.backend ?? current.backend,
    startAtLogin:
      typeof payload.startAtLogin === "boolean" ? payload.startAtLogin : current.startAtLogin,
    openrouterModel:
      payload.openrouterModel === undefined
        ? current.openrouterModel
        : trimmedModel || DEFAULT_OPENROUTER_MODEL,
    codexModel:
      payload.codexModel === undefined ? current.codexModel : trimmedCodexModel,
    codexReasoningEffort:
      payload.codexReasoningEffort === undefined
        ? current.codexReasoningEffort
        : trimmedCodexEffort,
    anthropicModel:
      payload.anthropicModel === undefined ? current.anthropicModel : trimmedAnthropic,
  };
  saveSettings(next);
  if (payload.openrouterKey) saveOpenRouterKey(payload.openrouterKey);

  if (process.platform === "darwin") {
    app.setLoginItemSettings({
      openAtLogin: next.startAtLogin,
      openAsHidden: true,
    });
  }

  const needsRestart =
    next.backend !== current.backend ||
    next.openrouterModel !== current.openrouterModel ||
    next.codexModel !== current.codexModel ||
    next.codexReasoningEffort !== current.codexReasoningEffort ||
    next.anthropicModel !== current.anthropicModel;

  await hooks.onSaved(next);
  if (needsRestart) {
    try {
      await hooks.onRestart();
    } catch (err) {
      console.error("[settings] bridge restart failed:", err);
    }
  }
  return { ok: true, restarted: needsRestart };
});
```

Add the SavePayload fields:

```ts
interface SavePayload {
  backend?: Settings["backend"];
  startAtLogin?: boolean;
  openrouterKey?: string | null;
  openrouterModel?: string | null;
  codexModel?: string | null;
  codexReasoningEffort?: string | null;
  anthropicModel?: string | null;
}
```

- [ ] **Step 3: Update main.ts call site**

Find the `openSettingsWindow` call (in tray hooks). Update from:

```ts
openSettingsWindow(async (next) => { ... })
```

to:

```ts
openSettingsWindow({
  onSaved: async (next) => {
    currentSettings = next;
    applyExecutorEnv(next);
    currentBackend = mapBackendToAdapter(next.backend);
    trayController?.rebuild();
  },
  onRestart: async () => {
    await restartServer();
  },
});
```

If a `mapBackendToAdapter` helper doesn't exist, derive `currentBackend` from `resolveBackend()` again — env var still wins, otherwise read from `next.backend` directly:

```ts
function backendToAdapter(b: Settings["backend"]): AdapterMode {
  return b as AdapterMode;
}
```

(`Backend` already coincides with `AdapterMode` values; no real conversion needed.)

- [ ] **Step 4: Typecheck**

Run: `npm --prefix apps/desktop run typecheck`
Expected: clean exit.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/settings-window.ts apps/desktop/src/main.ts
git commit -m "feat(desktop): restart bridge when executor settings change"
```

---

## Task 4: General tab UI — model selectors

**Files:**
- Modify: `apps/desktop/src/settings-window.html`

- [ ] **Step 1: Add codex + anthropic model selectors after the backend dropdown**

Find the existing backend `<select>` and the `<div id="openrouter-section">` block. Insert two new sibling sections between them — one for codex, one for claude. They mirror `openrouter-section`'s show/hide pattern.

```html
<div id="codex-section" class="hidden">
  <label for="codex-model">Codex model</label>
  <select id="codex-model">
    <option value="">(bridge default)</option>
    <option value="gpt-5.4-mini">gpt-5.4-mini — cheap default</option>
    <option value="gpt-5.4">gpt-5.4 — balanced</option>
    <option value="gpt-5.4-pro">gpt-5.4-pro — strong reasoning</option>
    <option value="gpt-5.5">gpt-5.5 — frontier</option>
  </select>

  <label for="codex-effort">Reasoning effort</label>
  <select id="codex-effort">
    <option value="">(bridge default)</option>
    <option value="low">low</option>
    <option value="medium">medium</option>
    <option value="high">high</option>
  </select>
</div>

<div id="claude-section" class="hidden">
  <label for="anthropic-model">Anthropic model</label>
  <select id="anthropic-model">
    <option value="">(claude CLI default)</option>
    <option value="claude-sonnet-4-6">claude-sonnet-4-6 — balanced</option>
    <option value="claude-opus-4-7">claude-opus-4-7 — best</option>
    <option value="claude-haiku-4-5">claude-haiku-4-5 — fast &amp; cheap</option>
  </select>
</div>
```

- [ ] **Step 2: Wire show/hide and load/save in the inline script**

Add to the renderer script (after the existing `toggleOpenRouterSection` function):

```js
const codexSection = document.getElementById("codex-section");
const claudeSection = document.getElementById("claude-section");
const codexModelSel = document.getElementById("codex-model");
const codexEffortSel = document.getElementById("codex-effort");
const anthropicModelSel = document.getElementById("anthropic-model");

function toggleExecutorSections() {
  codexSection.classList.toggle("hidden", backendSel.value !== "real-codex");
  claudeSection.classList.toggle("hidden", backendSel.value !== "real-claude");
  toggleOpenRouterSection();
}

backendSel.removeEventListener("change", toggleOpenRouterSection);
backendSel.addEventListener("change", toggleExecutorSections);
```

In the `api.load().then((state) => { ... })` block, append:

```js
codexModelSel.value = state.codexModel || "";
codexEffortSel.value = state.codexReasoningEffort || "";
anthropicModelSel.value = state.anthropicModel || "";
toggleExecutorSections();
```

In the save click handler, extend the payload:

```js
await api.save({
  backend: backendSel.value,
  startAtLogin: startAtLogin.checked,
  openrouterKey: keyInput.value.trim() || null,
  openrouterModel: selectedModelSlug() || null,
  codexModel: codexModelSel.value,
  codexReasoningEffort: codexEffortSel.value,
  anthropicModel: anthropicModelSel.value,
});
```

(Empty strings are valid payload — they tell the main process "user explicitly chose default.")

- [ ] **Step 3: Build & smoke**

Run: `npm --prefix apps/desktop run build`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src/settings-window.html
git commit -m "feat(desktop): add codex + anthropic model selectors to settings"
```

---

## Task 5: personal-files.ts module

**Files:**
- Create: `apps/desktop/src/personal-files.ts`

- [ ] **Step 1: Define allowlist + read function**

```ts
/**
 * personal-files.ts — read/write the 5 user-layer files behind a strict
 * id-based allowlist. Renderer never sees paths.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { parse as parseYaml } from "yaml";

export type PersonalFileKind = "yaml" | "markdown";

export interface PersonalFileSpec {
  id: string;
  relPath: string;
  kind: PersonalFileKind;
  description: string;
}

export const PERSONAL_FILES: readonly PersonalFileSpec[] = [
  {
    id: "cv",
    relPath: "cv.md",
    kind: "markdown",
    description: "Master CV (markdown source for tailoring).",
  },
  {
    id: "profile",
    relPath: "config/profile.yml",
    kind: "yaml",
    description: "Career-Ops profile (candidate, narrative, scan thresholds).",
  },
  {
    id: "mode-profile",
    relPath: "modes/_profile.md",
    kind: "markdown",
    description: "Personal narrative + archetypes consumed by all modes.",
  },
  {
    id: "portals",
    relPath: "portals.yml",
    kind: "yaml",
    description: "Portal scan configuration (LinkedIn, Indeed, etc.).",
  },
  {
    id: "digest",
    relPath: "article-digest.md",
    kind: "markdown",
    description: "Notes / link digest used for cover-letter context.",
  },
];

const MAX_BYTES = 1_048_576; // 1 MiB

function specForId(id: string): PersonalFileSpec {
  const spec = PERSONAL_FILES.find((s) => s.id === id);
  if (!spec) throw new Error(`unknown personal-file id: ${id}`);
  return spec;
}

function backupRoot(): string {
  return join(homedir(), ".auto-job", "personal-files-backups");
}
```

- [ ] **Step 2: Add the read function**

```ts
export interface PersonalFileRead {
  id: string;
  relPath: string;
  kind: PersonalFileKind;
  description: string;
  exists: boolean;
  content: string;
  byteLength: number;
}

export function readPersonalFile(repoRoot: string, id: string): PersonalFileRead {
  const spec = specForId(id);
  const abs = join(repoRoot, spec.relPath);
  if (!existsSync(abs)) {
    return {
      id: spec.id,
      relPath: spec.relPath,
      kind: spec.kind,
      description: spec.description,
      exists: false,
      content: "",
      byteLength: 0,
    };
  }
  const content = readFileSync(abs, "utf-8");
  const byteLength = Buffer.byteLength(content, "utf-8");
  if (byteLength > MAX_BYTES) {
    throw new Error(
      `${spec.relPath} is ${byteLength} bytes (> ${MAX_BYTES} cap).`,
    );
  }
  return {
    id: spec.id,
    relPath: spec.relPath,
    kind: spec.kind,
    description: spec.description,
    exists: true,
    content,
    byteLength,
  };
}
```

- [ ] **Step 3: Add the write function with yaml lint + backup**

```ts
export interface PersonalFileSaveResult {
  id: string;
  relPath: string;
  byteLength: number;
  backupPath: string | null;
}

export function writePersonalFile(
  repoRoot: string,
  id: string,
  content: string,
): PersonalFileSaveResult {
  const spec = specForId(id);
  const byteLength = Buffer.byteLength(content, "utf-8");
  if (byteLength > MAX_BYTES) {
    throw new Error(
      `content is ${byteLength} bytes (> ${MAX_BYTES} cap).`,
    );
  }
  if (spec.kind === "yaml") {
    try {
      parseYaml(content);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`${spec.relPath} yaml syntax error: ${msg}`);
    }
  }
  const abs = join(repoRoot, spec.relPath);
  let backupPath: string | null = null;
  if (existsSync(abs)) {
    mkdirSync(backupRoot(), { recursive: true });
    backupPath = join(backupRoot(), `${spec.id}.${Date.now()}.bak`);
    writeFileSync(backupPath, readFileSync(abs, "utf-8"), "utf-8");
  }
  writeFileSync(abs, content, "utf-8");
  return { id: spec.id, relPath: spec.relPath, byteLength, backupPath };
}
```

- [ ] **Step 4: Smoke-test the module from the repo root**

Create `/tmp/personal-files-smoke.mjs`:

```js
import {
  PERSONAL_FILES,
  readPersonalFile,
  writePersonalFile,
} from "/Users/hongxichen/Desktop/auto-job/apps/desktop/src/personal-files.ts";
const repo = "/Users/hongxichen/Desktop/auto-job";
console.log("ALLOWLIST:", PERSONAL_FILES.map((s) => s.id).join(","));
const r = readPersonalFile(repo, "profile");
console.log("read profile bytes=", r.byteLength, "kind=", r.kind);
// roundtrip the file unchanged
const out = writePersonalFile(repo, "profile", r.content);
console.log("save backup=", out.backupPath);
import fs from "node:fs";
console.log("eq=", fs.readFileSync(repo + "/" + r.relPath, "utf-8") === r.content);
```

Run from `apps/desktop`:

```bash
cd apps/desktop && node --import tsx /tmp/personal-files-smoke.mjs
```

Expected: `eq= true`, backup path printed.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/personal-files.ts
git commit -m "feat(desktop): add personal-files allowlisted reader/writer"
```

---

## Task 6: Personal-files IPC handlers

**Files:**
- Modify: `apps/desktop/src/settings-window.ts`
- Modify: `apps/desktop/src/settings-preload.ts`

- [ ] **Step 1: Register IPC handlers**

In `settings-window.ts`, add imports:

```ts
import {
  PERSONAL_FILES,
  readPersonalFile,
  writePersonalFile,
} from "./personal-files.js";
```

Inside the `if (!handlersRegistered)` block, add:

```ts
ipcMain.handle("personal-files:list", () =>
  PERSONAL_FILES.map((spec) => ({
    id: spec.id,
    relPath: spec.relPath,
    kind: spec.kind,
    description: spec.description,
  })),
);

ipcMain.handle("personal-files:read", (_e, id: string) => {
  const repoRoot = process.env.AUTO_JOB_REPO_ROOT;
  if (!repoRoot) return { ok: false, error: "AUTO_JOB_REPO_ROOT not set" };
  try {
    return { ok: true, value: readPersonalFile(repoRoot, id) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
});

ipcMain.handle(
  "personal-files:save",
  (_e, payload: { id: string; content: string }) => {
    const repoRoot = process.env.AUTO_JOB_REPO_ROOT;
    if (!repoRoot) return { ok: false, error: "AUTO_JOB_REPO_ROOT not set" };
    try {
      return {
        ok: true,
        value: writePersonalFile(repoRoot, payload.id, payload.content),
      };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  },
);
```

- [ ] **Step 2: Expose in preload**

Append to `settings-preload.ts` exposure:

```ts
listPersonalFiles: () => ipcRenderer.invoke("personal-files:list"),
readPersonalFile: (id: string) =>
  ipcRenderer.invoke("personal-files:read", id),
savePersonalFile: (id: string, content: string) =>
  ipcRenderer.invoke("personal-files:save", { id, content }),
```

- [ ] **Step 3: Typecheck**

Run: `npm --prefix apps/desktop run typecheck`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src/settings-window.ts apps/desktop/src/settings-preload.ts
git commit -m "feat(desktop): wire personal-files IPC handlers"
```

---

## Task 7: Tabify the Settings window

**Files:**
- Modify: `apps/desktop/src/settings-window.html`

- [ ] **Step 1: Add tab strip CSS**

Inside the `<style>` block, append:

```css
.tabs {
  display: flex; gap: 6px; margin: -8px 0 16px;
  border-bottom: 1px solid #d2d2d7;
}
.tab {
  padding: 6px 12px; font-size: 12.5px; font-weight: 500;
  background: transparent; color: #6e6e73;
  border: none; border-bottom: 2px solid transparent;
  cursor: pointer;
}
.tab.active { color: #1d1d1f; border-bottom-color: #007aff; }
.tab-pane { display: none; }
.tab-pane.active { display: block; }
```

- [ ] **Step 2: Wrap each section in a <section data-tab>**

Restructure the body:

```html
<h1>Settings</h1>

<div class="tabs">
  <button class="tab active" data-tab="general">General</button>
  <button class="tab" data-tab="newgrad">New-grad</button>
  <button class="tab" data-tab="files">Personal files</button>
  <button class="tab" data-tab="bridge">Bridge</button>
</div>

<section class="tab-pane active" data-tab="general">
  <!-- Existing: backend select, codex section, claude section,
       openrouter section, start-at-login -->
</section>

<section class="tab-pane" data-tab="newgrad">
  <!-- Existing: newgrad thresholds (helper, grid-2, two checkboxes) -->
</section>

<section class="tab-pane" data-tab="files">
  <!-- Filled in Task 8 -->
</section>

<section class="tab-pane" data-tab="bridge">
  <!-- Existing: bridge status card -->
</section>

<div class="error hidden" id="error"></div>
<div class="buttons">
  <button class="secondary" id="cancel">Cancel</button>
  <button class="primary" id="save">Save</button>
</div>
```

The Save button label updates dynamically (see Step 4).

- [ ] **Step 3: Wire tab switching JS**

After the existing IIFE setup, before any `api.load()` calls:

```js
const tabButtons = Array.from(document.querySelectorAll(".tab"));
const tabPanes = Array.from(document.querySelectorAll(".tab-pane"));
function activateTab(name) {
  tabButtons.forEach((b) =>
    b.classList.toggle("active", b.dataset.tab === name),
  );
  tabPanes.forEach((p) =>
    p.classList.toggle("active", p.dataset.tab === name),
  );
}
tabButtons.forEach((b) =>
  b.addEventListener("click", () => activateTab(b.dataset.tab)),
);
```

- [ ] **Step 4: Update Save button label based on dirty state**

Add helpers to detect executor-related changes:

```js
let loadedExecutor = {
  backend: "", openrouterModel: "", codexModel: "", codexEffort: "", anthropicModel: ""
};
function snapshotExecutor() {
  return {
    backend: backendSel.value,
    openrouterModel: selectedModelSlug() || "",
    codexModel: codexModelSel.value,
    codexEffort: codexEffortSel.value,
    anthropicModel: anthropicModelSel.value,
  };
}
function executorDirty() {
  const cur = snapshotExecutor();
  return Object.keys(cur).some((k) => cur[k] !== loadedExecutor[k]);
}
function refreshSaveLabel() {
  saveBtn.textContent = executorDirty() ? "Save & Restart bridge" : "Save";
}
[backendSel, modelSelect, modelCustom, codexModelSel, codexEffortSel, anthropicModelSel]
  .forEach((el) => el.addEventListener("input", refreshSaveLabel));
[backendSel, modelSelect, codexModelSel, codexEffortSel, anthropicModelSel]
  .forEach((el) => el.addEventListener("change", refreshSaveLabel));
```

In the existing `api.load().then(...)` block, after fields are populated, add:

```js
loadedExecutor = snapshotExecutor();
refreshSaveLabel();
```

- [ ] **Step 5: Build & visual smoke**

Run: `npm --prefix apps/desktop run build`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/src/settings-window.html
git commit -m "feat(desktop): tabify settings window (general/newgrad/files/bridge)"
```

---

## Task 8: Personal files tab UI

**Files:**
- Modify: `apps/desktop/src/settings-window.html`

- [ ] **Step 1: Add the Personal files pane**

Replace the empty `<section class="tab-pane" data-tab="files">` with:

```html
<section class="tab-pane" data-tab="files">
  <label for="pf-select">Edit a personal file</label>
  <select id="pf-select">
    <option value="">— pick a file —</option>
  </select>
  <div class="helper" id="pf-description"></div>

  <label for="pf-textarea" style="margin-top: 12px;">Contents</label>
  <textarea id="pf-textarea" rows="22"
    style="width: 100%; padding: 8px; box-sizing: border-box;
           font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
           font-size: 12px; line-height: 1.45; tab-size: 2;
           border: 1px solid #c7c7cc; border-radius: 6px;
           background: white; resize: vertical;"
    spellcheck="false"></textarea>

  <div class="key-status" id="pf-status">
    Pick a file above. yaml files are syntax-checked before save; a backup is
    written to <code>~/.auto-job/personal-files-backups/</code> first.
  </div>

  <div style="margin-top: 8px; display: flex; justify-content: flex-end;">
    <button class="primary" id="pf-save" disabled>Save this file</button>
  </div>

  <div class="error hidden" id="pf-error"></div>
</section>
```

- [ ] **Step 2: Wire the JS**

Append inside the IIFE:

```js
const pfSelect = document.getElementById("pf-select");
const pfDescription = document.getElementById("pf-description");
const pfTextarea = document.getElementById("pf-textarea");
const pfSaveBtn = document.getElementById("pf-save");
const pfStatus = document.getElementById("pf-status");
const pfError = document.getElementById("pf-error");

let pfLoadedContent = "";
let pfActiveId = "";

function pfShowError(msg) {
  pfError.textContent = msg;
  pfError.classList.remove("hidden");
}
function pfClearError() {
  pfError.textContent = "";
  pfError.classList.add("hidden");
}
function pfRefreshSaveBtn() {
  pfSaveBtn.disabled = !pfActiveId || pfTextarea.value === pfLoadedContent;
}

api.listPersonalFiles().then((files) => {
  for (const f of files) {
    const opt = document.createElement("option");
    opt.value = f.id;
    opt.textContent = f.relPath + " — " + f.description;
    pfSelect.appendChild(opt);
  }
});

pfSelect.addEventListener("change", async () => {
  pfClearError();
  pfActiveId = pfSelect.value;
  if (!pfActiveId) {
    pfTextarea.value = "";
    pfLoadedContent = "";
    pfDescription.textContent = "";
    pfRefreshSaveBtn();
    return;
  }
  pfTextarea.value = "(loading…)";
  pfTextarea.disabled = true;
  const res = await api.readPersonalFile(pfActiveId);
  pfTextarea.disabled = false;
  if (!res || !res.ok) {
    pfShowError(res && res.error ? res.error : "read failed");
    pfTextarea.value = "";
    pfLoadedContent = "";
    pfRefreshSaveBtn();
    return;
  }
  pfLoadedContent = res.value.content;
  pfTextarea.value = res.value.content;
  pfDescription.textContent =
    res.value.relPath + (res.value.exists ? "" : " (will be created on save)");
  pfRefreshSaveBtn();
});

pfTextarea.addEventListener("input", pfRefreshSaveBtn);

pfSaveBtn.addEventListener("click", async () => {
  pfClearError();
  pfSaveBtn.disabled = true;
  pfSaveBtn.textContent = "Saving…";
  const res = await api.savePersonalFile(pfActiveId, pfTextarea.value);
  pfSaveBtn.textContent = "Save this file";
  if (!res || !res.ok) {
    pfShowError(res && res.error ? res.error : "save failed");
    pfRefreshSaveBtn();
    return;
  }
  pfLoadedContent = pfTextarea.value;
  pfStatus.textContent = res.value.backupPath
    ? "Saved. Backup: " + res.value.backupPath
    : "Saved (no backup — file did not previously exist).";
  pfRefreshSaveBtn();
});
```

- [ ] **Step 3: Build**

Run: `npm --prefix apps/desktop run build`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src/settings-window.html
git commit -m "feat(desktop): personal files tab — pick, edit, save with backup"
```

---

## Task 9: Package, manual smoke, final commit

**Files:**
- (No code changes — verification only.)

- [ ] **Step 1: Repackage the desktop app**

Run: `npm --prefix apps/desktop run package`
Expected: `apps/desktop/release/mac-arm64/Auto Job.app` rebuilt; DMG created.

- [ ] **Step 2: Quit the running desktop app and relaunch**

```bash
osascript -e 'quit app "Auto Job"'
sleep 2
open "/Users/hongxichen/Desktop/auto-job/apps/desktop/release/mac-arm64/Auto Job.app"
```

- [ ] **Step 3: Smoke — General tab restart flow**

Open Settings → General. Switch backend codex → claude → Save & Restart bridge. Wait ~3 s. Open Bridge tab → Refresh. Expected: Mode/executor reads `real / claude`. Switch back to codex → Save & Restart. Bridge tab refresh expected: `real / codex`.

- [ ] **Step 4: Smoke — Personal files tab**

Open Settings → Personal files. Pick `cv.md`. Verify content loads. Add a trailing newline → Save expected: "Saved. Backup: ~/.auto-job/personal-files-backups/cv.<ts>.bak". Run from terminal: `ls ~/.auto-job/personal-files-backups/` to confirm.

- [ ] **Step 5: Smoke — yaml lint**

Personal files → pick `config/profile.yml` → break syntax (delete a closing quote) → Save expected: error message with parse error; file unchanged on disk.

- [ ] **Step 6: Append exec-plan progress**

Append a progress block to a new
`docs/exec-plans/active/2026-05-05-settings-tabs.md`:

```markdown
# Exec plan: Settings tabs (executor switcher + personal files)

Spec: docs/superpowers/specs/2026-05-05-settings-tabs-executor-personal-files-design.md
Plan: docs/superpowers/plans/2026-05-05-settings-tabs-executor-personal-files.md

## Progress
- 2026-05-05: implemented all 8 tasks.
- All builds + typechecks clean. Smoke-tested executor restart and personal
  files yaml-lint flows.

## Outcome
Settings window now has 4 tabs. Executor switching restarts the bridge
in ~3 s. Personal files tab edits 5 allowlisted files with pre-write
backup and yaml syntax validation.
```

- [ ] **Step 7: Final commit**

```bash
git add docs/superpowers/specs/ docs/superpowers/plans/ docs/exec-plans/active/
git commit -m "docs: settings tabs design + plan + progress log"
```

---

## Self-review

**Spec coverage:**
- Tab strip — Task 7 ✓
- Codex/Anthropic model selectors — Tasks 1–4 ✓
- Restart on save — Task 3 ✓
- Personal files allowlist — Task 5 ✓
- yaml lint + backup — Task 5 ✓
- 1 MB cap — Task 5 ✓
- Personal files UI — Task 8 ✓
- Smoke tests — Task 9 ✓

**Placeholders:** none. All code shown inline.

**Type consistency:** `Settings` interface is the source of truth; `SavePayload` mirrors only the optional fields. `PersonalFileSpec` ids referenced in renderer match the allowlist.
