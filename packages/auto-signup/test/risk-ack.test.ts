import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { hasValidRiskAck, verifyRiskAck } from "../src/risk-ack.js";
import { RiskAckMissingError } from "../src/errors.js";

describe("verifyRiskAck", () => {
  let dir: string;
  let p: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "risk-ack-"));
    p = join(dir, "RISK_ACK.md");
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("throws when file is missing", () => {
    expect(() => verifyRiskAck({ filePath: p })).toThrow(RiskAckMissingError);
  });

  it("throws when sentence not present", () => {
    writeFileSync(p, "Some random content without the right sentence.\n");
    expect(() => verifyRiskAck({ filePath: p })).toThrow(/required acknowledgment sentence/);
  });

  it("parses signed-by + signed-on on success", () => {
    writeFileSync(
      p,
      "I, Hongxi Chen, acknowledge the risks documented in `docs/superpowers/specs/2026-05-04-auto-job-architecture-design.md` (sections A2, A7, Threat Model §3) on 2026-05-05.\n",
    );
    const info = verifyRiskAck({ filePath: p });
    expect(info.signedBy).toBe("Hongxi Chen");
    expect(info.signedOn).toBe("2026-05-05");
  });

  it("hasValidRiskAck returns false on missing", () => {
    expect(hasValidRiskAck({ filePath: p })).toBe(false);
  });

  it("hasValidRiskAck returns true on valid", () => {
    writeFileSync(
      p,
      "I, Test, acknowledge the risks documented in `docs/superpowers/specs/2026-05-04-auto-job-architecture-design.md` (sections A2, A7, Threat Model §3) on 2026-01-01.",
    );
    expect(hasValidRiskAck({ filePath: p })).toBe(true);
  });

  it("rejects when sections list is wrong", () => {
    writeFileSync(
      p,
      "I, X, acknowledge the risks documented in `docs/superpowers/specs/2026-05-04-auto-job-architecture-design.md` (sections WRONG) on 2026-01-01.",
    );
    expect(() => verifyRiskAck({ filePath: p })).toThrow(RiskAckMissingError);
  });
});
