import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { runExpirySweep } from "./expiry.js";
import { DISABLED_POLICY } from "./policy.js";
import { enqueue, markStatus, readQueue } from "./queue.js";
import type { ApplyPolicy } from "./types.js";

function basePolicy(overrides: Partial<ApplyPolicy> = {}): ApplyPolicy {
  return { ...DISABLED_POLICY, ...overrides } as ApplyPolicy;
}

describe("runExpirySweep", () => {
  let dir: string;
  let queuePath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "expiry-test-"));
    queuePath = join(dir, "queue.jsonl");
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function enqueueOne(id: string) {
    return enqueue(
      {
        id,
        jobId: `j-${id}`,
        ats: "greenhouse",
        tenant: "stripe",
        jobUrl: `https://boards.greenhouse.io/stripe/jobs/${id}`,
        vault_ref: `auto-job:greenhouse-stripe`,
        score: 4.7,
      },
      { filePath: queuePath },
    );
  }

  it("default 24h policy expires entries past 24h", () => {
    enqueueOne("aged");
    markStatus("aged", "awaiting_approval", { notes: "fill done" }, { filePath: queuePath });
    // forward time 25h
    const now = Date.now() + 25 * 3600_000;
    const result = runExpirySweep({
      filePath: queuePath,
      policy: basePolicy({ approval_ttl_hours: 24 }),
      nowMs: now,
    });
    expect(result.expired).toBe(1);
    const projected = readQueue({ filePath: queuePath });
    expect(projected[0]?.status).toBe("expired");
    expect(projected[0]?.notes).toContain("expired after 24h");
  });

  it("ttl=0 disables expiry (no-op even on aged entries)", () => {
    enqueueOne("aged");
    markStatus("aged", "awaiting_approval", {}, { filePath: queuePath });
    const result = runExpirySweep({
      filePath: queuePath,
      policy: basePolicy({ approval_ttl_hours: 0 }),
      nowMs: Date.now() + 99 * 24 * 3600_000,
    });
    expect(result.expired).toBe(0);
    expect(readQueue({ filePath: queuePath })[0]?.status).toBe("awaiting_approval");
  });

  it("only awaiting_approval entries are touched", () => {
    enqueueOne("a");
    enqueueOne("b");
    enqueueOne("c");
    markStatus("a", "awaiting_approval", {}, { filePath: queuePath });
    markStatus("b", "submitted", {}, { filePath: queuePath });
    markStatus("c", "ready", {}, { filePath: queuePath });
    const result = runExpirySweep({
      filePath: queuePath,
      policy: basePolicy({ approval_ttl_hours: 1 }),
      nowMs: Date.now() + 10 * 3600_000,
    });
    expect(result.expired).toBe(1);
    const projected = readQueue({ filePath: queuePath });
    const byId = Object.fromEntries(projected.map((e) => [e.id, e.status]));
    expect(byId["a"]).toBe("expired");
    expect(byId["b"]).toBe("submitted");
    expect(byId["c"]).toBe("ready");
  });

  it("entries within TTL are left alone", () => {
    enqueueOne("fresh");
    markStatus("fresh", "awaiting_approval", {}, { filePath: queuePath });
    const result = runExpirySweep({
      filePath: queuePath,
      policy: basePolicy({ approval_ttl_hours: 24 }),
      nowMs: Date.now() + 3600_000, // 1h
    });
    expect(result.expired).toBe(0);
    expect(readQueue({ filePath: queuePath })[0]?.status).toBe("awaiting_approval");
  });
});
