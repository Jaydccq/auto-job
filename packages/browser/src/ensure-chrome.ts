import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

import { detectChromeBinary } from "./chrome-binary.js";
import { ProfileLockedError } from "./errors.js";
import type { ControllerOptions } from "./types.js";

const DEFAULT_PORT = 47320;
const DEFAULT_PROFILE_DIR = join(homedir(), ".auto-job", "chrome-profile");
const DEFAULT_LAUNCH_TIMEOUT_MS = 30_000;
const POLL_INTERVAL_MS = 200;

export interface EnsureResult {
  cdpEndpoint: string;
  port: number;
  profileDir: string;
  /** True when this call started Chrome; false when it attached to an existing instance. */
  launched: boolean;
  /** Reference to the spawned process when launched=true. Used by shutdown(). */
  process: ChildProcess | null;
}

export async function ensureChrome(opts: ControllerOptions = {}): Promise<EnsureResult> {
  const port = opts.port ?? DEFAULT_PORT;
  const profileDir = opts.profileDir ?? DEFAULT_PROFILE_DIR;

  const existing = await probeCdp(port);
  if (existing) {
    return {
      cdpEndpoint: existing.endpoint,
      port,
      profileDir,
      launched: false,
      process: null,
    };
  }

  mkdirSync(profileDir, { recursive: true });

  const binary = opts.chromeBinary ?? detectChromeBinary();
  const args = buildLaunchArgs({ profileDir, port, headless: opts.headless ?? false, extra: opts.extraArgs ?? [] });

  const child = spawn(binary, args, {
    detached: false,
    stdio: ["ignore", "ignore", "pipe"],
  });

  const stderrChunks: string[] = [];
  child.stderr?.on("data", (chunk: Buffer) => {
    if (stderrChunks.length < 8) stderrChunks.push(chunk.toString("utf8"));
  });

  const ready = await waitForCdp(port, opts.launchTimeoutMs ?? DEFAULT_LAUNCH_TIMEOUT_MS);
  if (!ready) {
    try {
      child.kill("SIGKILL");
    } catch {
      // ignore
    }
    const stderr = stderrChunks.join("");
    if (/profile.*in use|SingletonLock|cannot create.*lock/i.test(stderr)) {
      throw new ProfileLockedError(profileDir);
    }
    throw new Error(
      `Chrome failed to expose CDP on port ${port} within ${opts.launchTimeoutMs ?? DEFAULT_LAUNCH_TIMEOUT_MS}ms. stderr: ${stderr.slice(0, 400)}`,
    );
  }

  return {
    cdpEndpoint: ready.endpoint,
    port,
    profileDir,
    launched: true,
    process: child,
  };
}

interface CdpInfo {
  endpoint: string;
  webSocketDebuggerUrl?: string;
}

async function probeCdp(port: number): Promise<CdpInfo | null> {
  try {
    const r = await fetch(`http://127.0.0.1:${port}/json/version`, {
      signal: AbortSignal.timeout(750),
    });
    if (!r.ok) return null;
    const body = (await r.json()) as { webSocketDebuggerUrl?: string };
    const out: CdpInfo = { endpoint: `http://127.0.0.1:${port}` };
    if (body.webSocketDebuggerUrl) out.webSocketDebuggerUrl = body.webSocketDebuggerUrl;
    return out;
  } catch {
    return null;
  }
}

async function waitForCdp(port: number, timeoutMs: number): Promise<CdpInfo | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const r = await probeCdp(port);
    if (r) return r;
    await delay(POLL_INTERVAL_MS);
  }
  return null;
}

interface BuildArgsInput {
  profileDir: string;
  port: number;
  headless: boolean;
  extra: readonly string[];
}

function buildLaunchArgs(input: BuildArgsInput): string[] {
  // Anti-bot note: we deliberately do NOT pass `--enable-automation`,
  // `--disable-blink-features=AutomationControlled`, or any other flag
  // that broadcasts automation. The CDP-attach path (vs playwright.launch)
  // already avoids those defaults. We also keep popup-blocking ON
  // (real users have it on) — bb-browser's `--disable-popup-blocking`
  // was removed for fingerprint naturalness.
  const base = [
    `--user-data-dir=${input.profileDir}`,
    `--remote-debugging-port=${input.port}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-features=Translate",
    "--password-store=basic",
    "--use-mock-keychain",
  ];
  if (input.headless) base.push("--headless=new");
  return [...base, ...input.extra];
}
