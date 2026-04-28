#!/usr/bin/env node

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const canonicalRoot = join(repoRoot, "skills");
const mirrorRoots = [join(repoRoot, ".claude/skills")];

function listFiles(root, dir = root) {
  if (!existsSync(root)) return [];
  const entries = readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listFiles(root, path));
    } else if (entry.isFile()) {
      files.push(relative(root, path));
    }
  }
  return files.sort();
}

function read(root, relativePath) {
  return readFileSync(join(root, relativePath), "utf-8");
}

if (!existsSync(canonicalRoot)) {
  console.error("Missing canonical skills/ directory");
  process.exit(1);
}

const canonicalFiles = listFiles(canonicalRoot);
const errors = [];

for (const required of [
  "auto-job/SKILL.md",
  "exec-plan-consolidator/SKILL.md",
]) {
  if (!canonicalFiles.includes(required)) {
    errors.push(`Missing required canonical skill file: skills/${required}`);
  }
}

for (const mirrorRoot of mirrorRoots) {
  if (!existsSync(mirrorRoot)) {
    errors.push(`Missing skill mirror: ${relative(repoRoot, mirrorRoot)}`);
    continue;
  }

  const mirrorFiles = listFiles(mirrorRoot);
  const allFiles = new Set([...canonicalFiles, ...mirrorFiles]);
  for (const relativePath of [...allFiles].sort()) {
    if (!canonicalFiles.includes(relativePath)) {
      errors.push(`Mirror-only skill file: ${relative(mirrorRoot, join(mirrorRoot, relativePath))}`);
      continue;
    }
    if (!mirrorFiles.includes(relativePath)) {
      errors.push(`Missing mirror skill file: ${relative(mirrorRoot, join(mirrorRoot, relativePath))}`);
      continue;
    }
    if (read(canonicalRoot, relativePath) !== read(mirrorRoot, relativePath)) {
      errors.push(`Skill mirror drift: ${relativePath}`);
    }
  }
}

if (errors.length > 0) {
  console.error("Skill sync verification failed:");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log(`Skill sync verification passed (${canonicalFiles.length} files)`);
