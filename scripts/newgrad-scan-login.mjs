import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_URL = "https://jobright.ai/";
const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const DEFAULT_USER_DATA_DIR = join(repoRoot, "data", "browser-profiles", "newgrad-scan");

function usage() {
  return `career-ops newgrad scan login browser

Usage:
  bun run newgrad-scan:login -- [options]

Options:
  --url <url>             Login URL. Default: ${DEFAULT_URL}
  --user-data-dir <path>  Browser profile directory. Default: ${DEFAULT_USER_DATA_DIR}
  --help                  Show this help.
`;
}

function parseArgs(argv) {
  const options = {
    url: DEFAULT_URL,
    userDataDir: DEFAULT_USER_DATA_DIR,
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => {
      const value = argv[i + 1];
      if (!value || value.startsWith("--")) {
        throw new Error(`missing value for ${arg}`);
      }
      i += 1;
      return value;
    };

    switch (arg) {
      case "--url":
        options.url = next();
        break;
      case "--user-data-dir":
        options.userDataDir = resolve(next());
        break;
      case "--help":
      case "-h":
        options.help = true;
        break;
      default:
        throw new Error(`unknown option: ${arg}`);
    }
  }

  return options;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(usage());
    return;
  }

  mkdirSync(options.userDataDir, { recursive: true });

  if (process.platform !== "darwin") {
    throw new Error("newgrad-scan:login currently supports macOS Google Chrome via the open command");
  }

  const child = spawn(
    "open",
    [
      "-na",
      "Google Chrome",
      "--args",
      `--user-data-dir=${options.userDataDir}`,
      "--no-first-run",
      "--no-default-browser-check",
      options.url,
    ],
    { stdio: "inherit" },
  );

  child.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 0);
  });
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
