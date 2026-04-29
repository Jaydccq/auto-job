import { randomUUID } from "node:crypto";
import type { ScanJobEvent, ScanRunnerId } from "../contracts/scan-launch.js";

interface JobMeta {
  id: string;
  skillId: string;
  runner: ScanRunnerId;
  status: "running" | "ok" | "failed";
  startedAt: string;
  finishedAt: string | null;
  exitCode: number | null;
  log: ScanJobEvent[];
}

export interface ScanLastRunSummary {
  startedAt: string;
  finishedAt: string | null;
  exitCode: number | null;
  status: "ok" | "failed" | "running";
  summaryPath: null;
}

export interface ScanJobRegistry {
  start(args: { skillId: string; runner: ScanRunnerId }): string;
  appendLog(id: string, type: "stdout" | "stderr", line: string): void;
  finish(id: string, exitCode: number): void;
  get(id: string): JobMeta | undefined;
  tail(id: string): ScanJobEvent[];
  isBusy(): boolean;
  /** Latest finished run per skill, keyed by skillId. Drives the UI badge
   *  even when the underlying script crashed before writing its summary. */
  lastRunBySkill(): Map<string, ScanLastRunSummary>;
}

export function createScanJobRegistry(opts: { maxLogLines?: number } = {}): ScanJobRegistry {
  const maxLogLines = opts.maxLogLines ?? 2_000;
  const jobs = new Map<string, JobMeta>();
  const lastBySkill = new Map<string, JobMeta>();
  let runningId: string | null = null;

  return {
    start({ skillId, runner }) {
      if (runningId && jobs.get(runningId)?.status === "running") {
        throw new Error("another scan is running");
      }
      const id = randomUUID();
      jobs.set(id, {
        id,
        skillId,
        runner,
        status: "running",
        startedAt: new Date().toISOString(),
        finishedAt: null,
        exitCode: null,
        log: [],
      });
      runningId = id;
      return id;
    },
    appendLog(id, type, line) {
      const job = jobs.get(id);
      if (!job) return;
      job.log.push({ ts: new Date().toISOString(), type, line });
      if (job.log.length > maxLogLines) job.log.splice(0, job.log.length - maxLogLines);
    },
    finish(id, exitCode) {
      const job = jobs.get(id);
      if (!job) return;
      job.status = exitCode === 0 ? "ok" : "failed";
      job.finishedAt = new Date().toISOString();
      job.exitCode = exitCode;
      job.log.push({ ts: job.finishedAt, type: "end", exitCode });
      lastBySkill.set(job.skillId, job);
      if (runningId === id) runningId = null;
    },
    get(id) { return jobs.get(id); },
    tail(id) { return jobs.get(id)?.log ?? []; },
    isBusy() {
      return runningId !== null && jobs.get(runningId)?.status === "running";
    },
    lastRunBySkill() {
      const out = new Map<string, ScanLastRunSummary>();
      for (const [skillId, job] of lastBySkill) {
        out.set(skillId, {
          startedAt: job.startedAt,
          finishedAt: job.finishedAt,
          exitCode: job.exitCode,
          status: job.status,
          summaryPath: null,
        });
      }
      return out;
    },
  };
}
