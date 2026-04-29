/**
 * index.ts — bridge entrypoint + embeddable factory.
 *
 * Two consumers:
 *   1. The CLI (scripts/bridge-start.mjs -> npm run start) imports this
 *      module via `tsx` and runs main() at the bottom. It prints the
 *      banner and listens.
 *   2. The Electron main process (apps/desktop) imports `createServer()`
 *      and embeds the bridge in-process — no child subprocess.
 *
 * Boot sequence (shared by both):
 *   1. loadConfig() — resolves repoRoot, token, binaries.
 *   2. Build the adapter (fake by default, real when requested).
 *   3. buildServer() — wires Fastify with the adapter.
 *   4. (CLI only) listen on loopback + log banner.
 */

import { pathToFileURL } from "node:url";

import type { PipelineAdapter, PipelineConfig } from "./contracts/pipeline.js";
import { loadConfig, type BridgeConfig } from "./runtime/config.js";
import { createFakePipelineAdapter } from "./adapters/fake-pipeline.js";
import { createClaudePipelineAdapter } from "./adapters/claude-pipeline.js";
import {
  createOpenRouterPipelineAdapter,
  resolveOpenRouterApiKey,
} from "./adapters/openrouter-pipeline.js";
import { buildServer } from "./server.js";

export type AdapterMode =
  | "fake"
  | "real-claude"
  | "real-codex"
  | "real-openrouter";

export interface CreateServerOptions {
  /**
   * Pick the pipeline adapter. Maps to the same env-var matrix the CLI
   * understands (AUTO_JOB_BRIDGE_MODE + AUTO_JOB_REAL_EXECUTOR).
   * If omitted, env vars decide; if env vars are also unset the default
   * is "fake".
   */
  backend?: AdapterMode;
  /**
   * OpenRouter model slug, e.g. "anthropic/claude-3.5-sonnet". Only used
   * when backend === "real-openrouter". Mutates process.env.OPENROUTER_MODEL
   * so the adapter (and any subprocess that reads the env) picks it up.
   * If omitted, the adapter falls back to its built-in default.
   */
  openrouterModel?: string;
}

export interface ServerHandle {
  /** Resolved bridge config (token, port, repoRoot, …). */
  readonly config: BridgeConfig;
  /** Begin listening. Defaults to config.host:config.port. */
  start(opts?: { port?: number; host?: string }): Promise<{ port: number; host: string }>;
  /** Close the Fastify instance. Idempotent. */
  stop(): Promise<void>;
}

function toPipelineConfig(cfg: BridgeConfig): PipelineConfig {
  return {
    repoRoot: cfg.repoRoot,
    claudeBin: cfg.claudeBin ?? "claude",
    codexBin: cfg.codexBin,
    codexModel: cfg.codexModel,
    codexReasoningEffort: cfg.codexReasoningEffort,
    nodeBin: cfg.nodeBin,
    realExecutor: cfg.realExecutor,
    evaluationTimeoutSec: cfg.evaluationTimeoutSec,
    livenessTimeoutSec: cfg.livenessTimeoutSec,
    allowDangerousClaudeFlags: true,
  };
}

/**
 * Translate the Electron-friendly "backend" enum into the env-var pair
 * loadConfig() expects. Mutates process.env so loadConfig sees the
 * override; this is acceptable because the bridge runs once per process.
 */
function applyBackendOverride(backend: AdapterMode): void {
  switch (backend) {
    case "fake":
      process.env.AUTO_JOB_BRIDGE_MODE = "fake";
      // AUTO_JOB_REAL_EXECUTOR is irrelevant in fake mode.
      break;
    case "real-claude":
      process.env.AUTO_JOB_BRIDGE_MODE = "real";
      process.env.AUTO_JOB_REAL_EXECUTOR = "claude";
      break;
    case "real-codex":
      process.env.AUTO_JOB_BRIDGE_MODE = "real";
      process.env.AUTO_JOB_REAL_EXECUTOR = "codex";
      break;
    case "real-openrouter":
      process.env.AUTO_JOB_BRIDGE_MODE = "real";
      process.env.AUTO_JOB_REAL_EXECUTOR = "openrouter";
      break;
  }
}

function buildAdapter(config: BridgeConfig): PipelineAdapter {
  const pipelineCfg = toPipelineConfig(config);
  switch (config.mode) {
    case "fake":
      return createFakePipelineAdapter(pipelineCfg);
    case "real":
      if (config.realExecutor === "openrouter") {
        const apiKey = resolveOpenRouterApiKey();
        const model = process.env.OPENROUTER_MODEL?.trim();
        return createOpenRouterPipelineAdapter(
          pipelineCfg,
          model ? { apiKey, model } : { apiKey },
        );
      }
      return createClaudePipelineAdapter(pipelineCfg);
  }
}

/**
 * Build a bridge server without listening. The caller controls the
 * lifecycle via { start, stop }. Used by the Electron main process to
 * embed the bridge in-process.
 */
export function createServer(opts: CreateServerOptions = {}): ServerHandle {
  if (opts.backend !== undefined) {
    applyBackendOverride(opts.backend);
  }
  if (typeof opts.openrouterModel === "string") {
    const trimmed = opts.openrouterModel.trim();
    if (trimmed) process.env.OPENROUTER_MODEL = trimmed;
    else delete process.env.OPENROUTER_MODEL;
  }

  const config = loadConfig();
  const adapter = buildAdapter(config);
  const { fastify } = buildServer({ config, adapter });

  let listening = false;
  let stopped = false;

  return {
    config,
    async start(listenOpts) {
      if (listening) {
        throw new Error("createServer: start() called twice");
      }
      const host = listenOpts?.host ?? config.host;
      const port = listenOpts?.port ?? config.port;

      const tokenPreview = config.token.slice(0, 8) + "…";
      fastify.log.info(
        {
          mode: config.mode,
          realExecutor: config.realExecutor,
          host,
          port,
          repoRoot: config.repoRoot,
          bridgeVersion: config.bridgeVersion,
          careerOpsVersion: config.careerOpsVersion,
          codexModel:
            config.realExecutor === "codex" ? config.codexModel : undefined,
          codexReasoningEffort:
            config.realExecutor === "codex"
              ? config.codexReasoningEffort
              : undefined,
          tokenPreview,
        },
        "auto-job bridge booting"
      );

      await fastify.listen({ host, port });
      listening = true;
      return { host, port };
    },
    async stop() {
      if (stopped) return;
      stopped = true;
      await fastify.close();
    },
  };
}

/* -------------------------------------------------------------------------- */
/*  CLI entrypoint                                                             */
/* -------------------------------------------------------------------------- */

async function main(): Promise<void> {
  const server = createServer();
  const { host, port } = await server.start();
  // The Fastify logger already announces the listen banner; this second
  // line keeps backwards compatibility with the previous index.ts output.
  console.error(
    `auto-job bridge listening on http://${host}:${port} (mode=${server.config.mode})`
  );
  console.error(
    `token file: ${server.config.bridgeDir}/.bridge-token (mode 0600)`
  );

  const shutdown = async (signal: NodeJS.Signals) => {
    try {
      await server.stop();
    } finally {
      // exit code 0 — graceful shutdown was the intent
      process.exit(signal === "SIGINT" || signal === "SIGTERM" ? 0 : 1);
    }
  };
  process.once("SIGINT", () => void shutdown("SIGINT"));
  process.once("SIGTERM", () => void shutdown("SIGTERM"));
}

/**
 * Run main() only when this module is the process entrypoint. The
 * Electron app imports createServer() and must NOT trigger main().
 *
 * Compare import.meta.url to the URL of process.argv[1] (the script the
 * user invoked). They match when this file is the entrypoint, regardless
 * of whether tsx or node loaded it.
 */
const invokedDirectly = (() => {
  const argv1 = process.argv[1];
  if (!argv1) return false;
  try {
    return import.meta.url === pathToFileURL(argv1).href;
  } catch {
    return false;
  }
})();

if (invokedDirectly) {
  main().catch((err) => {
    console.error("bridge failed to start:", err);
    process.exit(1);
  });
}
