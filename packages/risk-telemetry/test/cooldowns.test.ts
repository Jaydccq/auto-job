import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  evaluateCooldowns,
  isInCooldown,
  loadCooldowns,
  recordCooldown,
} from "../src/cooldowns.js";
import { recordDetectionSignal } from "../src/events.js";
import { DEFAULT_SIGNAL_COOLDOWNS, type SignalCooldownConfig } from "../src/types.js";

describe("cooldown registry", () => {
  let dir: string;
  let cdPath: string;
  let evPath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "cooldowns-"));
    cdPath = join(dir, "cooldowns.jsonl");
    evPath = join(dir, "events.jsonl");
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("isInCooldown returns inactive when nothing recorded", () => {
    expect(isInCooldown("workday", { filePath: cdPath }).active).toBe(false);
  });

  it("recordCooldown + isInCooldown: active when ends_at is in the future", () => {
    const now = Date.now();
    recordCooldown(
      {
        ats: "workday",
        started_at: new Date(now).toISOString(),
        ends_at: new Date(now + 3600_000).toISOString(),
        reason: "test",
        origin: "manual",
      },
      { filePath: cdPath },
    );
    const status = isInCooldown("workday", { filePath: cdPath, nowMs: now });
    expect(status.active).toBe(true);
    expect(status.reason).toBe("test");
    expect(status.origin).toBe("manual");
  });

  it("expired cooldowns are inactive", () => {
    const now = Date.now();
    recordCooldown(
      {
        ats: "workday",
        started_at: new Date(now - 10 * 3600_000).toISOString(),
        ends_at: new Date(now - 3600_000).toISOString(),
        reason: "old",
        origin: "auto",
      },
      { filePath: cdPath },
    );
    expect(isInCooldown("workday", { filePath: cdPath, nowMs: now }).active).toBe(false);
  });

  it("loadCooldowns returns all (active + expired)", () => {
    recordCooldown(
      { ats: "a", started_at: "2026-01-01T00:00:00Z", ends_at: "2026-01-02T00:00:00Z", reason: "x", origin: "auto" },
      { filePath: cdPath },
    );
    recordCooldown(
      { ats: "b", started_at: "2099-01-01T00:00:00Z", ends_at: "2099-01-02T00:00:00Z", reason: "y", origin: "manual" },
      { filePath: cdPath },
    );
    expect(loadCooldowns({ filePath: cdPath })).toHaveLength(2);
  });
});

describe("evaluateCooldowns", () => {
  let dir: string;
  let cdPath: string;
  let evPath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "evaluate-"));
    cdPath = join(dir, "cooldowns.jsonl");
    evPath = join(dir, "events.jsonl");
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("triggers cooldown for fresh detection signal", () => {
    recordDetectionSignal(
      { ats: "workday", signal: "captcha", source: "fill", note: "found iframe" },
      { filePath: evPath },
    );
    const result = evaluateCooldowns({
      filePath: cdPath,
      eventsPath: evPath,
    });
    expect(result.triggered).toHaveLength(1);
    expect(result.triggered[0]?.ats).toBe("workday");
    expect(result.triggered[0]?.signal).toBe("captcha");
    expect(result.triggered[0]?.origin).toBe("auto");
  });

  it("doesn't double-trigger when ATS already in cooldown", () => {
    const now = Date.now();
    recordCooldown(
      {
        ats: "workday",
        started_at: new Date(now - 3600_000).toISOString(),
        ends_at: new Date(now + 3600_000).toISOString(),
        reason: "earlier",
        origin: "auto",
      },
      { filePath: cdPath },
    );
    recordDetectionSignal(
      { ats: "workday", signal: "captcha", source: "fill" },
      { filePath: evPath },
    );
    const result = evaluateCooldowns({
      filePath: cdPath,
      eventsPath: evPath,
      nowMs: now,
    });
    expect(result.triggered).toHaveLength(0);
  });

  it("respects threshold: count below threshold doesn't trigger", () => {
    recordDetectionSignal(
      { ats: "workday", signal: "verification_required", source: "fill" },
      { filePath: evPath },
    );
    const result = evaluateCooldowns({
      filePath: cdPath,
      eventsPath: evPath,
      threshold: 2,
    });
    expect(result.triggered).toHaveLength(0);
  });

  it("uses configured signal-cooldown durations", () => {
    recordDetectionSignal(
      { ats: "workday", signal: "captcha", source: "fill" },
      { filePath: evPath },
    );
    const cfg: SignalCooldownConfig = { ...DEFAULT_SIGNAL_COOLDOWNS, captcha: 12 };
    const now = Date.now();
    const result = evaluateCooldowns({
      filePath: cdPath,
      eventsPath: evPath,
      signalCooldowns: cfg,
      nowMs: now,
    });
    const ms = Date.parse(result.triggered[0]!.ends_at) - now;
    expect(ms).toBeGreaterThan(11.9 * 3600_000);
    expect(ms).toBeLessThan(12.1 * 3600_000);
  });

  it("zero hours disables cooldown for that signal", () => {
    recordDetectionSignal(
      { ats: "workday", signal: "silent_degradation", source: "fill" },
      { filePath: evPath },
    );
    const cfg: SignalCooldownConfig = { ...DEFAULT_SIGNAL_COOLDOWNS, silent_degradation: 0 };
    const result = evaluateCooldowns({
      filePath: cdPath,
      eventsPath: evPath,
      signalCooldowns: cfg,
    });
    expect(result.triggered).toHaveLength(0);
  });

  it("ignores events older than the window", () => {
    // Backdate by manually appending.
    require("node:fs").appendFileSync(
      evPath,
      JSON.stringify({
        timestamp: "2025-01-01T00:00:00Z",
        kind: "detection_signal",
        source: "fill",
        ats: "workday",
        signal: "captcha",
        severity: "alert",
      }) + "\n",
    );
    const result = evaluateCooldowns({
      filePath: cdPath,
      eventsPath: evPath,
      windowHours: 24,
      nowMs: Date.parse("2026-05-04T00:00:00Z"),
    });
    expect(result.triggered).toHaveLength(0);
  });
});
