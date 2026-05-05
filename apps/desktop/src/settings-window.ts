/**
 * settings-window.ts — Opens the settings BrowserWindow and wires IPC.
 *
 * Task 5.4 of the client-app-delivery plan: a small modal-ish window
 * accessible via the tray's "Settings…" item. It lets the user pick a
 * backend, save an OpenRouter API key (only relevant when that backend
 * is selected), and toggle start-at-login.
 *
 * The renderer talks to main via window.careerOpsSettings, which is
 * exposed by settings-preload (compiled to dist/settings-preload.js).
 */

import { BrowserWindow, ipcMain, app } from "electron";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  DEFAULT_OPENROUTER_MODEL,
  loadSettings,
  saveSettings,
  hasOpenRouterKey,
  saveOpenRouterKey,
  type Settings,
} from "./settings.js";
import {
  loadNewGradThresholds,
  saveNewGradThresholds,
  type NewGradThresholds,
} from "./profile-config.js";
import {
  PERSONAL_FILES,
  readPersonalFile,
  writePersonalFile,
} from "./personal-files.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
// In packaged builds resolve from app root (handles asar transparently).
// In dev resolve from this file's compiled location.
function resolvePath(rel: string): string {
  if (app.isPackaged) return join(app.getAppPath(), rel);
  return join(__dirname, "..", rel);
}
const HTML_PATH = resolvePath("src/settings-window.html");
const PRELOAD_PATH = resolvePath("dist/settings-preload.cjs");

let win: BrowserWindow | null = null;
let handlersRegistered = false;

interface SavePayload {
  backend?: Settings["backend"];
  startAtLogin?: boolean;
  openrouterKey?: string | null;
  /** New model slug, or null to keep the current value. Empty string falls
   *  back to DEFAULT_OPENROUTER_MODEL — empty input must not save "". */
  openrouterModel?: string | null;
  /** Empty string ⇒ unset (use bridge default). Undefined ⇒ keep current. */
  codexModel?: string | null;
  codexReasoningEffort?: string | null;
  anthropicModel?: string | null;
}

export function openSettingsWindow(onSaved: (next: Settings) => Promise<void> | void): void {
  if (win && !win.isDestroyed()) {
    win.show();
    win.focus();
    return;
  }

  win = new BrowserWindow({
    width: 620,
    height: 720,
    title: "Auto Job — Settings",
    resizable: true,
    minimizable: false,
    maximizable: false,
    webPreferences: {
      contextIsolation: true,
      // Preload uses ipcRenderer; Electron blocks that under sandbox.
      sandbox: false,
      nodeIntegration: false,
      preload: PRELOAD_PATH,
    },
  });

  // Diagnostic: log whether the preload file exists at the resolved path so
  // we can tell preload-not-loaded from a renderer-side mistake.
  try {
    const exists = existsSync(PRELOAD_PATH);
    console.log(`[settings] preload exists=${exists} path=${PRELOAD_PATH}`);
  } catch (err) {
    console.error("[settings] preload existsSync threw:", err);
  }
  win.webContents.on("preload-error", (_e, p, err) => {
    console.error(`[settings] preload-error path=${p}:`, err);
  });
  void win.loadFile(HTML_PATH);

  // Register IPC handlers once per process; they look up `win` at call
  // time so they always refer to the currently-open settings window.
  if (!handlersRegistered) {
    ipcMain.handle("settings:load", () => ({
      ...loadSettings(),
      hasKey: hasOpenRouterKey(),
    }));

    ipcMain.handle("settings:save", async (_e, payload: SavePayload) => {
      const current = loadSettings();
      const trimmedModel =
        typeof payload.openrouterModel === "string" ? payload.openrouterModel.trim() : "";
      const trim = (v: unknown) => (typeof v === "string" ? v.trim() : "");
      const next: Settings = {
        backend: payload.backend ?? current.backend,
        startAtLogin:
          typeof payload.startAtLogin === "boolean" ? payload.startAtLogin : current.startAtLogin,
        openrouterModel:
          payload.openrouterModel === undefined
            ? current.openrouterModel
            : trimmedModel || DEFAULT_OPENROUTER_MODEL,
        codexModel:
          payload.codexModel === undefined ? current.codexModel : trim(payload.codexModel),
        codexReasoningEffort:
          payload.codexReasoningEffort === undefined
            ? current.codexReasoningEffort
            : trim(payload.codexReasoningEffort),
        anthropicModel:
          payload.anthropicModel === undefined
            ? current.anthropicModel
            : trim(payload.anthropicModel),
      };
      saveSettings(next);
      if (payload.openrouterKey) saveOpenRouterKey(payload.openrouterKey);

      if (process.platform === "darwin") {
        app.setLoginItemSettings({
          openAtLogin: next.startAtLogin,
          openAsHidden: true,
        });
      }

      await onSaved(next);
      return { ok: true };
    });

    ipcMain.handle("settings:close", () => {
      win?.close();
    });

    ipcMain.handle("newgrad-thresholds:load", () => {
      const repoRoot = process.env.AUTO_JOB_REPO_ROOT;
      if (!repoRoot) {
        return { ok: false, error: "AUTO_JOB_REPO_ROOT not set" };
      }
      try {
        return { ok: true, value: loadNewGradThresholds(repoRoot) };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    });

    ipcMain.handle(
      "newgrad-thresholds:save",
      (_e, payload: NewGradThresholds) => {
        const repoRoot = process.env.AUTO_JOB_REPO_ROOT;
        if (!repoRoot) {
          return { ok: false, error: "AUTO_JOB_REPO_ROOT not set" };
        }
        try {
          return { ok: true, value: saveNewGradThresholds(repoRoot, payload) };
        } catch (err) {
          return { ok: false, error: err instanceof Error ? err.message : String(err) };
        }
      },
    );

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

    ipcMain.handle("bridge:health", async () => {
      const repoRoot = process.env.AUTO_JOB_REPO_ROOT;
      const port = Number(process.env.AUTO_JOB_BRIDGE_PORT) || 47319;
      const host = process.env.AUTO_JOB_BRIDGE_HOST ?? "127.0.0.1";
      const tokenPath = repoRoot
        ? join(repoRoot, "apps", "server", ".bridge-token")
        : null;
      let token = "";
      try {
        if (tokenPath && existsSync(tokenPath)) {
          token = readFileSync(tokenPath, "utf-8").trim();
        }
      } catch {
        // fall through with empty token; renderer shows "no token"
      }
      const baseUrl = `http://${host}:${port}`;
      try {
        const res = await fetch(`${baseUrl}/v1/health`, {
          headers: token ? { "x-auto-job-token": token } : {},
          signal: AbortSignal.timeout(2500),
        });
        const body = (await res.json()) as Record<string, unknown>;
        return {
          ok: res.ok,
          baseUrl,
          tokenPreview: token ? `${token.slice(0, 6)}…` : null,
          tokenPath,
          codexModel: process.env.AUTO_JOB_CODEX_MODEL ?? null,
          codexReasoningEffort:
            process.env.AUTO_JOB_CODEX_REASONING_EFFORT ?? null,
          anthropicModel: process.env.ANTHROPIC_MODEL ?? null,
          status: res.status,
          body,
        };
      } catch (err) {
        return {
          ok: false,
          baseUrl,
          tokenPreview: token ? `${token.slice(0, 6)}…` : null,
          tokenPath,
          codexModel: process.env.AUTO_JOB_CODEX_MODEL ?? null,
          codexReasoningEffort:
            process.env.AUTO_JOB_CODEX_REASONING_EFFORT ?? null,
          anthropicModel: process.env.ANTHROPIC_MODEL ?? null,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    });

    handlersRegistered = true;
  }

  win.on("closed", () => {
    win = null;
  });
}
