/**
 * main.ts — Electron main process for the Auto Job desktop app.
 *
 * Tasks 5.1 – 5.4 of the client-app-delivery plan:
 *   - Boot a single BrowserWindow pointed at the dashboard.
 *   - Embed the bridge server in-process via createServer() — no child
 *     subprocess.
 *   - Cleanly stop the server when the app quits.
 *   - Menu-bar tray icon (status, restart, open dashboard, view logs,
 *     settings, quit). The tray is the persistent UI.
 *   - Settings window for backend / OpenRouter key / start-at-login.
 *
 * Electron-builder packaging (5.5) is wired separately.
 */

import { app, BrowserWindow, Menu, shell } from "electron";
import { appendFileSync, existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { createServer, type ServerHandle, type AdapterMode } from "@auto-job/server";
import { createTray, type TrayController, type TrayState } from "./tray.js";
import { loadSettings, type Backend, type Settings } from "./settings.js";
import { openSettingsWindow } from "./settings-window.js";

// File logger: when the app is packaged, console output disappears, so
// mirror it to ~/Library/Logs/Auto Job/main.log for debuggability.
const logFile = join(homedir(), "Library/Logs/Auto Job/main.log");
function flog(msg: string): void {
  try {
    mkdirSync(dirname(logFile), { recursive: true });
    appendFileSync(logFile, `[${new Date().toISOString()}] ${msg}\n`);
  } catch {
    // ignore — logger failures should never crash the app
  }
}
function formatLogArg(arg: unknown): string {
  if (arg instanceof Error) {
    const cause =
      arg.cause === undefined
        ? ""
        : `\nCaused by: ${arg.cause instanceof Error ? (arg.cause.stack ?? arg.cause.message) : String(arg.cause)}`;
    return arg.stack ?? `${arg.name}: ${arg.message}${cause}`;
  }
  if (typeof arg === "string") return arg;
  try {
    return JSON.stringify(arg);
  } catch {
    return String(arg);
  }
}
const origLog = console.log.bind(console);
const origErr = console.error.bind(console);
console.log = (...args: unknown[]) => {
  origLog(...args);
  flog(args.map(formatLogArg).join(" "));
};
console.error = (...args: unknown[]) => {
  origErr(...args);
  flog("[error] " + args.map(formatLogArg).join(" "));
};
process.on("uncaughtException", (err) => {
  flog(`[uncaughtException] ${err.stack ?? err.message ?? String(err)}`);
});
process.on("unhandledRejection", (reason) => {
  flog(`[unhandledRejection] ${String(reason)}`);
});

// The bundled server code lives in the desktop main bundle, so the
// server's repo-root walk-up cannot rely on @auto-job/server's package
// directory. Honor an explicit env override, otherwise guess the
// conventional checkout at ~/Desktop/auto-job.
function ensureRepoRoot(): void {
  if (process.env.AUTO_JOB_REPO_ROOT) return;
  const guess = join(homedir(), "Desktop/auto-job");
  if (
    existsSync(join(guess, "cv.md")) &&
    existsSync(join(guess, "modes")) &&
    existsSync(join(guess, "data"))
  ) {
    process.env.AUTO_JOB_REPO_ROOT = guess;
    console.log(`[auto-job] using repo root: ${guess}`);
  } else {
    console.warn(
      `[auto-job] AUTO_JOB_REPO_ROOT not set and ${guess} doesn't look like an auto-job checkout. ` +
        `Set AUTO_JOB_REPO_ROOT before launching for the in-process server to find your data.`,
    );
  }
}

/**
 * Tell the bundled server where to find the dashboard helper .mjs
 * modules (web/build-dashboard.mjs + web/dashboard-handlers.mjs +
 * web/scan-runner.mjs) when
 * the user's repo predates the dashboard-handlers split.
 *
 * electron-builder's extraResources places these at
 *   <app>.app/Contents/Resources/web/
 * which is process.resourcesPath/web in the packaged app.
 */
function ensureWebDirFallback(): void {
  if (process.env.AUTO_JOB_WEB_DIR) return;
  if (!app.isPackaged) return;
  const repoRoot = process.env.AUTO_JOB_REPO_ROOT;
  if (
    repoRoot &&
    existsSync(join(repoRoot, "web", "build-dashboard.mjs")) &&
    existsSync(join(repoRoot, "web", "dashboard-handlers.mjs")) &&
    existsSync(join(repoRoot, "web", "scan-runner.mjs"))
  ) {
    return;
  }
  const bundledWebDir = join(process.resourcesPath, "web");
  if (existsSync(join(bundledWebDir, "dashboard-handlers.mjs"))) {
    process.env.AUTO_JOB_WEB_DIR = bundledWebDir;
    console.log(`[auto-job] using bundled web dir: ${bundledWebDir}`);
  }
}

// GUI-launched macOS apps inherit a minimal PATH that excludes the user's
// shell PATH, so CLIs installed in ~/.local/bin, ~/.npm-global/bin, or
// /opt/homebrew/bin (the common locations for `claude`, `codex`, etc.) are
// invisible to spawn(). Prepend the standard user bin dirs that exist on
// disk so the bundled server can resolve them.
function ensureUserPath(): void {
  const candidates = [
    "/opt/homebrew/bin",
    "/usr/local/bin",
    join(homedir(), ".local/bin"),
    join(homedir(), ".npm-global/bin"),
    join(homedir(), ".cargo/bin"),
  ];
  const current = (process.env.PATH ?? "").split(":").filter(Boolean);
  const seen = new Set(current);
  const extra = candidates.filter((p) => existsSync(p) && !seen.has(p));
  if (extra.length === 0) return;
  process.env.PATH = [...extra, ...current].join(":");
  console.log(`[auto-job] extended PATH with: ${extra.join(", ")}`);
}

ensureUserPath();
ensureRepoRoot();
ensureWebDirFallback();

let server: ServerHandle | null = null;
let window: BrowserWindow | null = null;
let trayController: TrayController | null = null;
let trayState: TrayState = "idle";

const PORT = Number(process.env.AUTO_JOB_BRIDGE_PORT) || 47319;
const HOST = process.env.AUTO_JOB_BRIDGE_HOST || "127.0.0.1";

function resolveBackend(): AdapterMode {
  // env var wins; otherwise fall back to whatever's saved in settings.
  const raw = process.env.AUTO_JOB_BACKEND;
  if (
    raw === "fake" ||
    raw === "real-claude" ||
    raw === "real-codex" ||
    raw === "real-openrouter"
  ) {
    return raw;
  }
  return loadSettings().backend as Backend;
}

let currentSettings: Settings = loadSettings();
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

async function startServer(): Promise<void> {
  trayState = "idle";
  trayController?.rebuild();
  try {
    server = createServer({
      backend: currentBackend,
      openrouterModel: currentSettings.openrouterModel,
    });
    const info = await server.start({ port: PORT, host: HOST });
    console.log(
      `[auto-job] server listening on http://${info.host}:${info.port} (backend=${currentBackend}, openrouterModel=${currentSettings.openrouterModel})`,
    );
    trayState = "running";
  } catch (err) {
    trayState = "errored";
    throw err;
  } finally {
    trayController?.rebuild();
  }
}

async function restartServer(): Promise<void> {
  if (server) {
    try {
      await server.stop();
    } catch (err) {
      console.warn("[auto-job] error stopping server during restart:", err);
    }
    server = null;
  }
  trayState = "stopped";
  trayController?.rebuild();
  await startServer();
}

function createWindow(): void {
  window = new BrowserWindow({
    width: 1280,
    height: 860,
    title: "Auto Job",
    autoHideMenuBar: false,
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });

  void window.loadURL(`http://${HOST}:${PORT}/dashboard/`);

  // Open external links in the system browser; keep loopback navigation
  // inside the app window.
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http://127.0.0.1") || url.startsWith("http://localhost")) {
      return { action: "allow" };
    }
    void shell.openExternal(url);
    return { action: "deny" };
  });

  window.on("closed", () => {
    window = null;
  });
}

function openDashboardWindow(): void {
  if (!window || window.isDestroyed()) {
    createWindow();
    return;
  }
  if (window.isMinimized()) window.restore();
  window.show();
  window.focus();
}

function handleOpenSettings(): void {
  openSettingsWindow(async (next) => {
    const needsRestart =
      next.backend !== currentSettings.backend ||
      next.openrouterModel !== currentSettings.openrouterModel ||
      next.codexModel !== currentSettings.codexModel ||
      next.codexReasoningEffort !== currentSettings.codexReasoningEffort ||
      next.anthropicModel !== currentSettings.anthropicModel;
    currentSettings = next;
    currentBackend = next.backend as AdapterMode;
    applyExecutorEnv(next);
    if (needsRestart) {
      try {
        await restartServer();
      } catch (err) {
        console.error("[auto-job] failed to restart after settings change:", err);
      }
    }
    trayController?.rebuild();
  });
}

app.whenReady().then(async () => {
  trayController = createTray({
    getStatus: () => trayState,
    getBackend: () => currentBackend,
    onOpenDashboard: openDashboardWindow,
    onRestart: restartServer,
    onOpenSettings: handleOpenSettings,
  });

  // Application menu — exposes Settings via Cmd+, when the tray icon is
  // hidden behind status-bar managers (Bartender, Hidden Bar). Uses the
  // built-in `appMenu` role for the first submenu so macOS auto-fills the
  // About/Hide/Quit items correctly; we only inject Settings.
  const isMac = process.platform === "darwin";
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      ...(isMac
        ? [
            {
              role: "appMenu" as const,
              submenu: [
                { role: "about" as const },
                { type: "separator" as const },
                {
                  label: "Settings…",
                  accelerator: "Command+,",
                  click: handleOpenSettings,
                },
                { type: "separator" as const },
                { role: "services" as const },
                { type: "separator" as const },
                { role: "hide" as const },
                { role: "hideOthers" as const },
                { role: "unhide" as const },
                { type: "separator" as const },
                { role: "quit" as const },
              ],
            },
          ]
        : []),
      { role: "editMenu" },
      { role: "viewMenu" },
      {
        label: "Window",
        submenu: [
          { label: "Open Dashboard", click: openDashboardWindow },
          { label: "Restart Bridge", click: () => void restartServer() },
          { type: "separator" },
          { role: "minimize" },
          { role: "close" },
        ],
      },
    ]),
  );

  try {
    await startServer();
    createWindow();
  } catch (err) {
    console.error("[auto-job] failed to start:", err);
    // Don't exit — the tray is still up so the user can retry via
    // "Restart Server".
  }
});

app.on("activate", () => {
  // macOS: re-create a window when the dock icon is clicked with no windows
  // open. Don't restart the server.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// Track whether we've already initiated shutdown so before-quit doesn't
// loop after we manually call app.exit().
let shuttingDown = false;

app.on("before-quit", (event) => {
  if (shuttingDown) return;
  if (server === null) return;

  event.preventDefault();
  shuttingDown = true;

  void (async () => {
    try {
      await server!.stop();
    } catch (err) {
      console.error("[auto-job] error stopping server:", err);
    } finally {
      server = null;
      app.exit(0);
    }
  })();
});

app.on("window-all-closed", () => {
  // Tray keeps the app alive on every platform now — quit only via the
  // tray's "Quit" item (which calls app.quit()). This matches standard
  // macOS menu-bar app behavior.
});
