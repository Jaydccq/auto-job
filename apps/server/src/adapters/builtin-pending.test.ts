import { afterEach, describe, expect, test } from "vitest";

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { readBuiltInPendingEntries } from "./builtin-pending.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("readBuiltInPendingEntries", () => {
  test("reads legacy Built In pipe rows and skips tracked, checked, evaluated, and duplicate rows", () => {
    const repoRoot = makeRepoRoot();
    mkdirSync(join(repoRoot, "reports"), { recursive: true });
    writeFileSync(
      join(repoRoot, "data/pipeline.md"),
      [
        "# Pipeline Inbox",
        "",
        "- [ ] https://builtin.com/job/full-stack-engineer/111?utm_source=scan | Fresh Co | Full Stack Engineer",
        "- [ ] https://example.com/job/222 | External Co | Software Engineer",
        "- [x] https://builtin.com/job/done-role/333 | Checked Co | Software Engineer",
        "- [ ] https://builtin.com/job/tracked-role/444 | Tracker Co | Backend Engineer",
        "- [ ] https://builtin.com/job/evaluated-role/555?utm_campaign=scan | Evaluated Co | Platform Engineer",
        "- [ ] https://builtin.com/job/evaluated-role-copy/556 | Evaluated Co | Platform Engineer",
        "- [ ] https://builtin.com/job/duplicate-role/666 | Fresh Co | Full Stack Engineer",
      ].join("\n"),
      "utf-8",
    );
    writeFileSync(
      join(repoRoot, "data/applications.md"),
      [
        "# Career-Ops Applications Tracker",
        "",
        "| # | Date | Company | Role | Score | Status | PDF | Report | Notes |",
        "|---|------|---------|------|-------|--------|-----|--------|-------|",
        "| 1 | 2026-04-21 | Tracker Co | Backend Engineer | 3.5/5 | Evaluated | x | [001](reports/001.md) | done |",
      ].join("\n"),
      "utf-8",
    );
    writeFileSync(
      join(repoRoot, "reports/001-evaluated-2026-04-21.md"),
      [
        "# Evaluation: Evaluated Co - Platform Engineer",
        "",
        "**Score:** 3.7/5",
        "**URL:** https://builtin.com/job/evaluated-role/555",
        "",
      ].join("\n"),
      "utf-8",
    );

    const result = readBuiltInPendingEntries(repoRoot, 10);

    expect(result.total).toBe(1);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]).toMatchObject({
      url: "https://builtin.com/job/full-stack-engineer/111?utm_source=scan",
      company: "Fresh Co",
      role: "Full Stack Engineer",
      source: "builtin.com",
      lineNumber: 3,
    });
  });

  test("honors display limit while preserving total", () => {
    const repoRoot = makeRepoRoot();
    writeFileSync(
      join(repoRoot, "data/pipeline.md"),
      [
        "- [ ] https://builtin.com/job/one/111 | One Co | Software Engineer",
        "- [ ] https://builtin.com/job/two/222 | Two Co | Backend Engineer",
      ].join("\n"),
      "utf-8",
    );

    const result = readBuiltInPendingEntries(repoRoot, 1);

    expect(result.total).toBe(2);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]!.company).toBe("One Co");
  });

  test("reads rich builtin-scan metadata rows", () => {
    const repoRoot = makeRepoRoot();
    writeFileSync(
      join(repoRoot, "data/pipeline.md"),
      "- [ ] https://builtin.com/job/software-engineer/123 — BuiltIn Co | Software Engineer I (via builtin-scan, score: 6/9, value: 7.5/10) [value-reasons:good_title|salary_meets_minimum]\n",
      "utf-8",
    );

    const result = readBuiltInPendingEntries(repoRoot, 10);

    expect(result.total).toBe(1);
    expect(result.entries[0]).toMatchObject({
      url: "https://builtin.com/job/software-engineer/123",
      company: "BuiltIn Co",
      role: "Software Engineer I",
      source: "builtin.com",
      score: 6,
      valueScore: 7.5,
      valueReasons: ["good_title", "salary_meets_minimum"],
    });
  });

  test("skips rows matching configured negative keywords", () => {
    const repoRoot = makeRepoRoot();
    writeFileSync(
      join(repoRoot, "portals.yml"),
      [
        "title_filter:",
        "  negative:",
        '    - "Senior"',
        "",
      ].join("\n"),
      "utf-8",
    );
    writeFileSync(
      join(repoRoot, "data/pipeline.md"),
      [
        "- [ ] https://builtin.com/job/senior/111 | Senior Co | Senior Software Engineer",
        "- [ ] https://builtin.com/job/junior/222 | Junior Co | Software Engineer I",
      ].join("\n"),
      "utf-8",
    );

    const result = readBuiltInPendingEntries(repoRoot, 10);

    expect(result.total).toBe(1);
    expect(result.entries[0]!.company).toBe("Junior Co");
  });
});

function makeRepoRoot(): string {
  const repoRoot = mkdtempSync(join(tmpdir(), "career-ops-builtin-pending-"));
  tempDirs.push(repoRoot);
  mkdirSync(join(repoRoot, "data"), { recursive: true });
  return repoRoot;
}
