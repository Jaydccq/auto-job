import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  loadEvents,
  recordEvent,
  recordDetectionSignal,
  recordFillOutcome,
  recordScanResult,
  recordSubmitOutcome,
  recordVerifyLinkOutcome,
} from "../src/events.js";

describe("event log", () => {
  let dir: string;
  let p: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "events-"));
    p = join(dir, "events.jsonl");
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("append + read round-trip preserves all fields", () => {
    recordEvent(
      {
        kind: "fill_outcome",
        source: "fill",
        ats: "greenhouse",
        tenant: "stripe",
        severity: "info",
        note: "ok",
      },
      { filePath: p },
    );
    const events = loadEvents({ filePath: p });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      kind: "fill_outcome",
      source: "fill",
      ats: "greenhouse",
      tenant: "stripe",
      severity: "info",
      note: "ok",
    });
    expect(events[0]?.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("filter by ats works", () => {
    recordScanResult("workday", "ok", "x", { filePath: p });
    recordScanResult("greenhouse", "ok", "y", { filePath: p });
    expect(loadEvents({ filePath: p, ats: "workday" })).toHaveLength(1);
    expect(loadEvents({ filePath: p, ats: "icims" })).toHaveLength(0);
  });

  it("filter by kind (single + array) works", () => {
    recordScanResult("workday", "ok", undefined, { filePath: p });
    recordFillOutcome({ ats: "workday", outcome: "filled" }, { filePath: p });
    recordSubmitOutcome({ ats: "workday", outcome: "submitted" }, { filePath: p });
    expect(loadEvents({ filePath: p, kind: "fill_outcome" })).toHaveLength(1);
    expect(loadEvents({ filePath: p, kind: ["scan_result", "submit_outcome"] })).toHaveLength(2);
  });

  it("filter by sinceMs excludes older entries", () => {
    recordEvent(
      { kind: "scan_result", source: "scan", ats: "x", severity: "info", timestamp: "2026-01-01T00:00:00Z" },
      { filePath: p },
    );
    recordEvent(
      { kind: "scan_result", source: "scan", ats: "x", severity: "info", timestamp: "2026-12-31T00:00:00Z" },
      { filePath: p },
    );
    const since = Date.parse("2026-06-01T00:00:00Z");
    const events = loadEvents({ filePath: p, sinceMs: since });
    expect(events).toHaveLength(1);
    expect(events[0]?.timestamp).toBe("2026-12-31T00:00:00Z");
  });

  it("convenience recorders set severity correctly", () => {
    recordFillOutcome({ ats: "workday", outcome: "detected", signal: "captcha" }, { filePath: p });
    recordSubmitOutcome({ ats: "workday", outcome: "submit_failed" }, { filePath: p });
    recordVerifyLinkOutcome({ ats: "workday", outcome: "succeeded" }, { filePath: p });
    recordDetectionSignal({ ats: "workday", signal: "http_403", source: "fill" }, { filePath: p });
    const events = loadEvents({ filePath: p });
    expect(events.find((e) => e.kind === "fill_outcome")?.severity).toBe("alert");
    expect(events.find((e) => e.kind === "submit_outcome")?.severity).toBe("warning");
    expect(events.find((e) => e.kind === "verify_link_outcome")?.severity).toBe("info");
    expect(events.find((e) => e.kind === "detection_signal")?.severity).toBe("alert");
  });

  it("returns empty array when file missing", () => {
    expect(loadEvents({ filePath: join(dir, "nope.jsonl") })).toEqual([]);
  });

  it("skips corrupt lines without throwing", () => {
    recordEvent({ kind: "scan_result", source: "scan", ats: "x", severity: "info" }, { filePath: p });
    require("node:fs").appendFileSync(p, "not-json\n");
    recordEvent({ kind: "scan_result", source: "scan", ats: "y", severity: "info" }, { filePath: p });
    expect(loadEvents({ filePath: p })).toHaveLength(2);
  });
});
