#!/usr/bin/env node
import { execSync } from "node:child_process";

const LABEL = "io.hongxi.career-ops";

try {
    const out = execSync(`launchctl list ${LABEL}`, { encoding: "utf8" });
    process.stdout.write(out);
    const pidMatch = out.match(/"PID"\s*=\s*(\d+);/);
    if (pidMatch) {
        console.log(`\nStatus: RUNNING (pid ${pidMatch[1]})`);
    } else {
        console.log("\nStatus: LOADED but not running (LaunchAgent will retry)");
    }
} catch {
    console.log(`Status: NOT INSTALLED (run \`bun run app:install\`)`);
    process.exit(1);
}
