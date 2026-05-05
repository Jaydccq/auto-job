import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { enqueue, markStatus, readQueue } from "./queue.js";

// Mocks declared via vi.hoisted so they exist before vi.mock factories run.
const mocks = vi.hoisted(() => {
  const submitMock = vi.fn();
  const fillFormMock = vi.fn().mockResolvedValue({
    fieldsFilled: 1,
    fieldsMissing: [],
    fieldsSkipped: [],
  });
  const identifyFormMock = vi.fn().mockResolvedValue({
    standardFields: {},
    unknownFields: [],
    pageUrl: "https://x",
  });
  return {
    submitMock,
    fillFormMock,
    identifyFormMock,
    runApplyFlowMock: vi.fn(),
  };
});

vi.mock("@auto-job/auto-apply", async () => {
  const actual = await vi.importActual<typeof import("@auto-job/auto-apply")>("@auto-job/auto-apply");
  return {
    ...actual,
    runApplyFlow: mocks.runApplyFlowMock,
    applyFlowFor: () => ({
      ats: "greenhouse",
      detectsUrl: () => true,
      identifyForm: mocks.identifyFormMock,
      fillForm: mocks.fillFormMock,
      submit: mocks.submitMock,
    }),
    loadApplicationData: () => ({
      name: { first: "x", last: "y" },
      email: "x@y.z",
      phone: "555",
      location: { city: "c" },
      links: {},
      resumePath: "/dev/null",
      workAuthorization: "us_citizen" as const,
      requiresSponsorship: false,
    }),
  };
});

vi.mock("@auto-job/humanize", async () => ({
  humanize: (tab: unknown) => tab,
}));

import { DetectionSignalError } from "@auto-job/auto-apply";

import { processApprovedEntry } from "./runner.js";
import { EntryNotApprovableError } from "./errors.js";

const fakeTab = {
  url: "https://x",
  close: vi.fn(async () => undefined),
};
const fakeController = {
  openTab: vi.fn(async () => fakeTab),
} as unknown as Parameters<typeof processApprovedEntry>[0];

describe("processApprovedEntry", () => {
  let dir: string;
  let queuePath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "approve-test-"));
    queuePath = join(dir, "queue.jsonl");
    mocks.runApplyFlowMock.mockReset();
    mocks.submitMock.mockReset();
    (fakeController.openTab as ReturnType<typeof vi.fn>).mockClear();
    fakeTab.close.mockClear();
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function enqueueAwaiting(id: string) {
    enqueue(
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
    markStatus(id, "awaiting_approval", {}, { filePath: queuePath });
  }

  it("throws EntryNotApprovableError for missing id", async () => {
    await expect(
      processApprovedEntry(fakeController, "nope", { queuePath }),
    ).rejects.toBeInstanceOf(EntryNotApprovableError);
  });

  it("throws EntryNotApprovableError when status is not awaiting_approval", async () => {
    enqueue(
      {
        id: "x",
        jobId: "j",
        ats: "greenhouse",
        tenant: "y",
        jobUrl: "https://x",
        vault_ref: "auto-job:greenhouse-y",
        score: 4.0,
      },
      { filePath: queuePath },
    );
    await expect(
      processApprovedEntry(fakeController, "x", { queuePath }),
    ).rejects.toThrow(/awaiting_approval/);
  });

  it("calls submit with allowSubmit:true exactly once on happy path", async () => {
    enqueueAwaiting("ok");
    mocks.runApplyFlowMock.mockResolvedValue({
      fill: {
        fieldsFilled: 1,
        fieldsMissing: [],
        fieldsSkipped: [],
        reviewSnapshotPath: "/tmp/x",
        filledAt: new Date().toISOString(),
      },
    });
    mocks.submitMock.mockResolvedValue({
      submittedAt: "2026-05-04T12:00:00Z",
      finalUrl: "https://thanks",
      appearsSuccessful: true,
    });
    const result = await processApprovedEntry(fakeController, "ok", { queuePath });
    expect(result.outcome).toBe("submitted");
    expect(result.finalUrl).toBe("https://thanks");
    expect(mocks.submitMock).toHaveBeenCalledTimes(1);
    expect(mocks.submitMock.mock.calls[0]?.[1]).toEqual({ allowSubmit: true });
    const projected = readQueue({ filePath: queuePath });
    expect(projected[0]?.status).toBe("submitted");
    expect(projected[0]?.notes).toContain("https://thanks");
  });

  it("marks submit_failed when submit throws", async () => {
    enqueueAwaiting("oops");
    mocks.runApplyFlowMock.mockResolvedValue({
      fill: {
        fieldsFilled: 1,
        fieldsMissing: [],
        fieldsSkipped: [],
        reviewSnapshotPath: "/tmp/x",
        filledAt: new Date().toISOString(),
      },
    });
    mocks.submitMock.mockRejectedValue(new Error("network blip"));
    const result = await processApprovedEntry(fakeController, "oops", { queuePath });
    expect(result.outcome).toBe("submit_failed");
    const projected = readQueue({ filePath: queuePath });
    expect(projected[0]?.status).toBe("submit_failed");
    expect(projected[0]?.notes).toContain("network blip");
  });

  it("marks submit_failed when submit returns appearsSuccessful=false", async () => {
    enqueueAwaiting("notok");
    mocks.runApplyFlowMock.mockResolvedValue({
      fill: {
        fieldsFilled: 1,
        fieldsMissing: [],
        fieldsSkipped: [],
        reviewSnapshotPath: "/tmp/x",
        filledAt: new Date().toISOString(),
      },
    });
    mocks.submitMock.mockResolvedValue({
      submittedAt: "2026-05-04T12:00:00Z",
      finalUrl: "https://login",
      appearsSuccessful: false,
    });
    const result = await processApprovedEntry(fakeController, "notok", { queuePath });
    expect(result.outcome).toBe("submit_failed");
    expect(result.finalUrl).toBe("https://login");
  });

  it("marks detected when re-fill throws DetectionSignalError", async () => {
    enqueueAwaiting("captcha");
    mocks.runApplyFlowMock.mockRejectedValue(
      new DetectionSignalError("captcha shown", "greenhouse", "captcha"),
    );
    const result = await processApprovedEntry(fakeController, "captcha", { queuePath });
    expect(result.outcome).toBe("detected");
    expect(mocks.submitMock).not.toHaveBeenCalled();
    const projected = readQueue({ filePath: queuePath });
    expect(projected[0]?.status).toBe("detected");
  });

  it("marks detected when submit throws DetectionSignalError", async () => {
    enqueueAwaiting("subdetect");
    mocks.runApplyFlowMock.mockResolvedValue({
      fill: {
        fieldsFilled: 1,
        fieldsMissing: [],
        fieldsSkipped: [],
        reviewSnapshotPath: "/tmp/x",
        filledAt: new Date().toISOString(),
      },
    });
    mocks.submitMock.mockRejectedValue(
      new DetectionSignalError("login wall", "greenhouse", "login_redirect"),
    );
    const result = await processApprovedEntry(fakeController, "subdetect", { queuePath });
    expect(result.outcome).toBe("detected");
    const projected = readQueue({ filePath: queuePath });
    expect(projected[0]?.status).toBe("detected");
  });

  it("re-fill before submit also passes allowSubmit:false", async () => {
    enqueueAwaiting("verify");
    mocks.runApplyFlowMock.mockResolvedValue({
      fill: {
        fieldsFilled: 1,
        fieldsMissing: [],
        fieldsSkipped: [],
        reviewSnapshotPath: "/tmp/x",
        filledAt: new Date().toISOString(),
      },
    });
    mocks.submitMock.mockResolvedValue({
      submittedAt: "now",
      finalUrl: "https://thanks",
      appearsSuccessful: true,
    });
    await processApprovedEntry(fakeController, "verify", { queuePath });
    const callArgs = mocks.runApplyFlowMock.mock.calls[0];
    expect(callArgs?.[2]?.allowSubmit).toBe(false);
  });
});
