/**
 * settings-preload.ts — Preload bridge for the settings window.
 *
 * Exposes a small typed API on window.careerOpsSettings so the renderer
 * can load + save settings without nodeIntegration. This file is bundled
 * to dist/settings-preload.js (CJS) — see the build:preload script in
 * apps/desktop/package.json.
 */

import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("careerOpsSettings", {
  load: () => ipcRenderer.invoke("settings:load"),
  save: (payload: unknown) => ipcRenderer.invoke("settings:save", payload),
  close: () => ipcRenderer.invoke("settings:close"),
});
