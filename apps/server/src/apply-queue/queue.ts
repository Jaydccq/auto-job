/**
 * Apply-queue persistence — append-only JSONL with latest-line-wins
 * projection per `id`.
 *
 * Why JSONL: matches the existing data/scan-history.tsv pattern, atomic
 * append on POSIX systems (single-line writes ≤ PIPE_BUF), replay-friendly,
 * and the file is human-readable for ops debugging.
 */

import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { mkdirSync } from "node:fs";

import type { ApplyQueueEntry, ApplyStatus } from "./types.js";

export interface QueueOptions {
  /** Path to the JSONL file. Default: data/apply-queue.jsonl in the repo root. */
  filePath?: string;
}

const DEFAULT_PATH = "data/apply-queue.jsonl";

function resolveFilePath(opts: QueueOptions = {}): string {
  return opts.filePath ?? DEFAULT_PATH;
}

function ensureDir(filePath: string): void {
  mkdirSync(dirname(filePath), { recursive: true });
}

/** Append a new entry to the queue. Sets status="ready" + queued_at + status_at. */
export function enqueue(
  entry: Omit<ApplyQueueEntry, "queued_at" | "status" | "status_at" | "attempts">,
  opts?: QueueOptions,
): ApplyQueueEntry {
  const filePath = resolveFilePath(opts);
  ensureDir(filePath);
  const now = new Date().toISOString();
  const full: ApplyQueueEntry = {
    ...entry,
    queued_at: now,
    status: "ready",
    status_at: now,
    attempts: 0,
  };
  appendFileSync(filePath, JSON.stringify(full) + "\n", { encoding: "utf-8" });
  return full;
}

/** Append a status mutation for an existing id. */
export function markStatus(
  id: string,
  status: ApplyStatus,
  patch: Partial<Pick<ApplyQueueEntry, "attempts" | "notes">> = {},
  opts?: QueueOptions,
): void {
  const filePath = resolveFilePath(opts);
  ensureDir(filePath);
  const mutation = {
    id,
    status,
    status_at: new Date().toISOString(),
    ...patch,
  };
  appendFileSync(filePath, JSON.stringify(mutation) + "\n", { encoding: "utf-8" });
}

/** Read the queue and project to current state (latest-line-wins per id). */
export function readQueue(opts?: QueueOptions): readonly ApplyQueueEntry[] {
  const filePath = resolveFilePath(opts);
  if (!existsSync(filePath)) return [];
  const raw = readFileSync(filePath, "utf-8");
  const byId = new Map<string, ApplyQueueEntry>();
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    let parsed: Partial<ApplyQueueEntry> & { id: string };
    try {
      parsed = JSON.parse(line);
    } catch {
      continue; // skip corrupt lines (best-effort recovery)
    }
    if (!parsed.id) continue;
    const existing = byId.get(parsed.id);
    if (!existing) {
      // First line for this id MUST contain full entry shape (an enqueue).
      // Mutation-only lines (without queued_at) before any enqueue are dropped.
      if (!parsed.queued_at) continue;
      byId.set(parsed.id, parsed as ApplyQueueEntry);
    } else {
      // Merge mutation into existing.
      byId.set(parsed.id, { ...existing, ...parsed });
    }
  }
  return Array.from(byId.values());
}
