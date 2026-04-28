import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, expect, test } from "vitest";

const REPO_ROOT = resolve(import.meta.dirname, "../../../../");
const MERGE_TRACKER = join(REPO_ROOT, "merge-tracker.mjs");

const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function makeRepo(): string {
  const repoRoot = mkdtempSync(join(tmpdir(), "career-ops-merge-tracker-"));
  tempRoots.push(repoRoot);
  mkdirSync(join(repoRoot, "data"), { recursive: true });
  mkdirSync(join(repoRoot, "batch", "tracker-additions"), { recursive: true });
  copyFileSync(MERGE_TRACKER, join(repoRoot, "merge-tracker.mjs"));
  return repoRoot;
}

function runMerge(repoRoot: string): void {
  const result = spawnSync(process.execPath, ["merge-tracker.mjs"], {
    cwd: repoRoot,
    encoding: "utf-8",
  });

  expect(result.status, result.stderr || result.stdout).toBe(0);
}

test("newer evaluated rerun replaces older quick skip even when score is lower", () => {
  const repoRoot = makeRepo();
  writeFileSync(
    join(repoRoot, "data", "applications.md"),
    [
      "# Career-Ops Applications Tracker",
      "",
      "| # | Date | Company | Role | Score | Status | PDF | Report | Notes |",
      "|---|------|---------|------|-------|--------|-----|--------|-------|",
      "| 310 | 2026-04-23 | Association of Universities for Research in Astronomy | Software Engineer I | 3.4/5 | SKIP | ❌ | [316](reports/316-association-of-universities-for-research-in-astronomy-2026-04-23.md) | Old quick skip. |",
      "",
    ].join("\n"),
    "utf-8",
  );
  writeFileSync(
    join(repoRoot, "batch", "tracker-additions", "rerun.tsv"),
    [
      "321",
      "2026-04-24",
      "Association of Universities for Research in Astronomy",
      "Software Engineer I",
      "Evaluated",
      "3.25/5",
      "❌",
      "[334](reports/334-association-of-universities-for-research-in-astronomy-2026-04-24.md)",
      "New full evaluation.",
    ].join("\t"),
    "utf-8",
  );

  runMerge(repoRoot);

  const tracker = readFileSync(join(repoRoot, "data", "applications.md"), "utf-8");
  expect(tracker).toContain("| 310 | 2026-04-24 | Association of Universities for Research in Astronomy | Software Engineer I | 3.25/5 | Evaluated | ❌ | [334](reports/334-association-of-universities-for-research-in-astronomy-2026-04-24.md) |");
});

test("higher score duplicate uses rerun status instead of preserving stale skip", () => {
  const repoRoot = makeRepo();
  writeFileSync(
    join(repoRoot, "data", "applications.md"),
    [
      "# Career-Ops Applications Tracker",
      "",
      "| # | Date | Company | Role | Score | Status | PDF | Report | Notes |",
      "|---|------|---------|------|-------|--------|-----|--------|-------|",
      "| 320 | 2026-04-23 | Wonderschool | Early Career Software Engineer - Applied AI | 2.6/5 | SKIP | ❌ | [329](reports/329-wonderschool-2026-04-23.md) | Old quick skip. |",
      "",
    ].join("\n"),
    "utf-8",
  );
  writeFileSync(
    join(repoRoot, "batch", "tracker-additions", "rerun.tsv"),
    [
      "321",
      "2026-04-23",
      "Wonderschool",
      "Early Career Software Engineer - Applied AI",
      "Evaluada",
      "4.05/5",
      "❌",
      "[330](reports/330-wonderschool-2026-04-23.md)",
      "New full evaluation.",
    ].join("\t"),
    "utf-8",
  );

  runMerge(repoRoot);

  const tracker = readFileSync(join(repoRoot, "data", "applications.md"), "utf-8");
  expect(tracker).toContain("| 320 | 2026-04-23 | Wonderschool | Early Career Software Engineer - Applied AI | 4.05/5 | Evaluated | ❌ | [330](reports/330-wonderschool-2026-04-23.md) |");
});

test("sanitizes pipe characters before writing markdown tracker cells", () => {
  const repoRoot = makeRepo();
  writeFileSync(
    join(repoRoot, "data", "applications.md"),
    [
      "# Career-Ops Applications Tracker",
      "",
      "| # | Date | Company | Role | Score | Status | PDF | Report | Notes |",
      "|---|------|---------|------|-------|--------|-----|--------|-------|",
      "",
    ].join("\n"),
    "utf-8",
  );
  writeFileSync(
    join(repoRoot, "batch", "tracker-additions", "pipe-role.tsv"),
    [
      "321",
      "2026-04-25",
      "Loop",
      "2026 New Grad | Software Engineer, Full-Stack",
      "SKIP",
      "2.3/5",
      "❌",
      "[384](reports/384-loop-2026-04-25.md)",
      "Role title contained a pipe.",
    ].join("\t"),
    "utf-8",
  );

  runMerge(repoRoot);

  const tracker = readFileSync(join(repoRoot, "data", "applications.md"), "utf-8");
  expect(tracker).toContain("| 321 | 2026-04-25 | Loop | 2026 New Grad - Software Engineer, Full-Stack | 2.3/5 | SKIP | ❌ | [384](reports/384-loop-2026-04-25.md) |");
});
