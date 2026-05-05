/**
 * signupGate — pre-flight check chain for runSignupFlow.
 *
 *   1. verifyRiskAck → throws RiskAckMissingError otherwise
 *   2. quota check (per-ATS-per-week + total-per-week)
 *   3. cooldown check via @auto-job/risk-telemetry's isInCooldown
 */

import { isInCooldown, type CooldownInfo } from "@auto-job/risk-telemetry";

import {
  RiskAckMissingError,
  SignupCooldownError,
  SignupQuotaExceededError,
} from "./errors.js";
import { verifyRiskAck, type RiskAckOptions } from "./risk-ack.js";
import type { SignupQuotaPolicy } from "./types.js";

export interface GateOptions extends RiskAckOptions {
  /** Inject cooldown query; defaults to telemetry's isInCooldown. */
  cooldownQuery?: (ats: string, nowMs: number) => CooldownInfo;
  nowMs?: number;
}

export interface SignupHistoryEntry {
  ats: string;
  startedAt: string; // ISO
  outcome: "succeeded" | "failed" | "pending";
}

export interface GateInput {
  ats: string;
  policy: SignupQuotaPolicy;
  history: readonly SignupHistoryEntry[];
}

export function signupGate(input: GateInput, opts: GateOptions = {}): void {
  // Step 1 — RISK_ACK
  verifyRiskAck(opts.filePath !== undefined ? { filePath: opts.filePath } : {});

  // Step 2 — quota (per-ATS + global, both per-week from "now")
  const now = opts.nowMs ?? Date.now();
  const oneWeekAgo = now - 7 * 24 * 3600_000;
  const recent = input.history.filter((h) => Date.parse(h.startedAt) >= oneWeekAgo);
  const usedThisWeek = recent.length;
  const usedForAts = recent.filter((h) => h.ats === input.ats).length;
  const perAtsLimit = input.policy.per_ats_per_week[input.ats] ?? 0;

  if (perAtsLimit === 0) {
    throw new SignupQuotaExceededError(input.ats, 0, 0);
  }
  if (usedForAts >= perAtsLimit) {
    throw new SignupQuotaExceededError(input.ats, usedForAts, perAtsLimit);
  }
  if (input.policy.total_per_week === 0) {
    throw new SignupQuotaExceededError("<global>", 0, 0);
  }
  if (usedThisWeek >= input.policy.total_per_week) {
    throw new SignupQuotaExceededError("<global>", usedThisWeek, input.policy.total_per_week);
  }

  // Step 3 — cooldown
  const cooldownQuery =
    opts.cooldownQuery ?? ((ats: string, nowMs: number) => isInCooldown(ats, { nowMs }));
  const cd = cooldownQuery(input.ats, now);
  if (cd.active) {
    throw new SignupCooldownError(input.ats, cd.endsAt ?? "<unknown>", cd.reason ?? "cooldown active");
  }
}

export { RiskAckMissingError };
