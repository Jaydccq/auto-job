import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { signupGate, type SignupHistoryEntry } from "../src/signup-gate.js";
import {
  RiskAckMissingError,
  SignupCooldownError,
  SignupQuotaExceededError,
} from "../src/errors.js";
import type { SignupQuotaPolicy } from "../src/types.js";

const VALID_ACK =
  "I, Test, acknowledge the risks documented in `docs/superpowers/specs/2026-05-04-auto-job-architecture-design.md` (sections A2, A7, Threat Model §3) on 2026-05-05.\n";

const enabledPolicy: SignupQuotaPolicy = {
  total_per_week: 5,
  per_ats_per_week: { workday: 2, greenhouse: 3 },
};

const noCooldown = () => ({ active: false as const });

describe("signupGate", () => {
  let dir: string;
  let p: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "gate-"));
    p = join(dir, "RISK_ACK.md");
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("throws RiskAckMissingError without signed file", () => {
    expect(() =>
      signupGate(
        { ats: "workday", policy: enabledPolicy, history: [] },
        { filePath: p, cooldownQuery: noCooldown },
      ),
    ).toThrow(RiskAckMissingError);
  });

  it("passes when ack valid + quota fresh + no cooldown", () => {
    writeFileSync(p, VALID_ACK);
    expect(() =>
      signupGate(
        { ats: "workday", policy: enabledPolicy, history: [] },
        { filePath: p, cooldownQuery: noCooldown },
      ),
    ).not.toThrow();
  });

  it("throws SignupQuotaExceededError when per-ATS limit reached", () => {
    writeFileSync(p, VALID_ACK);
    const recent: SignupHistoryEntry[] = [
      { ats: "workday", startedAt: new Date(Date.now() - 1 * 86400_000).toISOString(), outcome: "succeeded" },
      { ats: "workday", startedAt: new Date(Date.now() - 2 * 86400_000).toISOString(), outcome: "succeeded" },
    ];
    expect(() =>
      signupGate(
        { ats: "workday", policy: enabledPolicy, history: recent },
        { filePath: p, cooldownQuery: noCooldown },
      ),
    ).toThrow(SignupQuotaExceededError);
  });

  it("does NOT count signups older than 7 days against the weekly limit", () => {
    writeFileSync(p, VALID_ACK);
    const old: SignupHistoryEntry[] = [
      { ats: "workday", startedAt: new Date(Date.now() - 10 * 86400_000).toISOString(), outcome: "succeeded" },
      { ats: "workday", startedAt: new Date(Date.now() - 9 * 86400_000).toISOString(), outcome: "succeeded" },
    ];
    expect(() =>
      signupGate(
        { ats: "workday", policy: enabledPolicy, history: old },
        { filePath: p, cooldownQuery: noCooldown },
      ),
    ).not.toThrow();
  });

  it("throws when global weekly cap reached", () => {
    writeFileSync(p, VALID_ACK);
    const recent: SignupHistoryEntry[] = Array.from({ length: 5 }, (_, i) => ({
      ats: "greenhouse",
      startedAt: new Date(Date.now() - (i + 1) * 3600_000).toISOString(),
      outcome: "succeeded" as const,
    }));
    expect(() =>
      signupGate(
        { ats: "workday", policy: enabledPolicy, history: recent },
        { filePath: p, cooldownQuery: noCooldown },
      ),
    ).toThrow(SignupQuotaExceededError);
  });

  it("throws when per_ats_per_week is 0 (default disabled)", () => {
    writeFileSync(p, VALID_ACK);
    const policy: SignupQuotaPolicy = {
      total_per_week: 5,
      per_ats_per_week: {}, // workday not present → 0
    };
    expect(() =>
      signupGate(
        { ats: "workday", policy, history: [] },
        { filePath: p, cooldownQuery: noCooldown },
      ),
    ).toThrow(SignupQuotaExceededError);
  });

  it("throws SignupCooldownError when telemetry says ATS is in cooldown", () => {
    writeFileSync(p, VALID_ACK);
    expect(() =>
      signupGate(
        { ats: "workday", policy: enabledPolicy, history: [] },
        {
          filePath: p,
          cooldownQuery: () => ({
            active: true,
            endsAt: "2099-01-01T00:00:00Z",
            reason: "auto: captcha",
            origin: "auto",
          }),
        },
      ),
    ).toThrow(SignupCooldownError);
  });
});
