/**
 * email-bot — Phase 3 user-facing CLI.
 *
 * Subcommands:
 *
 *   email-bot list
 *     Print pending verification emails (allowlisted host, not yet
 *     auto-job/processed). Read-only; never opens a browser.
 *
 *   email-bot allowlist
 *     Print the effective allowlist with auto_click flag + selector.
 *
 *   email-bot run
 *     Process the next pending email — opens a browser, clicks confirm,
 *     labels the email. The single user-facing path that performs an
 *     actual click on a verification link.
 *
 *   email-bot sweep [--max N]
 *     Process up to N (default 5) pending emails sequentially.
 *
 * Exit codes:
 *   0 — success / no-op
 *   2 — user error (missing args, no allowlist)
 *   3 — runtime failure
 */

import {
  GmailClient,
  loadAllowlist,
  pollVerificationEmails,
  processNextVerificationEmail,
  type RunOutcome,
} from "../packages/email-bot/src/index.js";

interface CliOptions {
  allowlistPath?: string;
  newerThan?: string;
  max?: number;
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

function printHelp(): void {
  process.stdout.write(
    [
      "email-bot — Phase 3 verification CLI",
      "",
      "Usage:",
      "  email-bot list             — show pending verification emails (no browser)",
      "  email-bot allowlist        — show effective allowlist",
      "  email-bot run              — process next pending email (opens browser)",
      "  email-bot sweep [--max N]  — process up to N pending (default 5)",
      "  email-bot --help",
      "",
    ].join("\n"),
  );
}

async function listPending(opts: CliOptions): Promise<number> {
  const allowlist = loadAllowlist(opts.allowlistPath ? { filePath: opts.allowlistPath } : {});
  if (allowlist.entries.length === 0) {
    process.stdout.write(
      "no allowlist configured. copy config/email-verification-allowlist.example.yml " +
        "to config/email-verification-allowlist.yml and add hosts.\n",
    );
    return 0;
  }
  const enabled = allowlist.entries.filter((e) => e.autoClick);
  if (enabled.length === 0) {
    process.stdout.write("allowlist has no auto_click=true hosts; bot is disabled.\n");
    return 0;
  }
  const pollOpts: Parameters<typeof pollVerificationEmails>[1] = {};
  if (opts.newerThan) pollOpts.newerThan = opts.newerThan;
  const result = await pollVerificationEmails(allowlist, pollOpts);
  if (result.pending.length === 0) {
    process.stdout.write(`no pending verification emails (checked ${enabled.length} host(s)).\n`);
    return 0;
  }
  process.stdout.write(`${result.pending.length} pending verification email(s):\n\n`);
  for (const p of result.pending) {
    let host = "";
    try {
      host = new URL(p.link).hostname;
    } catch {
      host = "?";
    }
    process.stdout.write(
      `  ${p.messageId}  from=${p.fromHeader}\n` +
        `    subject: ${p.subject}\n` +
        `    link host: ${host}\n\n`,
    );
  }
  if (result.ambiguous.length > 0) {
    process.stdout.write(`(${result.ambiguous.length} skipped as ambiguous; review manually)\n`);
  }
  return 0;
}

function showAllowlist(opts: CliOptions): number {
  const allowlist = loadAllowlist(opts.allowlistPath ? { filePath: opts.allowlistPath } : {});
  if (allowlist.entries.length === 0) {
    process.stdout.write("(allowlist is empty)\n");
    return 0;
  }
  for (const e of allowlist.entries) {
    process.stdout.write(
      `${e.host}  auto_click=${e.autoClick}` +
        (e.confirmButtonSelector ? `  selector="${e.confirmButtonSelector}"` : "") +
        "\n",
    );
  }
  return 0;
}

async function runOne(opts: CliOptions): Promise<RunOutcome> {
  const { createBrowserController } = await import("@auto-job/browser");
  const controller = await createBrowserController();
  try {
    return await processNextVerificationEmail(controller, {
      ...(opts.allowlistPath ? { allowlistPath: opts.allowlistPath } : {}),
      ...(opts.newerThan ? { newerThan: opts.newerThan } : {}),
    });
  } finally {
    await controller.close().catch(() => undefined);
  }
}

function printOutcome(outcome: RunOutcome): void {
  switch (outcome.kind) {
    case "no-allowlist":
      process.stdout.write("no allowlist configured.\n");
      break;
    case "no-pending":
      process.stdout.write("no pending verification emails.\n");
      break;
    case "succeeded":
      process.stdout.write(
        `✓ ${outcome.messageId}  clicked ${outcome.result.buttonSelector}\n` +
          `  finalUrl: ${outcome.result.finalUrl}\n` +
          `  snapshot: ${outcome.result.snapshotDir}\n`,
      );
      break;
    case "host-not-allowed":
    case "button-not-found":
    case "error":
      process.stdout.write(`✗ ${outcome.messageId}  ${outcome.kind}: ${outcome.reason}\n`);
      break;
  }
}

async function sweep(opts: CliOptions): Promise<number> {
  const max = opts.max ?? 5;
  let processed = 0;
  let lastKind: RunOutcome["kind"] | null = null;
  for (let i = 0; i < max; i++) {
    const outcome = await runOne(opts);
    printOutcome(outcome);
    lastKind = outcome.kind;
    if (outcome.kind === "no-allowlist" || outcome.kind === "no-pending") break;
    processed += 1;
  }
  process.stdout.write(`\nsweep complete: ${processed} processed (last: ${lastKind ?? "n/a"})\n`);
  return 0;
}

export async function main(argv: string[] = process.argv.slice(2)): Promise<number> {
  const { args, flags } = parseFlags(argv);
  if (flags.help || args[0] === "--help" || args[0] === "-h") {
    printHelp();
    return 0;
  }
  const opts: CliOptions = {};
  if (typeof flags["allowlist-path"] === "string") opts.allowlistPath = flags["allowlist-path"];
  if (typeof flags["newer-than"] === "string") opts.newerThan = flags["newer-than"];
  if (typeof flags.max === "string") opts.max = Number.parseInt(flags.max, 10);

  const sub = args[0];
  if (!sub) {
    printHelp();
    return 2;
  }
  if (sub === "list") return await listPending(opts);
  if (sub === "allowlist") return showAllowlist(opts);
  if (sub === "run") {
    const out = await runOne(opts);
    printOutcome(out);
    return out.kind === "succeeded" ? 0 : out.kind === "no-allowlist" || out.kind === "no-pending" ? 0 : 3;
  }
  if (sub === "sweep") return await sweep(opts);
  process.stderr.write(`unknown subcommand "${sub}"; try \`email-bot --help\`\n`);
  return 2;
}

// Suppress unused-import warning at TS-level for GmailClient (re-exported
// through @auto-job/email-bot for advanced callers).
void GmailClient;

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  main()
    .then((code) => process.exit(code))
    .catch((err) => {
      process.stderr.write(`fatal: ${err instanceof Error ? err.message : String(err)}\n`);
      process.exit(3);
    });
}
