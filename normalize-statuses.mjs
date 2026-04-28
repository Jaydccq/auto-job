#!/usr/bin/env node

import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = dirname(fileURLToPath(import.meta.url));
const trackerPath = join(repoRoot, "data/applications.md");
const dryRun = process.argv.includes("--dry-run");

const CANONICAL = ["Evaluated", "Applied", "Responded", "Interview", "Offer", "Rejected", "Discarded", "SKIP"];
const ALIASES = new Map([
  ["sent", "Applied"],
  ["submitted", "Applied"],
  ["acknowledged", "Responded"],
  ["phone-screen", "Interview"],
  ["onsite", "Interview"],
  ["technical", "Interview"],
  ["final-round", "Interview"],
  ["verbal-offer", "Offer"],
  ["written-offer", "Offer"],
  ["declined-by-company", "Rejected"],
  ["withdrawn", "Discarded"],
  ["closed", "Discarded"],
  ["expired", "Discarded"],
  ["no-fit", "SKIP"],
  ["monitor", "SKIP"],
]);

function normalize(raw) {
  const stripped = raw.replace(/\*\*/g, "").trim();
  if (stripped === "" || stripped === "-" || stripped === "—") {
    return { status: "Discarded" };
  }
  if (/^repost/i.test(stripped) || /^dup/i.test(stripped)) {
    return { status: "Discarded", note: stripped };
  }
  const lower = stripped.toLowerCase();
  for (const c of CANONICAL) {
    if (lower === c.toLowerCase()) return { status: c };
  }
  if (ALIASES.has(lower)) return { status: ALIASES.get(lower) };
  return { status: null, unknown: true };
}

if (!existsSync(trackerPath)) {
  console.log("data/applications.md not found — nothing to normalize.");
  process.exit(0);
}

const lines = readFileSync(trackerPath, "utf-8").split("\n");
let changes = 0;
const unknowns = [];

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  if (!line.startsWith("|")) continue;
  const cols = line.split("|").map((c) => c.trim());
  if (cols.length < 9) continue;
  const num = Number.parseInt(cols[1], 10);
  if (Number.isNaN(num) || num <= 0) continue;

  const rawStatus = cols[6];
  const result = normalize(rawStatus);
  if (result.unknown) {
    unknowns.push({ num, rawStatus, line: i + 1 });
    continue;
  }
  if (result.status === rawStatus && !result.note) continue;

  cols[6] = result.status;
  if (result.note) {
    const existingNote = cols[9] ?? "";
    cols[9] = existingNote.includes(result.note)
      ? existingNote
      : (existingNote ? `${result.note}. ${existingNote}` : result.note);
  }
  cols[5] = (cols[5] ?? "").replace(/\*\*/g, "");
  lines[i] = `| ${cols.slice(1, -1).join(" | ")} |`;
  changes++;
  console.log(`#${num}: "${rawStatus}" → "${result.status}"`);
}

if (unknowns.length > 0) {
  console.log(`\nUnknown statuses (${unknowns.length}):`);
  for (const u of unknowns) {
    console.log(`  #${u.num} (line ${u.line}): "${u.rawStatus}"`);
  }
}

console.log(`\n${changes} status fields normalized.`);

if (!dryRun && changes > 0) {
  copyFileSync(trackerPath, `${trackerPath}.bak`);
  writeFileSync(trackerPath, lines.join("\n"));
  console.log(`Wrote ${trackerPath} (backup: ${trackerPath}.bak)`);
} else if (dryRun) {
  console.log("(dry-run — nothing written)");
}

process.exit(unknowns.length > 0 ? 1 : 0);
