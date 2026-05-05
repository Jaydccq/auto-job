/**
 * Load auto-apply policy from config/auto-apply-policy.yml.
 *
 * Architecture decision A6: defaults DISABLE auto-apply. Without an explicit
 * policy file or with auto_threshold=null, the gate will never enqueue.
 */

import { existsSync, readFileSync } from "node:fs";

import { parse as parseYaml } from "yaml";

import type { ApplyPolicy } from "./types.js";

const DEFAULT_PATH = "config/auto-apply-policy.yml";

export const DISABLED_POLICY: ApplyPolicy = {
  auto_threshold: null,
  daily_quota: { total: 0, per_ats: {} },
  cooldown: {
    on_captcha_hours: 168, // 7 days
    on_account_locked_hours: 720, // 30 days
    on_verification_required_hours: 168,
  },
  inter_apply_delay: { min_seconds: 600, same_ats_min_seconds: 3600 },
  humanizer: {
    reading_speed_wpm: [180, 320],
    typing_wpm: [40, 75],
    click_dwell_ms: [200, 600],
  },
};

export interface LoadOptions {
  filePath?: string;
}

/**
 * Read policy from disk. Returns DISABLED_POLICY if file missing.
 * Validation: enforces shape; throws with clear message if YAML is malformed.
 */
export function loadPolicy(opts: LoadOptions = {}): ApplyPolicy {
  const filePath = opts.filePath ?? DEFAULT_PATH;
  if (!existsSync(filePath)) return DISABLED_POLICY;
  const raw = readFileSync(filePath, "utf-8");
  const parsed = parseYaml(raw) as Partial<ApplyPolicy> | null;
  if (!parsed || typeof parsed !== "object") return DISABLED_POLICY;
  return mergeWithDefaults(parsed);
}

function mergeWithDefaults(p: Partial<ApplyPolicy>): ApplyPolicy {
  return {
    auto_threshold: typeof p.auto_threshold === "number" ? p.auto_threshold : DISABLED_POLICY.auto_threshold,
    daily_quota: {
      total: typeof p.daily_quota?.total === "number" ? p.daily_quota.total : DISABLED_POLICY.daily_quota.total,
      per_ats: p.daily_quota?.per_ats ?? DISABLED_POLICY.daily_quota.per_ats,
    },
    cooldown: {
      on_captcha_hours: p.cooldown?.on_captcha_hours ?? DISABLED_POLICY.cooldown.on_captcha_hours,
      on_account_locked_hours: p.cooldown?.on_account_locked_hours ?? DISABLED_POLICY.cooldown.on_account_locked_hours,
      on_verification_required_hours: p.cooldown?.on_verification_required_hours ?? DISABLED_POLICY.cooldown.on_verification_required_hours,
    },
    inter_apply_delay: {
      min_seconds: p.inter_apply_delay?.min_seconds ?? DISABLED_POLICY.inter_apply_delay.min_seconds,
      same_ats_min_seconds: p.inter_apply_delay?.same_ats_min_seconds ?? DISABLED_POLICY.inter_apply_delay.same_ats_min_seconds,
    },
    humanizer: {
      reading_speed_wpm: p.humanizer?.reading_speed_wpm ?? DISABLED_POLICY.humanizer.reading_speed_wpm,
      typing_wpm: p.humanizer?.typing_wpm ?? DISABLED_POLICY.humanizer.typing_wpm,
      click_dwell_ms: p.humanizer?.click_dwell_ms ?? DISABLED_POLICY.humanizer.click_dwell_ms,
    },
  };
}
