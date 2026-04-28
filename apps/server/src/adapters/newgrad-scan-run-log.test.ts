import { expect, test } from "vitest";

import { existsSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";

import { createScanRunRecorder } from "./newgrad-scan-run-log.js";

test("scan run recorder writes JSONL events and summary counts", () => {
  const repoRoot = `${tmpdir()}/career-ops-scan-run-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  try {
    const recorder = createScanRunRecorder({
      repoRoot,
      scanRunId: "newgrad-test-run",
      source: "newgrad-scan",
      startedAt: "2026-04-24T00:00:00.000Z",
    });

    recorder.increment("discovered", 2);
    recorder.increment("listPromoted");
    recorder.record("list_filter_passed", {
      company: "Example",
      role: "Software Engineer I",
      pageText: "must not be persisted",
      description: "must not be persisted",
    });
    const summary = recorder.finalize("completed");

    expect(existsSync(recorder.eventLogPath)).toBe(true);
    expect(existsSync(recorder.summaryPath)).toBe(true);
    expect(summary.counts.discovered).toBe(2);
    expect(summary.counts.listPromoted).toBe(1);
    expect(summary.summaryPath).toBe(recorder.summaryPath);

    const lines = readFileSync(recorder.eventLogPath, "utf-8").trim().split(/\r?\n/);
    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain("\"scan_started\"");
    expect(lines[1]).toContain("\"list_filter_passed\"");
    expect(lines[1]).not.toContain("must not be persisted");

    const summaryJson = JSON.parse(readFileSync(recorder.summaryPath, "utf-8")) as {
      counts: { discovered: number; listPromoted: number };
      status: string;
    };
    expect(summaryJson.status).toBe("completed");
    expect(summaryJson.counts.discovered).toBe(2);
  } finally {
    rmSync(repoRoot, { recursive: true, force: true });
  }
});
