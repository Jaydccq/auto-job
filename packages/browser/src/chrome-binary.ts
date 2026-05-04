import { existsSync } from "node:fs";
import { platform } from "node:process";

import { ChromeNotFoundError } from "./errors.js";

/**
 * Search order: Chrome for Testing → Google Chrome → Chromium.
 *
 * Rationale: real-Chrome user-agent and fingerprint are less likely to
 * trip site bot-detection than Chromium. Chrome for Testing is preferred
 * over the daily Chrome because version drift is controllable.
 */
const MAC_CANDIDATES = [
  "/Applications/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
];

const LINUX_CANDIDATES = [
  "/usr/bin/google-chrome-for-testing",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium-browser",
  "/usr/bin/chromium",
  "/snap/bin/chromium",
];

const WIN_CANDIDATES = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
];

export function detectChromeBinary(): string {
  const candidates = pickCandidates();
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  throw new ChromeNotFoundError(
    `Searched: ${candidates.join(", ")}. None exist. Install Chrome or pass ControllerOptions.chromeBinary explicitly.`,
  );
}

function pickCandidates(): string[] {
  switch (platform) {
    case "darwin":
      return MAC_CANDIDATES;
    case "linux":
      return LINUX_CANDIDATES;
    case "win32":
      return WIN_CANDIDATES;
    default:
      return [...MAC_CANDIDATES, ...LINUX_CANDIDATES];
  }
}
