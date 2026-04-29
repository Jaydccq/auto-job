/**
 * tray.ts — Menu-bar tray icon for the Auto Job desktop app.
 *
 * Task 5.3 of the client-app-delivery plan: surface server status,
 * current backend, and a small action menu (open dashboard, restart,
 * view logs, settings, quit). The tray is the persistent UI — closing
 * the dashboard window does not quit the app.
 *
 * The tray uses the generated color asset at apps/desktop/icons/tray.png.
 * trayTemplate.png remains only as a macOS template fallback if the color
 * asset is missing or unreadable.
 */

import { Tray, Menu, shell, app, nativeImage, type MenuItemConstructorOptions } from "electron";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
// The desktop app now runs from compiled dist/ in both dev and packaged paths.
// "../icons" resolves to apps/desktop/icons from dist/tray.js.
const ICON_DIR = join(__dirname, "..", "icons");
const LOG_DIR = join(homedir(), "Library", "Logs", "CareerOps");

export type TrayState = "idle" | "running" | "stopped" | "errored";

export interface TrayHooks {
  getStatus: () => TrayState;
  getBackend: () => string;
  onOpenDashboard: () => void;
  onRestart: () => Promise<void>;
  onOpenSettings: () => void;
}

export interface TrayController {
  tray: Tray;
  rebuild: () => void;
}

const TRAY_ICON_SIZE = 18;

function fitTrayIcon(image: Electron.NativeImage, template: boolean): Electron.NativeImage {
  if (image.isEmpty()) return image;
  const fitted = image.resize({ width: TRAY_ICON_SIZE, height: TRAY_ICON_SIZE });
  if (process.platform === "darwin") {
    fitted.setTemplateImage(template);
  }
  return fitted;
}

function loadTrayIcon(): Electron.NativeImage {
  const colorPath = join(ICON_DIR, "tray.png");
  const templatePath = join(ICON_DIR, "trayTemplate.png");
  const image = nativeImage.createFromPath(colorPath);
  if (!image.isEmpty()) {
    return fitTrayIcon(image, false);
  }

  const fallback = nativeImage.createFromPath(templatePath);
  return fitTrayIcon(fallback, true);
}

export function createTray(hooks: TrayHooks): TrayController {
  const icon = loadTrayIcon();
  const tray = new Tray(icon);
  tray.setToolTip("Auto Job");

  function rebuild(): void {
    const status = hooks.getStatus();
    const backend = hooks.getBackend();
    const statusLabel = {
      idle: "Status: Idle",
      running: "Status: Running",
      stopped: "Status: Stopped",
      errored: "Status: Error",
    }[status];

    const template: MenuItemConstructorOptions[] = [
      { label: statusLabel, enabled: false },
      { label: `Backend: ${backend}`, enabled: false },
      { type: "separator" },
      { label: "Open Dashboard", click: () => hooks.onOpenDashboard() },
      {
        label: "Restart Server",
        click: async () => {
          try {
            await hooks.onRestart();
          } catch (err) {
            console.error("[tray] restart failed:", err);
          } finally {
            rebuild();
          }
        },
      },
      {
        label: "View Logs",
        click: () => {
          void shell.openPath(LOG_DIR);
        },
      },
      { type: "separator" },
      { label: "Settings…", click: () => hooks.onOpenSettings() },
      { type: "separator" },
      { label: "Quit", click: () => app.quit() },
    ];

    tray.setContextMenu(Menu.buildFromTemplate(template));
  }

  rebuild();
  return { tray, rebuild };
}
