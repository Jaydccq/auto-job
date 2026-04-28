#!/usr/bin/env node

import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = dirname(fileURLToPath(import.meta.url));

const errors = [];
const warnings = [];

function fail(msg) {
  errors.push(msg);
}
function warn(msg) {
  warnings.push(msg);
}

function checkFileExists(relPath, msg) {
  if (!existsSync(join(repoRoot, relPath))) {
    fail(msg ?? `Missing required file: ${relPath}`);
    return false;
  }
  return true;
}

function readIfExists(relPath) {
  const p = join(repoRoot, relPath);
  return existsSync(p) ? readFileSync(p, "utf-8") : null;
}

if (checkFileExists("cv.md", "cv.md is missing — drop your CV markdown at the repo root.")) {
  const cv = readFileSync(join(repoRoot, "cv.md"), "utf-8").trim();
  if (cv.length < 200) {
    warn("cv.md looks too short (<200 chars). Confirm it has the full CV body.");
  }
}

const profile = readIfExists("config/profile.yml");
if (profile === null) {
  fail("config/profile.yml is missing — copy config/profile.example.yml and fill it in.");
} else {
  for (const field of ["full_name", "email", "location"]) {
    if (!new RegExp(`(^|\\n)\\s*${field}\\s*:`).test(profile)) {
      warn(`config/profile.yml is missing field: ${field}`);
    }
  }
  if (/Jane Smith|example@example\.com|placeholder/i.test(profile)) {
    warn("config/profile.yml still contains example placeholders.");
  }
}

const promptFiles = [
  "modes/_shared.md",
  "batch/batch-prompt.md",
];
const metricRegex = /\b\d{2,4}\+?\s*(?:hours?|%|evals?|tests?|fields?|services?|systems?)\b/gi;

for (const rel of promptFiles) {
  const content = readIfExists(rel);
  if (content === null) continue;
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (
      line.startsWith("#") ||
      line.startsWith("<!--") ||
      /never hardcode|do not hardcode/i.test(line)
    ) {
      continue;
    }
    const matches = line.match(metricRegex);
    if (matches) {
      warn(
        `${rel}:${i + 1} — possible hardcoded metric "${matches[0]}". Read from cv.md/article-digest.md instead.`,
      );
    }
  }
}

const digestPath = join(repoRoot, "article-digest.md");
if (existsSync(digestPath)) {
  const ageDays = (Date.now() - statSync(digestPath).mtimeMs) / (1000 * 60 * 60 * 24);
  if (ageDays > 45) {
    warn(`article-digest.md is ${Math.round(ageDays)} days old — refresh it if proof points changed.`);
  }
}

console.log("");
console.log("auto-job sync check");
console.log("===================");
if (errors.length === 0 && warnings.length === 0) {
  console.log("OK — profile, CV, and prompt files look consistent.");
  process.exit(0);
}

if (errors.length > 0) {
  console.log(`\nERRORS (${errors.length}):`);
  for (const e of errors) console.log(`  - ${e}`);
}
if (warnings.length > 0) {
  console.log(`\nWARNINGS (${warnings.length}):`);
  for (const w of warnings) console.log(`  - ${w}`);
}
console.log("");

process.exit(errors.length > 0 ? 1 : 0);
