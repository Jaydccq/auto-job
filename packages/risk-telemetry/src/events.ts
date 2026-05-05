/**
 * Append-only event log at data/risk-events.jsonl.
 *
 * Append is POSIX-atomic for single-line writes ≤ PIPE_BUF, which is enough
 * for our throughput. Reads project across all lines.
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";

import type { RiskEvent, EventKind } from "./types.js";

export const DEFAULT_EVENTS_PATH = "data/risk-events.jsonl";

export interface EventOptions {
  filePath?: string;
}

function pathFor(opts: EventOptions = {}): string {
  return opts.filePath ?? DEFAULT_EVENTS_PATH;
}

function ensureDir(p: string): void {
  mkdirSync(dirname(p), { recursive: true });
}

export function recordEvent(event: Omit<RiskEvent, "timestamp"> & { timestamp?: string }, opts?: EventOptions): RiskEvent {
  const filePath = pathFor(opts);
  ensureDir(filePath);
  const full: RiskEvent = {
    ...event,
    timestamp: event.timestamp ?? new Date().toISOString(),
  };
  appendFileSync(filePath, JSON.stringify(full) + "\n", { encoding: "utf-8" });
  return full;
}

export interface LoadFilter {
  ats?: string;
  kind?: EventKind | EventKind[];
  /** Only return events with timestamp >= sinceMs. */
  sinceMs?: number;
  /** Optional override of "now" for tests. */
  nowMs?: number;
}

export function loadEvents(opts: EventOptions & LoadFilter = {}): RiskEvent[] {
  const filePath = pathFor(opts);
  if (!existsSync(filePath)) return [];
  const raw = readFileSync(filePath, "utf-8");
  const events: RiskEvent[] = [];
  const kinds = Array.isArray(opts.kind) ? new Set(opts.kind) : opts.kind ? new Set([opts.kind]) : null;
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    let parsed: RiskEvent | null = null;
    try {
      parsed = JSON.parse(line) as RiskEvent;
    } catch {
      continue;
    }
    if (!parsed || typeof parsed.timestamp !== "string") continue;
    if (opts.ats && parsed.ats !== opts.ats) continue;
    if (kinds && !kinds.has(parsed.kind)) continue;
    if (typeof opts.sinceMs === "number" && Date.parse(parsed.timestamp) < opts.sinceMs) continue;
    events.push(parsed);
  }
  return events;
}

/** Convenience recorders for the call sites. */

export function recordScanResult(
  ats: string,
  outcome: "ok" | "error",
  note?: string,
  opts?: EventOptions,
): RiskEvent {
  const event: Omit<RiskEvent, "timestamp"> = {
    kind: "scan_result",
    source: "scan",
    ats,
    severity: outcome === "ok" ? "info" : "warning",
  };
  if (note) event.note = note;
  return recordEvent(event, opts);
}

export interface FillOutcomeOptions {
  ats: string;
  tenant?: string;
  outcome: "filled" | "fill_error" | "detected";
  signal?: import("./types.js").DetectionSignal;
  note?: string;
  snapshotDir?: string;
}

export function recordFillOutcome(
  o: FillOutcomeOptions,
  opts?: EventOptions,
): RiskEvent {
  const event: Omit<RiskEvent, "timestamp"> = {
    kind: "fill_outcome",
    source: "fill",
    ats: o.ats,
    severity: o.outcome === "filled" ? "info" : o.outcome === "detected" ? "alert" : "warning",
  };
  if (o.tenant) event.tenant = o.tenant;
  if (o.signal) event.signal = o.signal;
  if (o.note) event.note = o.note;
  if (o.snapshotDir) event.snapshotDir = o.snapshotDir;
  return recordEvent(event, opts);
}

export interface SubmitOutcomeOptions {
  ats: string;
  tenant?: string;
  outcome: "submitted" | "submit_failed" | "detected";
  signal?: import("./types.js").DetectionSignal;
  note?: string;
  snapshotDir?: string;
}

export function recordSubmitOutcome(
  o: SubmitOutcomeOptions,
  opts?: EventOptions,
): RiskEvent {
  const event: Omit<RiskEvent, "timestamp"> = {
    kind: "submit_outcome",
    source: "submit",
    ats: o.ats,
    severity: o.outcome === "submitted" ? "info" : o.outcome === "detected" ? "alert" : "warning",
  };
  if (o.tenant) event.tenant = o.tenant;
  if (o.signal) event.signal = o.signal;
  if (o.note) event.note = o.note;
  if (o.snapshotDir) event.snapshotDir = o.snapshotDir;
  return recordEvent(event, opts);
}

export interface VerifyLinkOutcomeOptions {
  ats: string;
  outcome: "succeeded" | "host_not_allowed" | "button_not_found" | "detected" | "error";
  signal?: import("./types.js").DetectionSignal;
  note?: string;
  snapshotDir?: string;
}

export function recordVerifyLinkOutcome(
  o: VerifyLinkOutcomeOptions,
  opts?: EventOptions,
): RiskEvent {
  const event: Omit<RiskEvent, "timestamp"> = {
    kind: "verify_link_outcome",
    source: "verify-link",
    ats: o.ats,
    severity: o.outcome === "succeeded" ? "info" : o.outcome === "detected" ? "alert" : "warning",
  };
  if (o.signal) event.signal = o.signal;
  if (o.note) event.note = o.note;
  if (o.snapshotDir) event.snapshotDir = o.snapshotDir;
  return recordEvent(event, opts);
}

export interface DetectionSignalOptions {
  ats: string;
  tenant?: string;
  signal: import("./types.js").DetectionSignal;
  source: import("./types.js").EventSource;
  note?: string;
  snapshotDir?: string;
}

export function recordDetectionSignal(
  o: DetectionSignalOptions,
  opts?: EventOptions,
): RiskEvent {
  const event: Omit<RiskEvent, "timestamp"> = {
    kind: "detection_signal",
    source: o.source,
    ats: o.ats,
    signal: o.signal,
    severity: "alert",
  };
  if (o.tenant) event.tenant = o.tenant;
  if (o.note) event.note = o.note;
  if (o.snapshotDir) event.snapshotDir = o.snapshotDir;
  return recordEvent(event, opts);
}
