#!/usr/bin/env node
import { spawn } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";

const LOG_DIR = join(homedir(), "Library", "Logs", "CareerOps");
const args = process.argv.includes("--err")
    ? [join(LOG_DIR, "server.err.log")]
    : [join(LOG_DIR, "server.out.log"), join(LOG_DIR, "server.err.log")];

spawn("tail", ["-f", ...args], { stdio: "inherit" });
