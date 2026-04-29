#!/usr/bin/env node

import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const MODES = {
  fake: {
    label: "fake",
    env: {
      AUTO_JOB_BRIDGE_MODE: "fake",
    },
  },
  "real-claude": {
    label: "real / claude",
    env: {
      AUTO_JOB_BRIDGE_MODE: "real",
      AUTO_JOB_REAL_EXECUTOR: "claude",
    },
  },
  "real-codex": {
    label: "real / codex",
    env: {
      AUTO_JOB_BRIDGE_MODE: "real",
      AUTO_JOB_REAL_EXECUTOR: "codex",
    },
  },
  "real-openrouter": {
    label: "real / openrouter",
    env: {
      AUTO_JOB_BRIDGE_MODE: "real",
      AUTO_JOB_REAL_EXECUTOR: "openrouter",
    },
  },
};

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const VALID_MODES = Object.keys(MODES);
const DEFAULT_MODE = "real-codex";

function usage() {
  console.log(`Usage: node scripts/bridge-start.mjs [<mode>] [--dry-run]

Mode resolution (first match wins):
  1. positional argument: ${VALID_MODES.join(" | ")}
  2. AUTO_JOB_BACKEND env var: ${VALID_MODES.join(" | ")}
  3. default: ${DEFAULT_MODE}`);
}

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const positionalArg = args.find((arg) => !arg.startsWith("--"));
const envArg = process.env.AUTO_JOB_BACKEND;

let modeKey;
if (positionalArg) {
  if (!(positionalArg in MODES)) {
    usage();
    process.exit(1);
  }
  modeKey = positionalArg;
} else if (envArg) {
  if (!(envArg in MODES)) {
    console.error(
      `AUTO_JOB_BACKEND must be one of: ${VALID_MODES.join(", ")} (got "${envArg}")`
    );
    process.exit(1);
  }
  modeKey = envArg;
} else {
  modeKey = DEFAULT_MODE;
}

const mode = MODES[modeKey];
const env = {
  ...process.env,
  ...mode.env,
};
const npmBin = process.platform === "win32" ? "npm.cmd" : "npm";
const npmArgs = ["--prefix", "apps/server", "run", "start"];

if (dryRun) {
  console.log(`Mode: ${mode.label}`);
  console.log(`Command: ${npmBin} ${npmArgs.join(" ")}`);
  console.log("Env:");
  for (const [key, value] of Object.entries(mode.env)) {
    console.log(`  ${key}=${value}`);
  }
  process.exit(0);
}

const child = spawn(npmBin, npmArgs, {
  cwd: repoRoot,
  env,
  stdio: "inherit",
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
