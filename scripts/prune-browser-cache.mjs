#!/usr/bin/env node
// Prune regenerable Chromium caches from own-browser profiles.
// See docs/exec-plans/active/2026-05-04-browser-cache-pruning.md for rationale.

import { existsSync, readdirSync, rmSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

const DRY_RUN = process.argv.includes("--dry-run");

// Profile-root level: regenerable caches and Chrome-side ML model packs.
const ROOT_TARGETS = [
  "SODA",
  "SODALanguagePacks",
  "WasmTtsEngine",
  "optimization_guide_model_store",
  "OnDeviceHeadSuggestModel",
  "component_crx_cache",
  "GraphiteDawnCache",
  "ShaderCache",
  "GrShaderCache",
];

// Per-profile (Default/) HTTP, V8, and GPU caches.
const DEFAULT_TARGETS = [
  "Cache",
  "Code Cache",
  "GPUCache",
  "DawnWebGPUCache",
  "DawnGraphiteCache",
  "ShaderCache",
];

function repoProfileRoots() {
  const repoBase = resolve(process.cwd(), "data/browser-profiles");
  if (!existsSync(repoBase)) return [];
  return readdirSync(repoBase, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => join(repoBase, e.name));
}

function homeProfileRoot() {
  const p = join(homedir(), ".auto-job", "chrome-profile");
  return existsSync(p) ? [p] : [];
}

function dirSize(path) {
  let total = 0;
  const stack = [path];
  while (stack.length) {
    const cur = stack.pop();
    let entries;
    try {
      entries = readdirSync(cur, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const ent of entries) {
      const full = join(cur, ent.name);
      try {
        if (ent.isDirectory()) stack.push(full);
        else total += statSync(full).size;
      } catch {
        // ignore vanishing files
      }
    }
  }
  return total;
}

function fmt(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let v = bytes / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(1)} ${units[i]}`;
}

function isLocked(profileRoot) {
  // Chromium creates SingletonLock while a profile is open. Bail if present.
  return existsSync(join(profileRoot, "SingletonLock"));
}

function pruneOne(profileRoot) {
  if (isLocked(profileRoot)) {
    console.log(`SKIP  ${profileRoot}  (SingletonLock present — Chromium is using this profile)`);
    return 0;
  }

  let freed = 0;
  const candidates = [
    ...ROOT_TARGETS.map((name) => join(profileRoot, name)),
    ...DEFAULT_TARGETS.map((name) => join(profileRoot, "Default", name)),
  ];

  console.log(`\n${profileRoot}`);
  for (const target of candidates) {
    if (!existsSync(target)) continue;
    const size = dirSize(target);
    freed += size;
    const rel = target.slice(profileRoot.length + 1);
    if (DRY_RUN) {
      console.log(`  would delete  ${fmt(size).padStart(9)}  ${rel}`);
    } else {
      rmSync(target, { recursive: true, force: true });
      console.log(`  deleted       ${fmt(size).padStart(9)}  ${rel}`);
    }
  }
  return freed;
}

const roots = [...repoProfileRoots(), ...homeProfileRoot()];
if (roots.length === 0) {
  console.log("No own-browser profiles found. Nothing to do.");
  process.exit(0);
}

console.log(`${DRY_RUN ? "DRY RUN — " : ""}Pruning ${roots.length} profile(s)`);
let total = 0;
for (const r of roots) total += pruneOne(r);

console.log(`\n${DRY_RUN ? "Would free" : "Freed"}: ${fmt(total)}`);
