/**
 * auto-apply-approve — Phase 2C user-facing CLI.
 *
 * Subcommands:
 *
 *   auto-apply-approve list
 *     Show every entry with status "awaiting_approval".
 *
 *   auto-apply-approve show <id>
 *     Print the snapshot MANIFEST.txt; on macOS also `open` the snapshot dir.
 *
 *   auto-apply-approve <id>
 *     Re-fill defensively, then SUBMIT. The single user-facing path that
 *     lifts the submit gate.
 *
 *   auto-apply-approve skip <id> [--reason "..."]
 *     Mark status "skipped" without re-running the browser.
 *
 *   auto-apply-approve sweep
 *     Flip stale awaiting_approval entries to "expired" per policy TTL.
 *
 * Exit codes:
 *   0 — success
 *   2 — user error (missing id, unknown subcommand, non-approvable entry)
 *   3 — runtime failure (browser open failed, submit threw, ...)
 */

import { exec } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import {
  EntryNotApprovableError,
  loadPolicy,
  markStatus,
  processApprovedEntry,
  readQueue,
  runExpirySweep,
} from "../apps/server/src/apply-queue/index.js";

interface CliOptions {
  queuePath?: string;
  policyPath?: string;
}

function parseFlags(argv: string[]): { args: string[]; flags: Record<string, string | true> } {
  const args: string[] = [];
  const flags: Record<string, string | true> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        flags[key] = next;
        i += 1;
      } else {
        flags[key] = true;
      }
    } else {
      args.push(a);
    }
  }
  return { args, flags };
}

function printHelp() {
  process.stdout.write(
    [
      "auto-apply-approve — Phase 2C approval CLI",
      "",
      "Usage:",
      "  auto-apply-approve list",
      "  auto-apply-approve show <id>",
      "  auto-apply-approve <id>",
      "  auto-apply-approve skip <id> [--reason <text>]",
      "  auto-apply-approve sweep",
      "  auto-apply-approve --help",
      "",
    ].join("\n"),
  );
}

function fmtTime(iso: string): string {
  const ageMs = Date.now() - Date.parse(iso);
  if (Number.isNaN(ageMs)) return iso;
  const mins = Math.floor(ageMs / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 48) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function parseSnapshotPath(notes: string | undefined): string | undefined {
  if (!notes) return undefined;
  const m = notes.match(/snapshot at ([^;]+)/);
  return m?.[1]?.trim();
}

function listAwaiting(opts: CliOptions): number {
  const queueArgs = opts.queuePath ? { filePath: opts.queuePath } : {};
  const queue = readQueue(queueArgs);
  const awaiting = queue.filter((e) => e.status === "awaiting_approval");
  if (awaiting.length === 0) {
    process.stdout.write("No entries awaiting approval.\n");
    return 0;
  }
  process.stdout.write(`Awaiting approval (${awaiting.length}):\n\n`);
  for (const e of awaiting) {
    const snap = parseSnapshotPath(e.notes) ?? "(no snapshot)";
    process.stdout.write(
      `  ${e.id}  ${e.ats}/${e.tenant}  score=${e.score}  ${fmtTime(e.status_at)}\n` +
        `    ${e.jobUrl}\n` +
        `    snapshot: ${snap}\n\n`,
    );
  }
  process.stdout.write(`Approve: auto-apply-approve <id>\n`);
  process.stdout.write(`Skip   : auto-apply-approve skip <id> --reason "..."\n`);
  return 0;
}

function show(id: string, opts: CliOptions): number {
  const queueArgs = opts.queuePath ? { filePath: opts.queuePath } : {};
  const queue = readQueue(queueArgs);
  const entry = queue.find((e) => e.id === id);
  if (!entry) {
    process.stderr.write(`no entry with id "${id}"; try \`auto-apply-approve list\`\n`);
    return 2;
  }
  const snap = parseSnapshotPath(entry.notes);
  if (!snap || !existsSync(snap)) {
    process.stderr.write(`entry "${id}" has no readable snapshot path\n`);
    return 2;
  }
  const manifestPath = join(snap, "MANIFEST.txt");
  if (existsSync(manifestPath)) {
    process.stdout.write(readFileSync(manifestPath, "utf-8"));
  } else {
    process.stdout.write(`(MANIFEST.txt not found in ${snap})\n`);
  }
  if (process.platform === "darwin") {
    exec(`open ${JSON.stringify(snap)}`);
  }
  return 0;
}

function skip(
  id: string,
  reason: string | undefined,
  opts: CliOptions,
): number {
  const queueArgs = opts.queuePath ? { filePath: opts.queuePath } : {};
  const queue = readQueue(queueArgs);
  const entry = queue.find((e) => e.id === id);
  if (!entry) {
    process.stderr.write(`no entry with id "${id}"; try \`auto-apply-approve list\`\n`);
    return 2;
  }
  if (entry.status !== "awaiting_approval") {
    process.stderr.write(
      `entry "${id}" has status "${entry.status}"; only "awaiting_approval" can be skipped\n`,
    );
    return 2;
  }
  markStatus(
    id,
    "skipped",
    { notes: reason ? `skipped by user: ${reason}` : `skipped by user` },
    queueArgs,
  );
  process.stdout.write(`marked ${id} as skipped\n`);
  return 0;
}

function sweep(opts: CliOptions): number {
  const queueArgs = opts.queuePath ? { filePath: opts.queuePath } : {};
  const policyOpts = opts.policyPath ? { filePath: opts.policyPath } : {};
  const policy = loadPolicy(policyOpts);
  const result = runExpirySweep({
    policy,
    ...queueArgs,
  });
  process.stdout.write(
    `swept ${result.scanned} entries, expired ${result.expired} ` +
      `(TTL=${policy.approval_ttl_hours}h)\n`,
  );
  return 0;
}

async function approve(id: string, opts: CliOptions): Promise<number> {
  const queueArgs = opts.queuePath ? { filePath: opts.queuePath } : {};
  const queue = readQueue(queueArgs);
  const entry = queue.find((e) => e.id === id);
  if (!entry) {
    process.stderr.write(`no entry with id "${id}"; try \`auto-apply-approve list\`\n`);
    return 2;
  }
  if (entry.status !== "awaiting_approval") {
    process.stderr.write(
      `entry "${id}" has status "${entry.status}"; only "awaiting_approval" can be approved\n`,
    );
    return 2;
  }
  // Lazy-load the browser to avoid pulling Chromium on `list`/`show`/`skip`/`sweep`.
  const { createBrowserController } = await import("@auto-job/browser");
  const controller = await createBrowserController();
  try {
    const result = await processApprovedEntry(controller, id, queueArgs);
    process.stdout.write(`outcome: ${result.outcome}\n`);
    if (result.finalUrl) process.stdout.write(`finalUrl: ${result.finalUrl}\n`);
    if (result.reason) process.stdout.write(`reason: ${result.reason}\n`);
    return result.outcome === "submitted" ? 0 : 3;
  } catch (rawErr) {
    if (rawErr instanceof EntryNotApprovableError) {
      process.stderr.write(rawErr.message + "\n");
      return 2;
    }
    const message = rawErr instanceof Error ? rawErr.message : String(rawErr);
    process.stderr.write(`approve failed: ${message}\n`);
    return 3;
  } finally {
    await controller.close().catch(() => undefined);
  }
}

export async function main(argv: string[] = process.argv.slice(2)): Promise<number> {
  const { args, flags } = parseFlags(argv);
  if (flags.help || args[0] === "--help" || args[0] === "-h") {
    printHelp();
    return 0;
  }
  const opts: CliOptions = {};
  if (typeof flags["queue-path"] === "string") opts.queuePath = flags["queue-path"];
  if (typeof flags["policy-path"] === "string") opts.policyPath = flags["policy-path"];

  const sub = args[0];
  if (!sub) {
    printHelp();
    return 2;
  }
  if (sub === "list") return listAwaiting(opts);
  if (sub === "sweep") return sweep(opts);
  if (sub === "show") {
    const id = args[1];
    if (!id) {
      process.stderr.write("missing <id>; usage: auto-apply-approve show <id>\n");
      return 2;
    }
    return show(id, opts);
  }
  if (sub === "skip") {
    const id = args[1];
    if (!id) {
      process.stderr.write("missing <id>; usage: auto-apply-approve skip <id> [--reason ...]\n");
      return 2;
    }
    const reason = typeof flags.reason === "string" ? flags.reason : undefined;
    return skip(id, reason, opts);
  }
  // No subcommand → treat as id and approve.
  return approve(sub, opts);
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  main()
    .then((code) => process.exit(code))
    .catch((err) => {
      process.stderr.write(`fatal: ${err instanceof Error ? err.message : String(err)}\n`);
      process.exit(3);
    });
}
