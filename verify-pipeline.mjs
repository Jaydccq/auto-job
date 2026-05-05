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

function runNpmStep(label, cwd, args, env = undefined) {
  try {
    execFileSync(process.platform === "win32" ? "npm.cmd" : "npm", args, {
      cwd, stdio: "pipe", encoding: "utf-8",
      env: env ? { ...process.env, ...env } : undefined,
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

function checkSubmitGateSingleCallSite() {
  // Production .ts files only (skip tests, dist, node_modules, openspec/, scripts test files).
  const grepRoots = [
    join(repoRoot, "apps/server/src"),
    join(repoRoot, "packages"),
    join(repoRoot, "scripts"),
  ].filter((p) => existsSync(p));
  let raw;
  try {
    raw = execFileSync(
      "grep",
      [
        "-rn",
        "--include=*.ts",
        "--exclude=*.test.ts",
        "--exclude-dir=node_modules",
        "--exclude-dir=dist",
        "allowSubmit: true",
        ...grepRoots,
      ],
      { encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"] },
    );
  } catch (e) {
    // grep exit 1 means no matches — fail because we expect the runner to match.
    raw = e?.stdout ?? "";
  }
  const matches = raw.split("\n").filter(Boolean);
  // The expected single production call site:
  const expectedFile = "apps/server/src/apply-queue/runner.ts";
  const expectedMatches = matches.filter((m) => m.includes(expectedFile));
  const otherMatches = matches.filter((m) => !m.includes(expectedFile));
  if (expectedMatches.length === 0) {
    log.err(`submit-gate guard: expected at least one \`allowSubmit: true\` in ${expectedFile}`);
    return;
  }
  if (otherMatches.length > 0) {
    log.err(
      `submit-gate guard: \`allowSubmit: true\` found outside ${expectedFile}:\n  ${otherMatches.join("\n  ")}`,
    );
    return;
  }
  log.ok(`submit-gate guard: only ${expectedFile} sets allowSubmit:true (${expectedMatches.length} call site(s))`);
}

console.log("\nChecking workspaces.\n");
runNpmStep("repo ownership guard", repoRoot, ["run", "verify:repo-guard"]);
runNpmStep("skill mirrors", repoRoot, ["run", "verify:skills"]);
if (existsSync(join(repoRoot, "apps/server/package.json"))) {
  runNpmStep("server tests", join(repoRoot, "apps/server"), ["run", "test"]);
  runNpmStep("server typecheck", join(repoRoot, "apps/server"), ["run", "typecheck"]);
}
if (existsSync(join(repoRoot, "apps/extension/package.json"))) {
  runNpmStep("extension typecheck", join(repoRoot, "apps/extension"), ["run", "typecheck"]);
  runNpmStep("extension build", join(repoRoot, "apps/extension"), ["run", "build"]);
}
if (existsSync(join(repoRoot, "packages/browser/package.json"))) {
  runNpmStep("browser typecheck", join(repoRoot, "packages/browser"), ["run", "typecheck"]);
  // Skip the integration test (needs real Chrome and a clean port 47322).
  // Run it explicitly via `npm --prefix packages/browser run test` when
  // exercising the full BrowserController lifecycle.
  runNpmStep(
    "browser tests (unit)",
    join(repoRoot, "packages/browser"),
    ["run", "test"],
    { SKIP_BROWSER_INTEGRATION: "1" },
  );
}
if (existsSync(join(repoRoot, "packages/humanize/package.json"))) {
  runNpmStep("humanize typecheck", join(repoRoot, "packages/humanize"), ["run", "typecheck"]);
  runNpmStep("humanize tests", join(repoRoot, "packages/humanize"), ["run", "test"]);
}
if (existsSync(join(repoRoot, "packages/credentials/package.json"))) {
  runNpmStep("credentials typecheck", join(repoRoot, "packages/credentials"), ["run", "typecheck"]);
  // KEYCHAIN_INTEGRATION=0 → only mocked tests run; real Keychain not touched.
  runNpmStep("credentials tests", join(repoRoot, "packages/credentials"), ["run", "test"], { KEYCHAIN_INTEGRATION: "0" });
}
if (existsSync(join(repoRoot, "packages/auto-apply/package.json"))) {
  runNpmStep("auto-apply typecheck", join(repoRoot, "packages/auto-apply"), ["run", "typecheck"]);
  runNpmStep("auto-apply tests", join(repoRoot, "packages/auto-apply"), ["run", "test"]);
}
if (existsSync(join(repoRoot, "packages/email-bot/package.json"))) {
  runNpmStep("email-bot typecheck", join(repoRoot, "packages/email-bot"), ["run", "typecheck"]);
  runNpmStep("email-bot tests", join(repoRoot, "packages/email-bot"), ["run", "test"]);
}

// Phase 2C — submit-gate guard. The literal `allowSubmit: true` should appear
// in production code in exactly one place: processApprovedEntry. Spec, tests,
// and tasks files are allowed to mention it.
checkSubmitGateSingleCallSite();

console.log(`\n${"=".repeat(50)}`);
console.log(`Result: ${errors} error(s), ${warnings} warning(s).`);
process.exit(errors > 0 ? 1 : 0);
