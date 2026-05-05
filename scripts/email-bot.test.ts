/**
 * Smoke tests for the email-bot CLI argument parser and non-browser
 * subcommands (list / allowlist / --help / unknown).
 */

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { main } from "./email-bot.js";

describe("email-bot CLI", () => {
  let dir: string;
  let allowlistPath: string;
  let outBuf: string;
  let errBuf: string;
  const origStdout = process.stdout.write.bind(process.stdout);
  const origStderr = process.stderr.write.bind(process.stderr);

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "email-bot-cli-"));
    allowlistPath = join(dir, "allowlist.yml");
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
    const code = await main(["--help"]);
    expect(code).toBe(0);
    expect(outBuf).toContain("Usage:");
    expect(outBuf).toContain("email-bot list");
  });

  it("no args prints help and exits 2", async () => {
    const code = await main([]);
    expect(code).toBe(2);
    expect(outBuf).toContain("Usage:");
  });

  it("unknown subcommand exits 2 with error", async () => {
    const code = await main(["nope"]);
    expect(code).toBe(2);
    expect(errBuf).toContain("unknown subcommand");
  });

  it("list with no allowlist file prints opt-in instructions", async () => {
    const code = await main(["list", "--allowlist-path", allowlistPath]);
    expect(code).toBe(0);
    expect(outBuf).toContain("no allowlist configured");
  });

  it("allowlist with no file prints empty marker", async () => {
    const code = await main(["allowlist", "--allowlist-path", allowlistPath]);
    expect(code).toBe(0);
    expect(outBuf).toContain("(allowlist is empty)");
  });

  it("allowlist prints entries with auto_click flag", async () => {
    writeFileSync(
      allowlistPath,
      `hosts:\n  - host: workday.com\n    auto_click: true\n  - host: icims.com\n    auto_click: false\n`,
    );
    const code = await main(["allowlist", "--allowlist-path", allowlistPath]);
    expect(code).toBe(0);
    expect(outBuf).toContain("workday.com  auto_click=true");
    expect(outBuf).toContain("icims.com  auto_click=false");
  });

  it("list with allowlist but no auto_click hosts prints disabled message", async () => {
    writeFileSync(allowlistPath, `hosts:\n  - host: workday.com\n    auto_click: false\n`);
    const code = await main(["list", "--allowlist-path", allowlistPath]);
    expect(code).toBe(0);
    expect(outBuf).toContain("bot is disabled");
  });
});
