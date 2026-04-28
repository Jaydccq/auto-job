/**
 * config.ts — bridge bootstrap configuration.
 *
 * Responsibilities:
 *   1. Locate the career-ops repo root (the directory containing this
 *      apps/server/ directory).
 *   2. Load or generate the shared-secret token at apps/server/.bridge-token.
 *   3. Resolve `claude`, `codex`, and `node` binaries from PATH.
 *   4. Decide which pipeline adapter to use (real vs fake) from env.
 *
 * Errors here crash the bridge on startup, which is correct — we must
 * not half-start. All runtime code below assumes a valid BridgeConfig.
 *
 * Security note: this file only ever runs execFileSync with fixed argv
 * arrays — never a shell command string. No user input is ever passed
 * to a subprocess from this module.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";

export type BridgeMode = "fake" | "real";
export type RealExecutor = "claude" | "codex" | "openrouter";

export interface BridgeConfig {
  /** Absolute path to career-ops repo root. cwd for every shell-out. */
  repoRoot: string;
  /** Absolute path to apps/server/ directory (inside repoRoot). */
  bridgeDir: string;
  /** Host to bind. Always loopback in production. */
  host: string;
  /** Port to bind. */
  port: number;
  /** Shared secret for the x-career-ops-token header. */
  token: string;
  /** Absolute path to the claude CLI, or null if unresolved. */
  claudeBin: string | null;
  /** Absolute path to the codex CLI, or null if unresolved. */
  codexBin: string | null;
  /** Codex model used for bridge evaluations. */
  codexModel: string | null;
  /** Codex reasoning effort / intelligence used for bridge evaluations. */
  codexReasoningEffort: string | null;
  /** Absolute path to the node CLI. */
  nodeBin: string;
  /** Which pipeline adapter to use. */
  mode: BridgeMode;
  /** Which CLI powers real mode. */
  realExecutor: RealExecutor;
  /** Seconds an evaluation is allowed to run. */
  evaluationTimeoutSec: number;
  /** Maximum number of in-flight evaluations. */
  evaluationConcurrency: number;
  /** Maximum accepted evaluation requests per minute. */
  evaluationRateLimitPerMinute: number;
  /** Seconds a liveness check is allowed to run. */
  livenessTimeoutSec: number;
  /** Bridge semver, pulled from package.json. */
  bridgeVersion: string;
  /** Contents of the career-ops VERSION file. */
  careerOpsVersion: string;
}

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 47319;
const DEFAULT_EVAL_TIMEOUT_SEC = 900;   // 15 min — claude -p can be slow
const DEFAULT_EVAL_CONCURRENCY = 3;
const DEFAULT_EVAL_RPM = 30;
const DEFAULT_LIVENESS_TIMEOUT_SEC = 20;
const DEFAULT_CODEX_MODEL = "gpt-5.4-mini";
const DEFAULT_CODEX_REASONING_EFFORT = "medium";

function here(): string {
  return dirname(fileURLToPath(import.meta.url));
}

/**
 * Walk upward from src/runtime until we find apps/server/package.json
 * (the @career-ops/server package), then continue walking up to find
 * the career-ops repo root (identified by cv.md + modes/ + data/).
 *
 * If CAREER_OPS_REPO_ROOT is set, it overrides the repo-root search —
 * required for the packaged Electron app, where the server source is
 * inside the .app bundle but the user's data lives in their home dir.
 * The bridgeDir (for the .bridge-token) still comes from the walk-up.
 */
function findRepoRoot(): { repoRoot: string; bridgeDir: string } {
  const override = parseOptionalString(process.env.CAREER_OPS_REPO_ROOT);
  let dir = here();
  let bridgeDir: string | null = null;
  let walkedRepoRoot: string | null = null;
  for (let i = 0; i < 10; i++) {
    const pkg = join(dir, "package.json");
    if (existsSync(pkg)) {
      try {
        const content = JSON.parse(readFileSync(pkg, "utf-8"));
        if (content.name === "@career-ops/server" && bridgeDir === null) {
          bridgeDir = dir;
        }
      } catch {
        // ignore unreadable package.json
      }
    }
    if (bridgeDir !== null && walkedRepoRoot === null) {
      // Once we've found the server package, look for the repo root
      // (the directory holding cv.md + modes/ + data/).
      if (
        existsSync(join(dir, "cv.md")) &&
        existsSync(join(dir, "modes")) &&
        existsSync(join(dir, "data"))
      ) {
        walkedRepoRoot = dir;
      }
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  if (override) {
    // Always prefer a writable bridgeDir under the override. In a
    // packaged Electron app, the walked bridgeDir lands inside the
    // read-only app.asar (e.g. .../app.asar/node_modules/@career-ops/
    // server), which the token writer can't open.
    //
    // Prefer (in order):
    //   1. <override>/apps/server      — current workspace layout
    //   2. <override>/bridge           — legacy pre-restructure layout
    //   3. <override>                  — last resort, write at repo root
    // The chosen dir is created on demand so loadOrGenerateToken can
    // write .bridge-token without the caller needing to mkdir first.
    const candidates = [join(override, "apps/server"), join(override, "bridge")];
    const writableBridgeDir =
      candidates.find((p) => existsSync(p)) ?? candidates[0]!;
    return { repoRoot: override, bridgeDir: writableBridgeDir };
  }
  if (bridgeDir !== null && walkedRepoRoot !== null) {
    return { repoRoot: walkedRepoRoot, bridgeDir };
  }
  throw new Error(
    "bridge bootstrap: could not locate @career-ops/server package.json or career-ops repo root. " +
      "Set CAREER_OPS_REPO_ROOT to point at your career-ops checkout if running from a packaged app."
  );
}

/**
 * Resolve a binary name to an absolute path by scanning PATH manually.
 * We avoid spawning a shell (`which`, `command -v`) entirely so there is
 * zero command-injection surface. `binName` is always a hard-coded
 * literal in this module.
 */
function resolveBin(binName: string): string | null {
  const pathVar = process.env.PATH ?? "";
  const sep = process.platform === "win32" ? ";" : ":";
  const dirs = pathVar.split(sep).filter(Boolean);
  for (const d of dirs) {
    const candidate = join(d, binName);
    try {
      const s = statSync(candidate);
      if (s.isFile()) return candidate;
    } catch {
      // not here, keep looking
    }
  }
  return null;
}

function claudeVersion(claudeBin: string): string | null {
  try {
    // execFileSync with a fixed argv array — no shell, no injection surface.
    const out = execFileSync(claudeBin, ["--version"], {
      stdio: ["ignore", "pipe", "ignore"],
      encoding: "utf-8",
      timeout: 5000,
    });
    return out.trim();
  } catch {
    return null;
  }
}

function loadOrGenerateToken(bridgeDir: string): string {
  const tokenPath = join(bridgeDir, ".bridge-token");
  if (existsSync(tokenPath)) {
    const existing = readFileSync(tokenPath, "utf-8").trim();
    if (existing.length >= 32) {
      return existing;
    }
  }
  // Ensure the directory exists. In the packaged-app case bridgeDir may
  // be <repoRoot>/apps/server even though the user's repo predates the
  // workspace restructure — creating it keeps bootstrap from crashing.
  mkdirSync(bridgeDir, { recursive: true });
  const fresh = randomBytes(32).toString("base64url");
  writeFileSync(tokenPath, fresh + "\n", { mode: 0o600 });
  return fresh;
}

function readVersion(p: string): string {
  try {
    return readFileSync(p, "utf-8").trim();
  } catch {
    return "unknown";
  }
}

function readPackageVersion(pkgPath: string): string {
  try {
    return (JSON.parse(readFileSync(pkgPath, "utf-8")).version as string) ?? "unknown";
  } catch {
    return "unknown";
  }
}

function parseMode(raw: string | undefined): BridgeMode {
  if (raw === "real") return "real";
  if (raw === "fake" || raw === undefined) return "fake";
  throw new Error(
    `CAREER_OPS_BRIDGE_MODE must be "fake" or "real", got "${raw}"`
  );
}

function parseRealExecutor(raw: string | undefined): RealExecutor {
  if (raw === "codex") return "codex";
  if (raw === "claude") return "claude";
  if (raw === "openrouter") return "openrouter";
  if (raw === undefined || raw === "") return "codex";
  throw new Error(
    `CAREER_OPS_REAL_EXECUTOR must be "claude", "codex", or "openrouter", got "${raw}"`
  );
}

function parsePort(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > 65535) {
    throw new Error(`CAREER_OPS_BRIDGE_PORT invalid: "${raw}"`);
  }
  return n;
}

function parsePositiveInt(raw: string | undefined, fallback: number, envName: string): number {
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) {
    throw new Error(`${envName} invalid: "${raw}"`);
  }
  return n;
}

function parseOptionalString(raw: string | undefined): string | null {
  const value = raw?.trim();
  return value ? value : null;
}

export function loadConfig(): BridgeConfig {
  const { repoRoot, bridgeDir } = findRepoRoot();

  // Sanity check: repoRoot must contain cv.md, modes/, data/
  const mustExist = ["cv.md", "modes", "data"];
  for (const rel of mustExist) {
    const p = join(repoRoot, rel);
    if (!existsSync(p)) {
      throw new Error(
        `bridge bootstrap: repo root ${repoRoot} is missing ${rel}. This does not look like a career-ops repo.`
      );
    }
  }

  // Ensure batch dir exists — we don't create it, we just verify.
  const batchDir = join(repoRoot, "batch");
  if (!existsSync(batchDir) || !statSync(batchDir).isDirectory()) {
    throw new Error(
      `bridge bootstrap: expected ${batchDir} to exist as a directory`
    );
  }
  // Make sure tracker-additions exists; it's safe to create (existing
  // scripts do the same).
  const additionsDir = join(batchDir, "tracker-additions");
  if (!existsSync(additionsDir)) {
    mkdirSync(additionsDir, { recursive: true });
  }

  const token = loadOrGenerateToken(bridgeDir);
  const claudeBin = resolveBin("claude");
  const codexBin = resolveBin("codex");
  const codexModel = parseOptionalString(process.env.CAREER_OPS_CODEX_MODEL) ?? DEFAULT_CODEX_MODEL;
  const codexReasoningEffort =
    parseOptionalString(process.env.CAREER_OPS_CODEX_REASONING_EFFORT) ??
    DEFAULT_CODEX_REASONING_EFFORT;
  const nodeBin = resolveBin("node") ?? process.execPath;
  const mode = parseMode(process.env.CAREER_OPS_BRIDGE_MODE);
  const realExecutor = parseRealExecutor(process.env.CAREER_OPS_REAL_EXECUTOR);

  if (mode === "real" && realExecutor === "claude" && !claudeBin) {
    throw new Error(
      `bridge bootstrap: CAREER_OPS_BRIDGE_MODE=real but 'claude' CLI is not on PATH. ` +
        `Install Claude Code or switch to CAREER_OPS_BRIDGE_MODE=fake.`
    );
  }

  if (mode === "real" && realExecutor === "codex" && !codexBin) {
    throw new Error(
      `bridge bootstrap: CAREER_OPS_BRIDGE_MODE=real and CAREER_OPS_REAL_EXECUTOR=codex but 'codex' CLI is not on PATH. ` +
        `Install Codex CLI or switch CAREER_OPS_REAL_EXECUTOR=claude.`
    );
  }

  const bridgeVersion = readPackageVersion(join(bridgeDir, "package.json"));
  const careerOpsVersion = readVersion(join(repoRoot, "VERSION"));

  return {
    repoRoot,
    bridgeDir,
    host: process.env.CAREER_OPS_BRIDGE_HOST ?? DEFAULT_HOST,
    port: parsePort(process.env.CAREER_OPS_BRIDGE_PORT, DEFAULT_PORT),
    token,
    claudeBin,
    codexBin,
    codexModel,
    codexReasoningEffort,
    nodeBin,
    mode,
    realExecutor,
    evaluationTimeoutSec: DEFAULT_EVAL_TIMEOUT_SEC,
    evaluationConcurrency: parsePositiveInt(
      process.env.CAREER_OPS_BRIDGE_EVAL_CONCURRENCY,
      DEFAULT_EVAL_CONCURRENCY,
      "CAREER_OPS_BRIDGE_EVAL_CONCURRENCY",
    ),
    evaluationRateLimitPerMinute: parsePositiveInt(
      process.env.CAREER_OPS_BRIDGE_EVAL_RPM,
      DEFAULT_EVAL_RPM,
      "CAREER_OPS_BRIDGE_EVAL_RPM",
    ),
    livenessTimeoutSec: DEFAULT_LIVENESS_TIMEOUT_SEC,
    bridgeVersion,
    careerOpsVersion,
  };
}

/**
 * Cheap diagnostic used by /health. Never throws; returns structured info.
 */
function inspectCli(bin: string | null, name: string): {
  ok: boolean;
  version?: string;
  error?: string;
} {
  if (!bin) {
    return { ok: false, error: `${name} CLI not found on PATH` };
  }
  const v = claudeVersion(bin);
  if (v === null) {
    return { ok: false, error: `${name} --version failed` };
  }
  return { ok: true, version: v };
}

export function inspectClaude(config: BridgeConfig): {
  ok: boolean;
  version?: string;
  error?: string;
} {
  return inspectCli(config.claudeBin, "claude");
}

export function inspectCodex(config: BridgeConfig): {
  ok: boolean;
  version?: string;
  error?: string;
} {
  return inspectCli(config.codexBin, "codex");
}
