/**
 * Smoke tests for auto-signup CLI argument parsing and the non-browser
 * subcommands (status, dry-run, --help).
 */

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { main } from "./auto-signup.js";

const VALID_ACK =
  "I, Test, acknowledge the risks documented in `docs/superpowers/specs/2026-05-04-auto-job-architecture-design.md` (sections A2, A7, Threat Model §3) on 2026-05-05.\n";

describe("auto-signup CLI", () => {
  let dir: string;
  let ackPath: string;
  let outBuf: string;
  let errBuf: string;
  const origStdout = process.stdout.write.bind(process.stdout);
  const origStderr = process.stderr.write.bind(process.stderr);

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "auto-signup-cli-"));
    ackPath = join(dir, "RISK_ACK.md");
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

  it("status reports RISK_ACK MISSING when file absent", async () => {
    expect(await main(["status", "--ack-path", ackPath])).toBe(0);
    expect(outBuf).toContain("MISSING");
  });

  it("status reports RISK_ACK valid when file signed", async () => {
    writeFileSync(ackPath, VALID_ACK);
    expect(await main(["status", "--ack-path", ackPath])).toBe(0);
    expect(outBuf).toContain("valid");
  });

  it("dry-run rejects without ack", async () => {
    expect(
      await main([
        "dry-run",
        "--ats",
        "workday",
        "--tenant",
        "amazon",
        "--url",
        "https://wd5.myworkdayjobs.com/x",
        "--ack-path",
        ackPath,
      ]),
    ).toBe(2);
    expect(errBuf).toContain("RISK_ACK");
  });

  it("dry-run rejects when quota is 0", async () => {
    writeFileSync(ackPath, VALID_ACK);
    expect(
      await main([
        "dry-run",
        "--ats",
        "workday",
        "--tenant",
        "amazon",
        "--url",
        "https://wd5.myworkdayjobs.com/x",
        "--ack-path",
        ackPath,
      ]),
    ).toBe(2);
    expect(errBuf).toContain("quota");
  });

  it("dry-run requires --ats / --tenant / --url", async () => {
    writeFileSync(ackPath, VALID_ACK);
    expect(await main(["dry-run", "--ack-path", ackPath])).toBe(2);
    expect(errBuf).toContain("missing required flags");
  });

  it("run with unsupported ats exits 2", async () => {
    writeFileSync(ackPath, VALID_ACK);
    expect(
      await main([
        "run",
        "--ats",
        "monster",
        "--tenant",
        "x",
        "--url",
        "https://x",
        "--ack-path",
        ackPath,
      ]),
    ).toBe(2);
    expect(errBuf).toContain("unsupported ats");
  });
});
