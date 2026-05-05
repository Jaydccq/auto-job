/**
 * Smoke tests for risk-dashboard CLI.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  recordCooldown,
  recordDetectionSignal,
  recordFillOutcome,
  recordScanResult,
} from "../packages/risk-telemetry/src/index.js";

import { main } from "./risk-dashboard.js";

describe("risk-dashboard CLI", () => {
  let dir: string;
  let evPath: string;
  let cdPath: string;
  let outBuf: string;
  let errBuf: string;
  const origStdout = process.stdout.write.bind(process.stdout);
  const origStderr = process.stderr.write.bind(process.stderr);

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "risk-dashboard-cli-"));
    evPath = join(dir, "events.jsonl");
    cdPath = join(dir, "cooldowns.jsonl");
    outBuf = "";
    errBuf = "";
    vi.spyOn(process.stdout, "write").mockImplementation((c: string | Uint8Array) => {
      outBuf += typeof c === "string" ? c : Buffer.from(c).toString("utf-8");
      return true;
    });
    vi.spyOn(process.stderr, "write").mockImplementation((c: string | Uint8Array) => {
      errBuf += typeof c === "string" ? c : Buffer.from(c).toString("utf-8");
      return true;
    });
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    process.stdout.write = origStdout;
    process.stderr.write = origStderr;
  });

  it("--help prints usage", async () => {
    expect(await main(["--help"])).toBe(0);
    expect(outBuf).toContain("Usage:");
  });

  it("no args → help + exit 2", async () => {
    expect(await main([])).toBe(2);
  });

  it("unknown subcommand exits 2", async () => {
    expect(await main(["nope"])).toBe(2);
    expect(errBuf).toContain("unknown subcommand");
  });

  it("summary with no events prints empty marker", async () => {
    expect(
      await main(["summary", "--events-path", evPath, "--cooldowns-path", cdPath]),
    ).toBe(0);
    expect(outBuf).toContain("(no events");
  });

  it("summary aggregates per-ATS counts", async () => {
    recordScanResult("workday", "ok", undefined, { filePath: evPath });
    recordScanResult("workday", "ok", undefined, { filePath: evPath });
    recordFillOutcome({ ats: "workday", outcome: "filled" }, { filePath: evPath });
    recordFillOutcome({ ats: "greenhouse", outcome: "filled" }, { filePath: evPath });
    recordDetectionSignal({ ats: "workday", signal: "captcha", source: "fill" }, { filePath: evPath });
    expect(
      await main(["summary", "--events-path", evPath, "--cooldowns-path", cdPath]),
    ).toBe(0);
    expect(outBuf).toContain("workday");
    expect(outBuf).toContain("greenhouse");
    // workday: 2 scans, 1 fill, 1 detect
    const wd = outBuf.split("\n").find((l) => l.includes("workday"));
    expect(wd).toContain("    2"); // scans
  });

  it("cooldowns: empty marker when none active", async () => {
    expect(await main(["cooldowns", "--cooldowns-path", cdPath])).toBe(0);
    expect(outBuf).toContain("(no active cooldowns)");
  });

  it("cooldowns: shows active entry with remaining hours", async () => {
    const now = Date.now();
    recordCooldown(
      {
        ats: "workday",
        started_at: new Date(now).toISOString(),
        ends_at: new Date(now + 24 * 3600_000).toISOString(),
        reason: "test",
        origin: "auto",
      },
      { filePath: cdPath },
    );
    expect(await main(["cooldowns", "--cooldowns-path", cdPath])).toBe(0);
    expect(outBuf).toContain("workday");
    expect(outBuf).toContain("auto");
    expect(outBuf).toContain("test");
  });

  it("force-cooldown: requires hours flag", async () => {
    expect(
      await main(["force-cooldown", "workday", "--cooldowns-path", cdPath]),
    ).toBe(2);
    expect(errBuf).toContain("usage:");
  });

  it("force-cooldown: writes manual cooldown entry", async () => {
    expect(
      await main([
        "force-cooldown",
        "workday",
        "--hours",
        "12",
        "--reason",
        "investigating signal X",
        "--cooldowns-path",
        cdPath,
      ]),
    ).toBe(0);
    expect(outBuf).toContain("force-cooldown workday until");
    // Verify it's now active.
    outBuf = "";
    await main(["cooldowns", "--cooldowns-path", cdPath]);
    expect(outBuf).toContain("manual");
    expect(outBuf).toContain("investigating signal X");
  });

  it("evaluate triggers cooldown when fresh detection event present", async () => {
    recordDetectionSignal(
      { ats: "workday", signal: "captcha", source: "fill" },
      { filePath: evPath },
    );
    expect(
      await main([
        "evaluate",
        "--events-path",
        evPath,
        "--cooldowns-path",
        cdPath,
      ]),
    ).toBe(0);
    expect(outBuf).toMatch(/triggered 1 cooldown/);
    expect(outBuf).toContain("workday");
    expect(outBuf).toContain("captcha");
  });

  it("events --ats prints filtered slice", async () => {
    recordScanResult("workday", "ok", undefined, { filePath: evPath });
    recordScanResult("greenhouse", "ok", undefined, { filePath: evPath });
    expect(
      await main(["events", "--ats", "workday", "--events-path", evPath]),
    ).toBe(0);
    expect(outBuf).toContain("ats=workday");
    expect(outBuf).not.toContain("ats=greenhouse");
  });
});
