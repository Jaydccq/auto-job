/**
 * settings.ts — Persistent desktop-app settings.
 *
 * Task 5.4 of the client-app-delivery plan: read/write the user's
 * backend choice, start-at-login flag, and OpenRouter API key on disk.
 *
 * Files (all under ~/.config/career-ops/):
 *   - settings.json    -- {backend, startAtLogin}, mode 0600
 *   - openrouter.key   -- raw key + trailing newline, mode 0600
 *
 * The OpenRouter key lives in a separate file (rather than inside
 * settings.json) so we can apply chmod 600 unambiguously and so leaking
 * the settings file in logs/error reports never leaks the key.
 */

import { mkdirSync, readFileSync, writeFileSync, existsSync, chmodSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const CONFIG_DIR = join(homedir(), ".config", "career-ops");
const SETTINGS_PATH = join(CONFIG_DIR, "settings.json");
const KEY_PATH = join(CONFIG_DIR, "openrouter.key");

export type Backend = "fake" | "real-claude" | "real-codex" | "real-openrouter";

export interface Settings {
  backend: Backend;
  startAtLogin: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  backend: "real-codex",
  startAtLogin: false,
};

function isBackend(value: unknown): value is Backend {
  return (
    value === "fake" ||
    value === "real-claude" ||
    value === "real-codex" ||
    value === "real-openrouter"
  );
}

export function loadSettings(): Settings {
  if (!existsSync(SETTINGS_PATH)) return { ...DEFAULT_SETTINGS };
  try {
    const raw = JSON.parse(readFileSync(SETTINGS_PATH, "utf8")) as Partial<Settings>;
    return {
      backend: isBackend(raw.backend) ? raw.backend : DEFAULT_SETTINGS.backend,
      startAtLogin:
        typeof raw.startAtLogin === "boolean" ? raw.startAtLogin : DEFAULT_SETTINGS.startAtLogin,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(s: Settings): void {
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(SETTINGS_PATH, JSON.stringify(s, null, 2), { mode: 0o600 });
  // writeFileSync's mode is only honored on file creation; force chmod
  // to cover the overwrite case.
  chmodSync(SETTINGS_PATH, 0o600);
}

export function hasOpenRouterKey(): boolean {
  if (!existsSync(KEY_PATH)) return false;
  try {
    return readFileSync(KEY_PATH, "utf8").trim().length > 0;
  } catch {
    return false;
  }
}

export function saveOpenRouterKey(key: string): void {
  const trimmed = key.trim();
  if (!trimmed) throw new Error("OpenRouter key is empty");
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(KEY_PATH, trimmed + "\n", { mode: 0o600 });
  chmodSync(KEY_PATH, 0o600);
}

export function clearOpenRouterKey(): void {
  if (existsSync(KEY_PATH)) {
    writeFileSync(KEY_PATH, "", { mode: 0o600 });
    chmodSync(KEY_PATH, 0o600);
  }
}
