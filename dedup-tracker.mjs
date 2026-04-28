#!/usr/bin/env node

import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = dirname(fileURLToPath(import.meta.url));
const trackerPath = join(repoRoot, "data/applications.md");
const dryRun = process.argv.includes("--dry-run");

const STATUS_RANK = {
  skip: 0,
  discarded: 0,
  rejected: 1,
  evaluated: 2,
  applied: 3,
  responded: 4,
  interview: 5,
  offer: 6,
};

const ROLE_NOISE = new Set([
  "senior", "junior", "lead", "staff", "principal", "head", "chief",
  "manager", "director", "associate", "intern", "contractor",
  "remote", "hybrid", "onsite", "engineer", "engineering",
]);
const LOCATION_NOISE = new Set([
  "tokyo", "japan", "london", "berlin", "paris", "singapore",
  "york", "francisco", "angeles", "seattle", "austin", "boston",
  "chicago", "denver", "toronto", "amsterdam", "dublin", "sydney",
  "remote", "global", "emea", "apac", "latam",
]);

function normalizeCompany(name) {
  return name
    .toLowerCase()
    .replace(/[()]/g, "")
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function roleSignature(role) {
  return role
    .toLowerCase()
    .replace(/[()]/g, " ")
    .replace(/[^a-z0-9 /]/g, "")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !ROLE_NOISE.has(w) && !LOCATION_NOISE.has(w));
}

function rolesAreSame(a, b) {
  const sa = roleSignature(a);
  const sb = roleSignature(b);
  if (sa.length === 0 || sb.length === 0) return false;
  const overlap = sa.filter((w) => sb.includes(w));
  const ratio = overlap.length / Math.min(sa.length, sb.length);
  return overlap.length >= 2 && ratio >= 0.6;
}

function parseScore(value) {
  const m = value.replace(/\*\*/g, "").match(/([\d.]+)/);
  return m ? Number.parseFloat(m[1]) : 0;
}

function parseTrackerLine(line) {
  if (!line.startsWith("|")) return null;
  const cols = line.split("|").map((c) => c.trim());
  if (cols.length < 9) return null;
  const num = Number.parseInt(cols[1], 10);
  if (Number.isNaN(num) || num <= 0) return null;
  return {
    num,
    date: cols[2],
    company: cols[3],
    role: cols[4],
    score: cols[5],
    status: cols[6],
    pdf: cols[7],
    report: cols[8],
    notes: cols[9] ?? "",
  };
}

if (!existsSync(trackerPath)) {
  console.log("data/applications.md not found — nothing to dedup.");
  process.exit(0);
}

const lines = readFileSync(trackerPath, "utf-8").split("\n");
const entries = [];
const lineIndexByNum = new Map();

for (let i = 0; i < lines.length; i++) {
  const parsed = parseTrackerLine(lines[i]);
  if (parsed) {
    entries.push(parsed);
    lineIndexByNum.set(parsed.num, i);
  }
}

console.log(`Loaded ${entries.length} entries.`);

const groups = new Map();
for (const entry of entries) {
  const key = normalizeCompany(entry.company);
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(entry);
}

let removed = 0;
const linesToDrop = new Set();

for (const cluster of groups.values()) {
  if (cluster.length < 2) continue;
  const seen = new Set();
  for (let i = 0; i < cluster.length; i++) {
    if (seen.has(i)) continue;
    const matches = [cluster[i]];
    seen.add(i);
    for (let j = i + 1; j < cluster.length; j++) {
      if (seen.has(j)) continue;
      if (rolesAreSame(cluster[i].role, cluster[j].role)) {
        matches.push(cluster[j]);
        seen.add(j);
      }
    }
    if (matches.length < 2) continue;

    matches.sort((a, b) => parseScore(b.score) - parseScore(a.score));
    const keeper = matches[0];

    let bestStatus = keeper.status;
    let bestRank = STATUS_RANK[keeper.status.toLowerCase()] ?? 0;
    for (const m of matches.slice(1)) {
      const rank = STATUS_RANK[m.status.toLowerCase()] ?? 0;
      if (rank > bestRank) {
        bestStatus = m.status;
        bestRank = rank;
      }
    }
    if (bestStatus !== keeper.status) {
      const lineIdx = lineIndexByNum.get(keeper.num);
      if (lineIdx !== undefined) {
        const cols = lines[lineIdx].split("|").map((c) => c.trim());
        cols[6] = bestStatus;
        lines[lineIdx] = `| ${cols.slice(1, -1).join(" | ")} |`;
        console.log(`#${keeper.num}: status promoted to "${bestStatus}".`);
      }
    }
    for (const dup of matches.slice(1)) {
      const lineIdx = lineIndexByNum.get(dup.num);
      if (lineIdx !== undefined) {
        linesToDrop.add(lineIdx);
        removed++;
        console.log(`Drop #${dup.num} (${dup.company} — ${dup.role}); kept #${keeper.num}.`);
      }
    }
  }
}

for (const idx of [...linesToDrop].sort((a, b) => b - a)) {
  lines.splice(idx, 1);
}

console.log(`\n${removed} duplicates removed.`);

if (!dryRun && removed > 0) {
  copyFileSync(trackerPath, `${trackerPath}.bak`);
  writeFileSync(trackerPath, lines.join("\n"));
  console.log(`Wrote ${trackerPath} (backup: ${trackerPath}.bak)`);
} else if (dryRun) {
  console.log("(dry-run — nothing written)");
}
