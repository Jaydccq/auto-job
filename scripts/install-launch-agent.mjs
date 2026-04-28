#!/usr/bin/env node
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_PATH = resolve(fileURLToPath(import.meta.url), "../..");
const HOME = homedir();
const LABEL = "io.hongxi.auto-job";
const TEMPLATE = join(REPO_PATH, "templates", `${LABEL}.plist.template`);
const TARGET = join(HOME, "Library", "LaunchAgents", `${LABEL}.plist`);
const LOG_DIR = join(HOME, "Library", "Logs", "CareerOps");

function exec(cmd) {
    return execSync(cmd, { encoding: "utf8" }).trim();
}

function unloadIfPresent() {
    if (!existsSync(TARGET)) return;
    try { execSync(`launchctl unload "${TARGET}"`, { stdio: "ignore" }); }
    catch { /* not loaded */ }
}

function main() {
    if (process.platform !== "darwin") {
        console.error("install-launch-agent: macOS only.");
        process.exit(1);
    }
    if (!existsSync(TEMPLATE)) {
        console.error(`Template not found: ${TEMPLATE}`);
        process.exit(1);
    }

    mkdirSync(LOG_DIR, { recursive: true });

    let userPath;
    try {
        userPath = exec("zsh -i -c 'echo $PATH'");
    } catch {
        // Fall back to current process PATH if shell init fails
        userPath = process.env.PATH ?? "/usr/local/bin:/usr/bin:/bin";
    }

    const filled = readFileSync(TEMPLATE, "utf8")
        .replaceAll("{{NODE_PATH}}", exec("which node"))
        .replaceAll("{{REPO_PATH}}", REPO_PATH)
        .replaceAll("{{USER_PATH}}", userPath)
        .replaceAll("{{HOME_PATH}}", HOME)
        .replaceAll("{{LOG_DIR}}", LOG_DIR);

    unloadIfPresent();
    writeFileSync(TARGET, filled, { mode: 0o644 });
    execSync(`launchctl load "${TARGET}"`, { stdio: "inherit" });

    console.log(`Installed: ${TARGET}`);
    console.log(`Logs:      ${LOG_DIR}/server.{out,err}.log`);
    console.log(`Verify:    bun run app:status`);
}

main();
