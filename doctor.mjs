#!/usr/bin/env node

import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = dirname(fileURLToPath(import.meta.url));
const tty = process.stdout.isTTY;
const green = (s) => (tty ? `\x1b[32m${s}\x1b[0m` : s);
const red = (s) => (tty ? `\x1b[31m${s}\x1b[0m` : s);
const dim = (s) => (tty ? `\x1b[2m${s}\x1b[0m` : s);

function checkNode() {
  const major = Number.parseInt(process.versions.node.split(".")[0], 10);
  return major >= 20
    ? { pass: true, label: `Node ${process.versions.node}` }
    : {
        pass: false,
        label: `Node >= 20 required (have ${process.versions.node})`,
        fix: ["Install Node 20+ from https://nodejs.org or use npm for everything."],
      };
}

async function checkPlaywright() {
  try {
    const { chromium } = await import("playwright");
    const exec = chromium.executablePath();
    if (existsSync(exec)) return { pass: true, label: "Playwright Chromium installed" };
    return {
      pass: false,
      label: "Playwright Chromium not installed",
      fix: ["Run: npx playwright install chromium"],
    };
  } catch {
    return {
      pass: false,
      label: "Playwright not available",
      fix: ["Run: npm install"],
    };
  }
}

function checkInstall() {
  return existsSync(join(repoRoot, "node_modules"))
    ? { pass: true, label: "Top-level dependencies installed" }
    : { pass: false, label: "Dependencies missing", fix: ["Run: npm install"] };
}

function checkUserFile(rel, fix) {
  return existsSync(join(repoRoot, rel))
    ? { pass: true, label: `${rel} present` }
    : { pass: false, label: `${rel} missing`, fix };
}

function ensureDir(rel) {
  const path = join(repoRoot, rel);
  if (existsSync(path)) return { pass: true, label: `${rel}/ ready` };
  try {
    mkdirSync(path, { recursive: true });
    return { pass: true, label: `${rel}/ created` };
  } catch {
    return { pass: false, label: `${rel}/ could not be created`, fix: [`mkdir -p ${rel}`] };
  }
}

async function main() {
  console.log("\nauto-job doctor");
  console.log("===============\n");

  const checks = [
    checkNode(),
    checkInstall(),
    await checkPlaywright(),
    checkUserFile("cv.md", ["Place your CV markdown at the repo root."]),
    checkUserFile("config/profile.yml", [
      "cp config/profile.example.yml config/profile.yml",
      "Then fill in name/email/location/target roles.",
    ]),
    checkUserFile("portals.yml", [
      "cp templates/portals.example.yml portals.yml",
      "Then customize the company list.",
    ]),
    ensureDir("data"),
    ensureDir("output"),
    ensureDir("reports"),
    ensureDir("batch/tracker-additions"),
  ];

  let failures = 0;
  for (const result of checks) {
    if (result.pass) {
      console.log(`${green("ok")}  ${result.label}`);
    } else {
      failures++;
      console.log(`${red("xx")}  ${result.label}`);
      for (const hint of result.fix ?? []) console.log(`     ${dim(`→ ${hint}`)}`);
    }
  }

  console.log("");
  if (failures > 0) {
    console.log(`${failures} issue(s) found. Fix and rerun \`npm run doctor\`.`);
    process.exit(1);
  }
  console.log("All checks passed. Start with: npm run server");
  process.exit(0);
}

main().catch((err) => {
  console.error("doctor failed:", err.message);
  process.exit(1);
});
