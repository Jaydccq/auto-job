#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = dirname(fileURLToPath(import.meta.url));
const tty = process.stdout.isTTY;
const green = (s) => (tty ? `\x1b[32m${s}\x1b[0m` : s);
const red = (s) => (tty ? `\x1b[31m${s}\x1b[0m` : s);
const dim = (s) => (tty ? `\x1b[2m${s}\x1b[0m` : s);

let passed = 0;
let failed = 0;

function pass(msg) {
  console.log(`  ${green("ok")}  ${msg}`);
  passed++;
}
function fail(msg, detail) {
  console.log(`  ${red("xx")}  ${msg}`);
  if (detail) console.log(dim(detail.split("\n").map((l) => `       ${l}`).join("\n")));
  failed++;
}

function run(label, command, args, opts = {}) {
  try {
    execFileSync(command, args, {
      cwd: opts.cwd ?? repoRoot,
      stdio: "pipe",
      encoding: "utf-8",
      timeout: opts.timeout ?? 60000,
    });
    pass(label);
  } catch (e) {
    const detail = [(e?.stdout ?? "").trim(), (e?.stderr ?? "").trim()].filter(Boolean).join("\n");
    fail(label, detail || (e?.message ?? "command failed"));
  }
}

function discoverMjsFiles() {
  const out = readdirSync(repoRoot).filter((f) => f.endsWith(".mjs"));
  const scriptsDir = join(repoRoot, "scripts");
  if (existsSync(scriptsDir)) {
    for (const f of readdirSync(scriptsDir)) {
      if (f.endsWith(".mjs")) out.push(`scripts/${f}`);
    }
  }
  return out.sort();
}

console.log("\nauto-job test suite\n");

console.log("1. Syntax (node --check)");
for (const file of discoverMjsFiles()) {
  run(file, process.execPath, ["--check", file]);
}

console.log("\n2. Repo ownership guard");
run("verify:repo-guard", process.execPath, [join(repoRoot, "scripts/verify-repo-guard.mjs")]);

console.log("\n3. Server workspace");
const serverDir = join(repoRoot, "apps/server");
if (existsSync(serverDir)) {
  run("server typecheck", "npm", ["run", "typecheck"], { cwd: serverDir });
  run("server tests", "npm", ["run", "test"], { cwd: serverDir, timeout: 120000 });
} else {
  fail("apps/server missing");
}

console.log("\n4. Extension workspace");
const extDir = join(repoRoot, "apps/extension");
if (existsSync(extDir)) {
  run("extension typecheck", "npm", ["run", "typecheck"], { cwd: extDir });
  run("extension build", "npm", ["run", "build"], { cwd: extDir });
} else {
  fail("apps/extension missing");
}

console.log("\n5. Shared workspace");
const sharedDir = join(repoRoot, "packages/shared");
if (existsSync(sharedDir)) {
  run("shared typecheck", "npm", ["run", "typecheck"], { cwd: sharedDir });
}

console.log(`\nResult: ${passed} passed, ${failed} failed.`);
process.exit(failed > 0 ? 1 : 0);
