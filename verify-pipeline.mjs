#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = dirname(fileURLToPath(import.meta.url));
const trackerPath = join(repoRoot, "data/applications.md");
const additionsDir = join(repoRoot, "batch/tracker-additions");

const CANONICAL_STATUSES = new Set([
  "evaluated", "applied", "responded", "interview",
  "offer", "rejected", "discarded", "skip",
]);

let errors = 0;
let warnings = 0;
const log = {
  ok: (m) => console.log(`OK   ${m}`),
  warn: (m) => { console.log(`WARN ${m}`); warnings++; },
  err: (m) => { console.log(`FAIL ${m}`); errors++; },
};

function runBunStep(label, cwd, args) {
  try {
    execFileSync(process.platform === "win32" ? "bun.cmd" : "bun", args, {
      cwd, stdio: "pipe", encoding: "utf-8",
    });
    log.ok(label);
  } catch (e) {
    const out = [(e?.stdout ?? "").trim(), (e?.stderr ?? "").trim()].filter(Boolean).join("\n");
    log.err(`${label}: ${out || "command failed"}`);
  }
}

function checkTracker() {
  if (!existsSync(trackerPath)) {
    console.log("(data/applications.md not found — fresh setup, skipping tracker checks)");
    return;
  }
  const lines = readFileSync(trackerPath, "utf-8").split("\n");
  const entries = [];
  for (const line of lines) {
    if (!line.startsWith("|")) continue;
    const cols = line.split("|").map((c) => c.trim());
    if (cols.length < 9) continue;
    const num = Number.parseInt(cols[1], 10);
    if (Number.isNaN(num)) continue;
    entries.push({
      num, date: cols[2], company: cols[3], role: cols[4],
      score: cols[5], status: cols[6], pdf: cols[7], report: cols[8], notes: cols[9] ?? "",
    });
  }

  console.log(`\nChecking ${entries.length} tracker entries.\n`);

  let badStatus = 0;
  for (const e of entries) {
    const lc = e.status.replace(/\*\*/g, "").replace(/\s+\d{4}-\d{2}-\d{2}.*$/, "").trim().toLowerCase();
    if (!CANONICAL_STATUSES.has(lc)) {
      log.err(`#${e.num}: non-canonical status "${e.status}"`);
      badStatus++;
    }
    if (e.status.includes("**")) { log.err(`#${e.num}: status has markdown bold`); badStatus++; }
    if (/\d{4}-\d{2}-\d{2}/.test(e.status)) { log.err(`#${e.num}: status contains date`); badStatus++; }
  }
  if (badStatus === 0) log.ok("statuses are canonical");

  const groups = new Map();
  for (const e of entries) {
    const key = `${e.company.toLowerCase().replace(/[^a-z0-9]/g, "")}::${e.role.toLowerCase().replace(/[^a-z0-9 ]/g, "")}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(e);
  }
  let dupGroups = 0;
  for (const group of groups.values()) {
    if (group.length > 1) {
      log.warn(`possible duplicates: ${group.map((e) => `#${e.num}`).join(", ")} (${group[0].company} — ${group[0].role})`);
      dupGroups++;
    }
  }
  if (dupGroups === 0) log.ok("no exact duplicates");

  let brokenReports = 0;
  for (const e of entries) {
    const m = e.report.match(/\]\(([^)]+)\)/);
    if (!m) continue;
    if (!existsSync(join(repoRoot, m[1]))) {
      log.err(`#${e.num}: report path not found: ${m[1]}`);
      brokenReports++;
    }
  }
  if (brokenReports === 0) log.ok("report links resolve");

  let badScores = 0;
  for (const e of entries) {
    const s = e.score.replace(/\*\*/g, "").trim();
    if (!/^\d+(?:\.\d+)?\/5$/.test(s) && s !== "N/A" && s !== "DUP") {
      log.err(`#${e.num}: invalid score "${e.score}"`);
      badScores++;
    }
  }
  if (badScores === 0) log.ok("scores well-formed");

  if (existsSync(additionsDir)) {
    const pending = readdirSync(additionsDir).filter((f) => f.endsWith(".tsv"));
    if (pending.length === 0) log.ok("no pending tracker TSVs");
    else log.warn(`${pending.length} pending TSVs in batch/tracker-additions/ (run merge-tracker)`);
  }
}

checkTracker();

console.log("\nChecking workspaces.\n");
runBunStep("repo ownership guard", repoRoot, ["run", "verify:repo-guard"]);
runBunStep("skill mirrors", repoRoot, ["run", "verify:skills"]);
if (existsSync(join(repoRoot, "apps/server/package.json"))) {
  runBunStep("server tests", join(repoRoot, "apps/server"), ["run", "test"]);
  runBunStep("server typecheck", join(repoRoot, "apps/server"), ["run", "typecheck"]);
}
if (existsSync(join(repoRoot, "apps/extension/package.json"))) {
  runBunStep("extension typecheck", join(repoRoot, "apps/extension"), ["run", "typecheck"]);
  runBunStep("extension build", join(repoRoot, "apps/extension"), ["run", "build"]);
}

console.log(`\n${"=".repeat(50)}`);
console.log(`Result: ${errors} error(s), ${warnings} warning(s).`);
process.exit(errors > 0 ? 1 : 0);
