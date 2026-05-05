/**
 * Smoke tests for the auto-apply-approve CLI argument parser and the
 * non-browser-touching subcommands (list / show / skip / sweep / --help).
 *
 * Approve (which actually opens a browser) is exercised via the runner
 * unit tests in apps/server/src/apply-queue/approve.test.ts.
 */

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { enqueue, markStatus } from "../apps/server/src/apply-queue/queue.js";

import { main } from "./auto-apply-approve.js";

describe("auto-apply-approve CLI", () => {
  let dir: string;
  let queuePath: string;
  let policyPath: string;
  let outBuf: string;
  let errBuf: string;
  const origStdoutWrite = process.stdout.write.bind(process.stdout);
  const origStderrWrite = process.stderr.write.bind(process.stderr);

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "approve-cli-"));
    queuePath = join(dir, "queue.jsonl");
    policyPath = join(dir, "policy.yml");
    writeFileSync(policyPath, "approval_ttl_hours: 24\n", "utf-8");
    outBuf = "";
    errBuf = "";
    vi.spyOn(process.stdout, "write").mockImplementation((chunk: string | Uint8Array) => {
      outBuf += typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf-8");
      return true;
    });
    vi.spyOn(process.stderr, "write").mockImplementation((chunk: string | Uint8Array) => {
      errBuf += typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf-8");
      return true;
    });
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    process.stdout.write = origStdoutWrite;
    process.stderr.write = origStderrWrite;
  });

  function enqueueAwaiting(id: string) {
    enqueue(
      {
        id,
        jobId: `j-${id}`,
        ats: "greenhouse",
        tenant: "stripe",
        jobUrl: `https://x/${id}`,
        vault_ref: "auto-job:greenhouse-stripe",
        score: 4.7,
      },
      { filePath: queuePath },
    );
    markStatus(id, "awaiting_approval", { notes: "fill complete; snapshot at /tmp/x" }, { filePath: queuePath });
  }

  it("--help prints usage and exits 0", async () => {
    const code = await main(["--help"]);
    expect(code).toBe(0);
    expect(outBuf).toContain("Usage:");
    expect(outBuf).toContain("auto-apply-approve list");
  });

  it("no subcommand prints help and exits 2", async () => {
    const code = await main([]);
    expect(code).toBe(2);
    expect(outBuf).toContain("Usage:");
  });

  it("list with no awaiting entries prints info", async () => {
    const code = await main(["list", "--queue-path", queuePath]);
    expect(code).toBe(0);
    expect(outBuf).toContain("No entries awaiting approval");
  });

  it("list shows awaiting entries", async () => {
    enqueueAwaiting("abc");
    enqueueAwaiting("def");
    const code = await main(["list", "--queue-path", queuePath]);
    expect(code).toBe(0);
    expect(outBuf).toContain("Awaiting approval (2)");
    expect(outBuf).toContain("abc");
    expect(outBuf).toContain("def");
  });

  it("skip <id> --reason marks status skipped with reason", async () => {
    enqueueAwaiting("xyz");
    const code = await main(["skip", "xyz", "--reason", "salary too low", "--queue-path", queuePath]);
    expect(code).toBe(0);
    const { readQueue } = await import("../apps/server/src/apply-queue/queue.js");
    const projected = readQueue({ filePath: queuePath });
    expect(projected[0]?.status).toBe("skipped");
    expect(projected[0]?.notes).toContain("salary too low");
  });

  it("skip with unknown id exits 2", async () => {
    const code = await main(["skip", "nope", "--queue-path", queuePath]);
    expect(code).toBe(2);
    expect(errBuf).toContain("nope");
  });

  it("skip refuses non-awaiting entries", async () => {
    enqueueAwaiting("done");
    markStatus("done", "submitted", {}, { filePath: queuePath });
    const code = await main(["skip", "done", "--queue-path", queuePath]);
    expect(code).toBe(2);
    expect(errBuf).toContain("submitted");
  });

  it("sweep prints summary line", async () => {
    enqueueAwaiting("aged");
    const code = await main(["sweep", "--queue-path", queuePath, "--policy-path", policyPath]);
    expect(code).toBe(0);
    expect(outBuf).toMatch(/swept \d+ entries, expired \d+/);
    expect(outBuf).toContain("TTL=24h");
  });

  it("approve unknown id exits 2 without touching browser", async () => {
    const code = await main(["nope", "--queue-path", queuePath]);
    expect(code).toBe(2);
    expect(errBuf).toContain("nope");
  });

  it("approve non-awaiting entry exits 2 without touching browser", async () => {
    enqueueAwaiting("done2");
    markStatus("done2", "submitted", {}, { filePath: queuePath });
    const code = await main(["done2", "--queue-path", queuePath]);
    expect(code).toBe(2);
    expect(errBuf).toContain("submitted");
  });

  it("show with missing id exits 2", async () => {
    const code = await main(["show", "--queue-path", queuePath]);
    expect(code).toBe(2);
    expect(errBuf).toContain("missing <id>");
  });

  it("show with unknown id exits 2", async () => {
    const code = await main(["show", "nope", "--queue-path", queuePath]);
    expect(code).toBe(2);
    expect(errBuf).toContain("nope");
  });
});
