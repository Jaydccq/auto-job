import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

export const SCAN_RUN_COUNT_KEYS = [
  "discovered",
  "listPromoted",
  "listFiltered",
  "enriched",
  "enrichmentFailed",
  "detailAdded",
  "detailSkipped",
  "queued",
  "queueFailed",
  "queueSkipped",
  "completed",
  "failed",
  "timedOut",
] as const;

export type ScanRunCountKey = (typeof SCAN_RUN_COUNT_KEYS)[number];

export type ScanRunStatus = "running" | "completed" | "failed";

export interface ScanRunSummary {
  scanRunId: string;
  source: string;
  startedAt: string;
  updatedAt: string;
  status: ScanRunStatus;
  counts: Record<ScanRunCountKey, number>;
  eventLogPath: string;
  summaryPath: string;
}

export interface ScanRunRecorder {
  scanRunId: string;
  eventLogPath: string;
  summaryPath: string;
  increment(key: ScanRunCountKey, amount?: number): void;
  record(event: string, payload?: Record<string, unknown>): void;
  finalize(status: ScanRunStatus, payload?: Record<string, unknown>): ScanRunSummary;
  summary(status?: ScanRunStatus): ScanRunSummary;
}

export function createScanRunId(source = "newgrad"): string {
  const stamp = new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
  return `${source}-${stamp}-${randomUUID().slice(0, 8)}`;
}

export function createScanRunRecorder(args: {
  repoRoot: string;
  scanRunId: string;
  source: string;
  startedAt?: string;
}): ScanRunRecorder {
  const startedAt = args.startedAt ?? new Date().toISOString();
  const counts = Object.fromEntries(
    SCAN_RUN_COUNT_KEYS.map((key) => [key, 0]),
  ) as Record<ScanRunCountKey, number>;
  const dir = join(args.repoRoot, "data", "scan-runs");
  mkdirSync(dir, { recursive: true });
  const eventLogPath = join(dir, `${args.scanRunId}.jsonl`);
  const summaryPath = join(dir, `${args.scanRunId}-summary.json`);

  const buildSummary = (status: ScanRunStatus): ScanRunSummary => ({
    scanRunId: args.scanRunId,
    source: args.source,
    startedAt,
    updatedAt: new Date().toISOString(),
    status,
    counts: { ...counts },
    eventLogPath,
    summaryPath,
  });

  const recorder: ScanRunRecorder = {
    scanRunId: args.scanRunId,
    eventLogPath,
    summaryPath,
    increment(key, amount = 1) {
      counts[key] += amount;
    },
    record(event, payload = {}) {
      const sanitizedPayload = sanitizeEventPayload(payload);
      const line = {
        at: new Date().toISOString(),
        scanRunId: args.scanRunId,
        source: args.source,
        event,
        ...sanitizedPayload,
      };
      appendFileSync(eventLogPath, `${JSON.stringify(line)}\n`, "utf-8");
    },
    finalize(status, payload = {}) {
      recorder.record(`scan_${status}`, payload);
      const summary = buildSummary(status);
      writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, "utf-8");
      return summary;
    },
    summary(status = "running") {
      return buildSummary(status);
    },
  };

  recorder.record("scan_started");
  return recorder;
}

function sanitizeForEventLog(value: unknown): unknown {
  if (typeof value === "string") {
    return value.length > 500 ? `${value.slice(0, 500)}...[truncated]` : value;
  }
  if (Array.isArray(value)) {
    return value.slice(0, 50).map(sanitizeForEventLog);
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      if (key.toLowerCase().includes("pagetext") || key.toLowerCase().includes("description")) {
        continue;
      }
      out[key] = sanitizeForEventLog(item);
    }
    return out;
  }
  return value;
}

function sanitizeEventPayload(payload: Record<string, unknown>): Record<string, unknown> {
  const sanitized = sanitizeForEventLog(payload);
  return sanitized && typeof sanitized === "object" && !Array.isArray(sanitized)
    ? sanitized as Record<string, unknown>
    : {};
}
