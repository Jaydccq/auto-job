import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { enqueue, readQueue } from "./queue.js";

// Mock @auto-job/auto-apply so we control runApplyFlow's outcome per test.
vi.mock("@auto-job/auto-apply", async () => {
  const actual = await vi.importActual<typeof import("@auto-job/auto-apply")>("@auto-job/auto-apply");
  return {
    ...actual,
    runApplyFlow: vi.fn(),
  };
});

import { runApplyFlow, DetectionSignalError, FormFillError } from "@auto-job/auto-apply";
import { processNextApplyEntry } from "./runner.js";

const fakeController = {} as Parameters<typeof processNextApplyEntry>[0];

describe("processNextApplyEntry", () => {
  let dir: string;
  let queuePath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "runner-test-"));
    queuePath = join(dir, "queue.jsonl");
    vi.mocked(runApplyFlow).mockReset();
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function enqueueOne() {
    return enqueue(
      {
        id: "abc",
        jobId: "j1",
        ats: "greenhouse",
        tenant: "stripe",
        jobUrl: "https://boards.greenhouse.io/stripe/jobs/123",
        vault_ref: "auto-job:greenhouse-stripe",
        score: 4.7,
      },
      { filePath: queuePath },
    );
  }

  it("returns processed:false when no ready entries", async () => {
    const r = await processNextApplyEntry(fakeController, { queuePath });
    expect(r.processed).toBe(false);
  });

  it("on success: marks status succeeded with snapshot path in notes", async () => {
    enqueueOne();
    vi.mocked(runApplyFlow).mockResolvedValue({
      fill: {
        fieldsFilled: 7,
        fieldsMissing: [],
        fieldsSkipped: [],
        reviewSnapshotPath: "/tmp/snap-abc",
        filledAt: new Date().toISOString(),
      },
    });
    const r = await processNextApplyEntry(fakeController, { queuePath });
    expect(r.outcome).toBe("succeeded");
    const projected = readQueue({ filePath: queuePath });
    expect(projected[0]?.status).toBe("succeeded");
    expect(projected[0]?.notes).toContain("/tmp/snap-abc");
  });

  it("on FormFillError: marks status failed", async () => {
    enqueueOne();
    vi.mocked(runApplyFlow).mockRejectedValue(
      new FormFillError("selector missed", "greenhouse", "email"),
    );
    const r = await processNextApplyEntry(fakeController, { queuePath });
    expect(r.outcome).toBe("failed");
    const projected = readQueue({ filePath: queuePath });
    expect(projected[0]?.status).toBe("failed");
    expect(projected[0]?.notes).toContain("email");
  });

  it("on DetectionSignalError: marks status detected (triggers cooldown)", async () => {
    enqueueOne();
    vi.mocked(runApplyFlow).mockRejectedValue(
      new DetectionSignalError("captcha appeared on apply page", "greenhouse", "captcha"),
    );
    const r = await processNextApplyEntry(fakeController, { queuePath });
    expect(r.outcome).toBe("detected");
    const projected = readQueue({ filePath: queuePath });
    expect(projected[0]?.status).toBe("detected");
    expect(projected[0]?.notes).toContain("captcha");
  });

  it("transitions status to in_flight before calling runApplyFlow", async () => {
    enqueueOne();
    let observedStatusAtCall: string | undefined;
    vi.mocked(runApplyFlow).mockImplementation(async () => {
      observedStatusAtCall = readQueue({ filePath: queuePath })[0]?.status;
      return {
        fill: {
          fieldsFilled: 1,
          fieldsMissing: [],
          fieldsSkipped: [],
          reviewSnapshotPath: "/tmp/x",
          filledAt: new Date().toISOString(),
        },
      };
    });
    await processNextApplyEntry(fakeController, { queuePath });
    expect(observedStatusAtCall).toBe("in_flight");
  });

  it("ALWAYS passes allowSubmit:false to runApplyFlow", async () => {
    enqueueOne();
    vi.mocked(runApplyFlow).mockResolvedValue({
      fill: {
        fieldsFilled: 1,
        fieldsMissing: [],
        fieldsSkipped: [],
        reviewSnapshotPath: "/tmp/x",
        filledAt: new Date().toISOString(),
      },
    });
    await processNextApplyEntry(fakeController, { queuePath });
    const callArgs = vi.mocked(runApplyFlow).mock.calls[0];
    expect(callArgs?.[2]?.allowSubmit).toBe(false);
  });
});
