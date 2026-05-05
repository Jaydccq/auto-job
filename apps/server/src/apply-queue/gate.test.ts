import { describe, expect, it } from "vitest";

import { DISABLED_POLICY } from "./policy.js";
import { applyGate } from "./gate.js";
import type { ApplyPolicy, ApplyQueueEntry, Evaluation } from "./types.js";

/** No-op cooldown query for tests that don't exercise telemetry. */
const noCooldown = () => ({ active: false as const });

const SAMPLE_EVAL: Evaluation = {
  jobId: "j1",
  ats: "greenhouse",
  tenant: "stripe",
  jobUrl: "https://boards.greenhouse.io/stripe/jobs/123",
  score: 4.7,
};

const ENABLED_POLICY: ApplyPolicy = {
  ...DISABLED_POLICY,
  auto_threshold: 4.5,
  daily_quota: { total: 5, per_ats: { greenhouse: 3, lever: 3, workday: 2 } },
};

describe("applyGate — disabled by default", () => {
  it("returns enqueue=false when auto_threshold is null", () => {
    const r = applyGate(SAMPLE_EVAL, DISABLED_POLICY, [], { cooldownQuery: noCooldown });
    expect(r.enqueue).toBe(false);
    expect(r.reason).toMatch(/disabled by config/);
  });
});

describe("applyGate — score threshold", () => {
  it("rejects below threshold", () => {
    const r = applyGate({ ...SAMPLE_EVAL, score: 4.0 }, ENABLED_POLICY, [], { cooldownQuery: noCooldown });
    expect(r.enqueue).toBe(false);
    expect(r.reason).toMatch(/score 4 below threshold 4\.5/);
  });

  it("accepts at threshold", () => {
    const r = applyGate({ ...SAMPLE_EVAL, score: 4.5 }, ENABLED_POLICY, [], { cooldownQuery: noCooldown });
    expect(r.enqueue).toBe(true);
  });
});

describe("applyGate — ATS support", () => {
  it("rejects unsupported ATS", () => {
    const r = applyGate({ ...SAMPLE_EVAL, ats: "monster" }, ENABLED_POLICY, [], { cooldownQuery: noCooldown });
    expect(r.enqueue).toBe(false);
    expect(r.reason).toMatch(/monster not in supported list/);
  });

  it("uses opts.supportedAts override when provided", () => {
    const r = applyGate(
      { ...SAMPLE_EVAL, ats: "monster" },
      { ...ENABLED_POLICY, daily_quota: { total: 5, per_ats: { monster: 3 } } },
      [],
      { supportedAts: ["monster"], cooldownQuery: noCooldown },
    );
    expect(r.enqueue).toBe(true);
  });
});

describe("applyGate — daily quota", () => {
  it("rejects when per-ATS quota reached", () => {
    const queue: ApplyQueueEntry[] = Array.from({ length: 3 }, (_, i) =>
      makeEntry(`x${i}`, "greenhouse", "in_flight"),
    );
    const r = applyGate(SAMPLE_EVAL, ENABLED_POLICY, queue, { cooldownQuery: noCooldown });
    expect(r.enqueue).toBe(false);
    expect(r.reason).toMatch(/quota for greenhouse \(3\) already reached/);
  });

  it("rejects when global daily quota reached", () => {
    // Per-ATS allows greenhouse=3 and we have 2 greenhouse + 3 lever = 5 total
    const policy: ApplyPolicy = {
      ...ENABLED_POLICY,
      daily_quota: { total: 5, per_ats: { greenhouse: 3, lever: 3 } },
    };
    const queue: ApplyQueueEntry[] = [
      makeEntry("g1", "greenhouse", "in_flight"),
      makeEntry("g2", "greenhouse", "succeeded"),
      makeEntry("l1", "lever", "in_flight"),
      makeEntry("l2", "lever", "ready"),
      makeEntry("l3", "lever", "succeeded"),
    ];
    const r = applyGate(SAMPLE_EVAL, policy, queue, { cooldownQuery: noCooldown });
    expect(r.enqueue).toBe(false);
    expect(r.reason).toMatch(/global daily quota \(5\) already reached/);
  });

  it("does NOT count yesterday's entries against today's quota", () => {
    const yesterday = new Date(Date.now() - 25 * 3600_000).toISOString();
    const queue: ApplyQueueEntry[] = Array.from({ length: 3 }, (_, i) => ({
      ...makeEntry(`old${i}`, "greenhouse", "succeeded"),
      queued_at: yesterday,
    }));
    const r = applyGate(SAMPLE_EVAL, ENABLED_POLICY, queue, { cooldownQuery: noCooldown });
    expect(r.enqueue).toBe(true);
  });

  it("rejects when per-ATS quota for the target ATS is 0 (disabled)", () => {
    const policy: ApplyPolicy = {
      ...ENABLED_POLICY,
      daily_quota: { total: 5, per_ats: {} }, // greenhouse not in map → 0
    };
    const r = applyGate(SAMPLE_EVAL, policy, [], { cooldownQuery: noCooldown });
    expect(r.enqueue).toBe(false);
    expect(r.reason).toMatch(/quota for greenhouse is 0 \(disabled\)/);
  });
});

describe("applyGate — cooldown (queue-projection fallback)", () => {
  it("rejects when ATS has recent detection within cooldown window", () => {
    const recent = new Date(Date.now() - 3600_000).toISOString(); // 1h ago
    const queue: ApplyQueueEntry[] = [
      { ...makeEntry("d1", "greenhouse", "detected"), status_at: recent },
    ];
    const r = applyGate(SAMPLE_EVAL, ENABLED_POLICY, queue, { cooldownQuery: noCooldown });
    expect(r.enqueue).toBe(false);
    expect(r.reason).toMatch(/in cooldown until/);
  });

  it("does NOT block when detection is older than cooldown window", () => {
    const oldDetection = new Date(Date.now() - 8 * 24 * 3600_000).toISOString(); // 8d ago
    const queue: ApplyQueueEntry[] = [
      { ...makeEntry("d1", "greenhouse", "detected"), status_at: oldDetection },
    ];
    const r = applyGate(SAMPLE_EVAL, ENABLED_POLICY, queue, { cooldownQuery: noCooldown });
    expect(r.enqueue).toBe(true);
  });
});

describe("applyGate — cooldown (telemetry-driven)", () => {
  it("rejects when telemetry reports the ATS in cooldown", () => {
    const r = applyGate(SAMPLE_EVAL, ENABLED_POLICY, [], {
      cooldownQuery: () => ({
        active: true,
        endsAt: "2099-01-01T00:00:00Z",
        reason: "auto: captcha (1 hit in 24h)",
        origin: "auto",
      }),
    });
    expect(r.enqueue).toBe(false);
    expect(r.reason).toMatch(/in cooldown until 2099-01-01T00:00:00Z/);
    expect(r.reason).toMatch(/captcha/);
  });

  it("queue-projection still applies when telemetry returns inactive", () => {
    const recent = new Date(Date.now() - 3600_000).toISOString();
    const queue: ApplyQueueEntry[] = [
      { ...makeEntry("d1", "greenhouse", "detected"), status_at: recent },
    ];
    const r = applyGate(SAMPLE_EVAL, ENABLED_POLICY, queue, {
      cooldownQuery: () => ({ active: false }),
    });
    expect(r.enqueue).toBe(false);
  });
});

function makeEntry(id: string, ats: string, status: ApplyQueueEntry["status"]): ApplyQueueEntry {
  const now = new Date().toISOString();
  return {
    id,
    jobId: `j-${id}`,
    ats,
    tenant: "x",
    jobUrl: "",
    vault_ref: `auto-job:${ats}-x`,
    score: 5,
    queued_at: now,
    status,
    status_at: now,
    attempts: 0,
  };
}
