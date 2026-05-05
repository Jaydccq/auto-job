/**
 * RISK_ACK gate.
 *
 * Reads RISK_ACK.md from the repo root and validates that the literal
 * acknowledgment sentence is present. The sentence template is:
 *
 *   "I, <NAME>, acknowledge the risks documented in
 *   `docs/superpowers/specs/2026-05-04-auto-job-architecture-design.md`
 *   (sections A2, A7, Threat Model §3) on <YYYY-MM-DD>."
 *
 * Verification matches the structure but allows any name and any date in
 * ISO format — the operator's act of editing + committing the file IS the
 * acknowledgment. We don't try to enforce date freshness or signature
 * legitimacy beyond shape.
 */

import { existsSync, readFileSync } from "node:fs";

import { RiskAckMissingError } from "./errors.js";

const DEFAULT_PATH = "RISK_ACK.md";

const ACK_PATTERN =
  /I,\s*([^,]+?),\s*acknowledge the risks documented in `docs\/superpowers\/specs\/2026-05-04-auto-job-architecture-design\.md`\s*\(sections A2, A7, Threat Model §3\)\s*on\s*(\d{4}-\d{2}-\d{2})\./;

export interface RiskAckOptions {
  filePath?: string;
}

export interface RiskAckInfo {
  signedBy: string;
  signedOn: string;
}

/**
 * Validates RISK_ACK.md. Throws RiskAckMissingError if the file is absent
 * or doesn't contain the required sentence; returns parsed name + date on
 * success.
 */
export function verifyRiskAck(opts: RiskAckOptions = {}): RiskAckInfo {
  const filePath = opts.filePath ?? DEFAULT_PATH;
  if (!existsSync(filePath)) {
    throw new RiskAckMissingError(filePath, "file not found");
  }
  const raw = readFileSync(filePath, "utf-8");
  const m = raw.match(ACK_PATTERN);
  if (!m) {
    throw new RiskAckMissingError(filePath, "required acknowledgment sentence not found");
  }
  return { signedBy: m[1]!.trim(), signedOn: m[2]! };
}

/** Convenience predicate; never throws. */
export function hasValidRiskAck(opts: RiskAckOptions = {}): boolean {
  try {
    verifyRiskAck(opts);
    return true;
  } catch {
    return false;
  }
}
