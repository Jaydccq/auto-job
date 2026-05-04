import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { enqueue, markStatus, readQueue } from "./queue.js";
import type { ApplyQueueEntry } from "./types.js";

describe("apply queue persistence", () => {
  let dir: string;
  let filePath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "apply-queue-test-"));
    filePath = join(dir, "queue.jsonl");
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("enqueue appends a fully-formed entry", () => {
    const entry = enqueue(
      {
        id: "abc",
        jobId: "j1",
        ats: "greenhouse",
        tenant: "stripe",
        jobUrl: "https://boards.greenhouse.io/stripe/jobs/123",
        vault_ref: "auto-job:greenhouse-stripe",
        score: 4.7,
      },
      { filePath },
    );
    expect(entry.status).toBe("ready");
    expect(entry.queued_at).toMatch(/\d{4}-\d{2}-\d{2}T/);
    const raw = readFileSync(filePath, "utf-8");
    expect(raw.split("\n").filter(Boolean).length).toBe(1);
  });

  it("readQueue projects to current state (latest-line-wins per id)", () => {
    enqueue(
      {
        id: "abc",
        jobId: "j1",
        ats: "greenhouse",
        tenant: "stripe",
        jobUrl: "",
        vault_ref: "auto-job:greenhouse-stripe",
        score: 4.7,
      },
      { filePath },
    );
    markStatus("abc", "in_flight", {}, { filePath });
    markStatus("abc", "succeeded", { attempts: 1, notes: "first try" }, { filePath });
    const projected = readQueue({ filePath });
    expect(projected).toHaveLength(1);
    expect(projected[0]?.status).toBe("succeeded");
    expect(projected[0]?.attempts).toBe(1);
    expect(projected[0]?.notes).toBe("first try");
  });

  it("readQueue returns empty array when file missing", () => {
    expect(readQueue({ filePath: "/nonexistent/path.jsonl" })).toEqual([]);
  });

  it("multiple entries projected independently", () => {
    enqueue(makeEnqueueArgs("a", "greenhouse"), { filePath });
    enqueue(makeEnqueueArgs("b", "lever"), { filePath });
    enqueue(makeEnqueueArgs("c", "workday"), { filePath });
    markStatus("b", "succeeded", {}, { filePath });
    markStatus("a", "failed", {}, { filePath });
    const projected = readQueue({ filePath });
    expect(projected).toHaveLength(3);
    const byId = Object.fromEntries(projected.map((e) => [e.id, e.status]));
    expect(byId).toEqual({ a: "failed", b: "succeeded", c: "ready" });
  });

  it("ignores corrupt lines", () => {
    enqueue(makeEnqueueArgs("good", "greenhouse"), { filePath });
    // Write a corrupt line manually
    const fs = require("node:fs") as typeof import("node:fs");
    fs.appendFileSync(filePath, "not json at all\n");
    enqueue(makeEnqueueArgs("good2", "lever"), { filePath });
    const projected = readQueue({ filePath });
    expect(projected.map((e) => e.id).sort()).toEqual(["good", "good2"]);
  });

  it("ignores mutation lines for ids that were never enqueued", () => {
    markStatus("orphan", "succeeded", {}, { filePath });
    enqueue(makeEnqueueArgs("real", "greenhouse"), { filePath });
    const projected = readQueue({ filePath });
    expect(projected).toHaveLength(1);
    expect(projected[0]?.id).toBe("real");
  });
});

function makeEnqueueArgs(id: string, ats: string): Omit<ApplyQueueEntry, "queued_at" | "status" | "status_at" | "attempts"> {
  return {
    id,
    jobId: `j-${id}`,
    ats,
    tenant: "x",
    jobUrl: "",
    vault_ref: `auto-job:${ats}-x`,
    score: 5,
  };
}
