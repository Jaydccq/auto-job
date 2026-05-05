/**
 * Per-ATS cooldown registry.
 *
 * Append-only `data/risk-cooldowns.jsonl`. A cooldown is active for an ATS
 * if there exists at least one entry where `now < ends_at`.
 *
 * Cooldowns can be triggered three ways:
 *   - `recordCooldown(entry)` — explicit entry from any caller
 *   - `evaluateCooldowns(opts?)` — scans recent events; auto-triggers on
 *     fresh detection signals
 *   - manual force-cooldown CLI (writes via recordCooldown with origin:"manual")
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";

import { loadEvents } from "./events.js";
import {
  DEFAULT_SIGNAL_COOLDOWNS,
  type CooldownEntry,
  type DetectionSignal,
  type SignalCooldownConfig,
} from "./types.js";

export const DEFAULT_COOLDOWNS_PATH = "data/risk-cooldowns.jsonl";

export interface CooldownOptions {
  filePath?: string;
}

function pathFor(opts: CooldownOptions = {}): string {
  return opts.filePath ?? DEFAULT_COOLDOWNS_PATH;
}

function ensureDir(p: string): void {
  mkdirSync(dirname(p), { recursive: true });
}

export function recordCooldown(entry: CooldownEntry, opts?: CooldownOptions): CooldownEntry {
  const filePath = pathFor(opts);
  ensureDir(filePath);
  appendFileSync(filePath, JSON.stringify(entry) + "\n", { encoding: "utf-8" });
  return entry;
}

export function loadCooldowns(opts: CooldownOptions = {}): CooldownEntry[] {
  const filePath = pathFor(opts);
  if (!existsSync(filePath)) return [];
  const raw = readFileSync(filePath, "utf-8");
  const entries: CooldownEntry[] = [];
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    try {
      entries.push(JSON.parse(line) as CooldownEntry);
    } catch {
      continue;
    }
  }
  return entries;
}

export interface IsInCooldownOptions extends CooldownOptions {
  nowMs?: number;
}

export interface CooldownInfo {
  active: boolean;
  endsAt?: string;
  reason?: string;
  origin?: "auto" | "manual";
}

export function isInCooldown(ats: string, opts: IsInCooldownOptions = {}): CooldownInfo {
  const now = opts.nowMs ?? Date.now();
  const cooldowns = loadCooldowns(opts);
  const active = cooldowns.filter(
    (c) => c.ats === ats && Date.parse(c.ends_at) > now,
  );
  if (active.length === 0) return { active: false };
  // The most-recently-started active cooldown wins for the surfaced metadata.
  active.sort((a, b) => Date.parse(b.started_at) - Date.parse(a.started_at));
  const winner = active[0]!;
  return {
    active: true,
    endsAt: winner.ends_at,
    reason: winner.reason,
    origin: winner.origin,
  };
}

export interface EvaluateOptions extends CooldownOptions {
  /** Override events file. */
  eventsPath?: string;
  /** Override signal-cooldown durations. */
  signalCooldowns?: SignalCooldownConfig;
  /** "Now" override. */
  nowMs?: number;
  /** Look-back window in hours; default 24. */
  windowHours?: number;
  /**
   * Detection-count threshold per signal kind. When count >= threshold
   * within the window, evaluator records a cooldown. Default: 1 (any
   * fresh signal triggers).
   */
  threshold?: number;
}

export interface EvaluateResult {
  triggered: CooldownEntry[];
  scannedEvents: number;
}

export function evaluateCooldowns(opts: EvaluateOptions = {}): EvaluateResult {
  const now = opts.nowMs ?? Date.now();
  const windowHours = opts.windowHours ?? 24;
  const sinceMs = now - windowHours * 3600_000;
  const threshold = opts.threshold ?? 1;
  const signalCooldowns = opts.signalCooldowns ?? DEFAULT_SIGNAL_COOLDOWNS;

  const events = loadEvents({
    ...(opts.eventsPath ? { filePath: opts.eventsPath } : {}),
    sinceMs,
    kind: "detection_signal",
  });

  // Group by ats + signal.
  const counts = new Map<string, { ats: string; signal: DetectionSignal; count: number; latest: string; note: string }>();
  for (const e of events) {
    if (!e.signal) continue;
    const key = `${e.ats}::${e.signal}`;
    const cur = counts.get(key);
    if (cur) {
      cur.count += 1;
      if (e.timestamp > cur.latest) {
        cur.latest = e.timestamp;
        cur.note = e.note ?? cur.note;
      }
    } else {
      counts.set(key, {
        ats: e.ats,
        signal: e.signal,
        count: 1,
        latest: e.timestamp,
        note: e.note ?? "",
      });
    }
  }

  // For ATS already in active cooldown, skip (don't double-record).
  const triggered: CooldownEntry[] = [];
  for (const c of counts.values()) {
    if (c.count < threshold) continue;
    const status = isInCooldown(c.ats, {
      ...(opts.filePath ? { filePath: opts.filePath } : {}),
      nowMs: now,
    });
    if (status.active) continue;
    const hours = signalCooldowns[c.signal];
    if (!hours || hours <= 0) continue;
    const startedAt = new Date(now).toISOString();
    const endsAt = new Date(now + hours * 3600_000).toISOString();
    const entry: CooldownEntry = {
      ats: c.ats,
      started_at: startedAt,
      ends_at: endsAt,
      reason: `auto: ${c.signal} signal observed (${c.count} hit${c.count === 1 ? "" : "s"} in ${windowHours}h)`,
      signal: c.signal,
      origin: "auto",
    };
    recordCooldown(entry, opts.filePath ? { filePath: opts.filePath } : {});
    triggered.push(entry);
  }

  return { triggered, scannedEvents: events.length };
}

/** Cooldown durations from signal kinds. Public for callers wiring CLI. */
export function cooldownHoursForSignal(
  signal: DetectionSignal,
  cfg: SignalCooldownConfig = DEFAULT_SIGNAL_COOLDOWNS,
): number {
  return cfg[signal];
}
