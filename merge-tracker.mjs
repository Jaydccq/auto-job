#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = dirname(fileURLToPath(import.meta.url));
const trackerPath = join(repoRoot, "data/applications.md");
const additionsDir = join(repoRoot, "batch/tracker-additions");
const mergedDir = join(additionsDir, "merged");
const dryRun = process.argv.includes("--dry-run");
const verifyAfter = process.argv.includes("--verify");

const CANONICAL = new Set(["Evaluated", "Applied", "Responded", "Interview", "Offer", "Rejected", "Discarded", "SKIP"]);
const ADVANCED_STATUSES = new Set(["Applied", "Responded", "Interview", "Offer", "Rejected", "Discarded"]);

function canonicalStatus(raw) {
  const stripped = raw.replace(/\*\*/g, "").trim();
  for (const c of CANONICAL) {
    if (c.toLowerCase() === stripped.toLowerCase()) return c;
  }
  if (/^(dup|repost)/i.test(stripped)) return "Discarded";
  console.warn(`Non-canonical status "${raw}" → defaulting to "Evaluated".`);
  return "Evaluated";
}

function normalizeCompany(name) {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}
function rolesOverlap(a, b) {
  const wa = a.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
  const wb = b.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
  return wa.filter((w) => wb.some((x) => x.includes(w) || w.includes(x))).length >= 2;
}
function reportNumOf(reportCell) {
  const m = reportCell.match(/\[(\d+)\]/);
  return m ? Number.parseInt(m[1], 10) : null;
}
function scoreOf(value) {
  const m = (value ?? "").replace(/\*\*/g, "").match(/([\d.]+)/);
  return m ? Number.parseFloat(m[1]) : 0;
}
function cell(value) {
  return String(value ?? "").replace(/\|/g, " - ").replace(/\s+/g, " ").trim();
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
    raw: line,
  };
}

function parseAdditionFile(content, filename) {
  const trimmed = content.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith("|")) {
    const cols = trimmed.split("|").map((c) => c.trim()).filter(Boolean);
    if (cols.length < 8) {
      console.warn(`${filename}: skipped (only ${cols.length} pipe fields).`);
      return null;
    }
    return {
      num: Number.parseInt(cols[0], 10),
      date: cols[1],
      company: cols[2],
      role: cols[3],
      score: cols[4],
      status: canonicalStatus(cols[5]),
      pdf: cols[6],
      report: cols[7],
      notes: cols[8] ?? "",
    };
  }

  const cols = trimmed.split("\t");
  if (cols.length < 8) {
    console.warn(`${filename}: skipped (only ${cols.length} TSV fields).`);
    return null;
  }

  const looksLikeScore = (v) => /^\d+(?:\.\d+)?\/5$/.test(v) || v === "N/A" || v === "DUP";
  let statusCol = cols[4].trim();
  let scoreCol = cols[5].trim();
  if (looksLikeScore(statusCol) && !looksLikeScore(scoreCol)) {
    [statusCol, scoreCol] = [scoreCol, statusCol];
  }

  return {
    num: Number.parseInt(cols[0], 10),
    date: cols[1],
    company: cols[2],
    role: cols[3],
    status: canonicalStatus(statusCol),
    score: scoreCol,
    pdf: cols[6],
    report: cols[7],
    notes: cols[8] ?? "",
  };
}

function chooseStatus(existing, addition) {
  return ADVANCED_STATUSES.has(existing) ? existing : addition;
}
function choosePdf(existing, addition) {
  return existing === "✅" && addition !== "✅" ? existing : addition;
}

if (!existsSync(trackerPath)) {
  console.log("data/applications.md not found — nothing to merge into.");
  process.exit(0);
}
if (!existsSync(additionsDir)) {
  console.log("batch/tracker-additions not found — nothing to merge.");
  process.exit(0);
}

const trackerLines = readFileSync(trackerPath, "utf-8").split("\n");
const existingApps = [];
let maxNum = 0;
for (const line of trackerLines) {
  const parsed = parseTrackerLine(line);
  if (parsed) {
    existingApps.push(parsed);
    if (parsed.num > maxNum) maxNum = parsed.num;
  }
}
console.log(`Existing entries: ${existingApps.length} (max #${maxNum}).`);

const tsvFiles = readdirSync(additionsDir)
  .filter((name) => name.endsWith(".tsv"))
  .sort((a, b) => (Number.parseInt(a, 10) || 0) - (Number.parseInt(b, 10) || 0));

if (tsvFiles.length === 0) {
  console.log("No pending additions.");
  process.exit(0);
}
console.log(`Pending additions: ${tsvFiles.length}.`);

const newRows = [];
let added = 0;
let updated = 0;
let skipped = 0;

for (const file of tsvFiles) {
  const content = readFileSync(join(additionsDir, file), "utf-8");
  const addition = parseAdditionFile(content, file);
  if (!addition || Number.isNaN(addition.num) || addition.num === 0) {
    console.warn(`${file}: skipped (invalid num).`);
    skipped++;
    continue;
  }

  const additionReportNum = reportNumOf(addition.report);

  const dup =
    (additionReportNum !== null
      ? existingApps.find((app) => reportNumOf(app.report) === additionReportNum)
      : null) ??
    existingApps.find((app) => app.num === addition.num) ??
    existingApps.find(
      (app) =>
        normalizeCompany(app.company) === normalizeCompany(addition.company) &&
        rolesOverlap(app.role, addition.role),
    );

  if (dup) {
    const newScore = scoreOf(addition.score);
    const oldScore = scoreOf(dup.score);
    const dupReportNum = reportNumOf(dup.report);
    const newerReport = additionReportNum !== null && (dupReportNum === null || additionReportNum > dupReportNum);
    const replacingSkip = dup.status === "SKIP" && addition.status === "Evaluated" && newerReport;

    if (newScore > oldScore || replacingSkip) {
      const lineIdx = trackerLines.indexOf(dup.raw);
      if (lineIdx >= 0) {
        const status = chooseStatus(dup.status, addition.status);
        const pdf = choosePdf(dup.pdf, addition.pdf);
        const note = `Re-eval ${addition.date} (${oldScore}→${newScore}). ${addition.notes}`.trim();
        const newLine = `| ${dup.num} | ${cell(addition.date)} | ${cell(addition.company)} | ${cell(addition.role)} | ${cell(addition.score)} | ${cell(status)} | ${cell(pdf)} | ${cell(addition.report)} | ${cell(note)} |`;
        trackerLines[lineIdx] = newLine;
        dup.raw = newLine;
        dup.date = addition.date;
        dup.company = addition.company;
        dup.role = addition.role;
        dup.score = addition.score;
        dup.status = status;
        dup.pdf = pdf;
        dup.report = addition.report;
        dup.notes = note;
        updated++;
        console.log(`Update #${dup.num} ${addition.company} (${oldScore}→${newScore}).`);
      }
    } else {
      skipped++;
      console.log(`Skip ${addition.company} — ${addition.role} (existing #${dup.num} score ${oldScore}).`);
    }
  } else {
    const entryNum = addition.num > maxNum ? addition.num : ++maxNum;
    if (entryNum > maxNum) maxNum = entryNum;
    const newLine = `| ${entryNum} | ${cell(addition.date)} | ${cell(addition.company)} | ${cell(addition.role)} | ${cell(addition.score)} | ${cell(addition.status)} | ${cell(addition.pdf)} | ${cell(addition.report)} | ${cell(addition.notes)} |`;
    newRows.push(newLine);
    const parsedNew = parseTrackerLine(newLine);
    if (parsedNew) existingApps.push(parsedNew);
    added++;
    console.log(`Add #${entryNum} ${addition.company} — ${addition.role}.`);
  }
}

if (newRows.length > 0) {
  const headerSepIdx = trackerLines.findIndex((l) => l.startsWith("|") && l.includes("---"));
  if (headerSepIdx >= 0) {
    trackerLines.splice(headerSepIdx + 1, 0, ...newRows);
  }
}

if (!dryRun) {
  writeFileSync(trackerPath, trackerLines.join("\n"));
  if (!existsSync(mergedDir)) mkdirSync(mergedDir, { recursive: true });
  for (const file of tsvFiles) {
    renameSync(join(additionsDir, file), join(mergedDir, file));
  }
  console.log(`\nMoved ${tsvFiles.length} TSVs into batch/tracker-additions/merged/.`);
}

console.log(`Summary: +${added} added, ${updated} updated, ${skipped} skipped.`);
if (dryRun) console.log("(dry-run — nothing written)");

if (verifyAfter && !dryRun) {
  console.log("\nRunning verify-pipeline.mjs ...");
  execFileSync("node", [join(repoRoot, "verify-pipeline.mjs")], { stdio: "inherit" });
}
