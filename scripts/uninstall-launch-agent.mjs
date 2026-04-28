#!/usr/bin/env node
import { execSync } from "node:child_process";
import { existsSync, unlinkSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const LABEL = "io.hongxi.career-ops";
const TARGET = join(homedir(), "Library", "LaunchAgents", `${LABEL}.plist`);

if (!existsSync(TARGET)) {
    console.log(`No LaunchAgent at ${TARGET} — nothing to uninstall.`);
    process.exit(0);
}

try { execSync(`launchctl unload "${TARGET}"`, { stdio: "ignore" }); }
catch { /* may not be loaded */ }

unlinkSync(TARGET);
console.log(`Uninstalled: ${TARGET}`);
