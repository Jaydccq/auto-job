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
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  loadSettings,
  saveSettings,
  hasOpenRouterKey,
  saveOpenRouterKey,
  type Settings,
} from "./settings.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
// HTML stays in src/ as a static asset; preload is compiled to dist/.
const HTML_PATH = join(__dirname, "..", "src", "settings-window.html");
const PRELOAD_PATH = join(__dirname, "..", "dist", "settings-preload.js");

let win: BrowserWindow | null = null;
let handlersRegistered = false;

interface SavePayload {
  backend?: Settings["backend"];
  startAtLogin?: boolean;
  openrouterKey?: string | null;
}

export function openSettingsWindow(onSaved: (next: Settings) => Promise<void> | void): void {
  if (win && !win.isDestroyed()) {
    win.show();
    win.focus();
    return;
  }

  win = new BrowserWindow({
    width: 520,
    height: 480,
    title: "Career Ops — Settings",
    resizable: false,
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
      const next: Settings = {
        backend: payload.backend ?? current.backend,
        startAtLogin:
          typeof payload.startAtLogin === "boolean" ? payload.startAtLogin : current.startAtLogin,
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

    handlersRegistered = true;
  }

  win.on("closed", () => {
    win = null;
  });
}
