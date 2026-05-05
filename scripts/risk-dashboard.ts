/**
 * risk-dashboard — Phase 5 operator surface.
 *
 *   risk-dashboard summary [--since 7d]   — per-ATS counts of scan/fill/submit/
 *                                            verify/detection over the window
 *                                            plus active cooldown status
 *   risk-dashboard events --ats <id>       — raw event log slice
 *           [--kind <k>] [--since 7d]
 *   risk-dashboard cooldowns                — current active cooldowns with
 *                                            remaining hours
 *   risk-dashboard force-cooldown <ats>     — manual cooldown injection
 *           --hours <n> [--reason ...]
 *   risk-dashboard evaluate                 — run evaluateCooldowns; print result
 *
 * Exit codes:
 *   0 — success
 *   2 — user error (bad args)
 */

import {
  evaluateCooldowns,
  isInCooldown,
  loadCooldowns,
  loadEvents,
  recordCooldown,
  type EventKind,
  type RiskEvent,
} from "../packages/risk-telemetry/src/index.js";

interface CliOptions {
  eventsPath?: string;
  cooldownsPath?: string;
}

const DEFAULT_WINDOW_HOURS = 7 * 24;

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

function parseSinceToHours(s: string | true | undefined, fallback: number): number {
  if (typeof s !== "string") return fallback;
  const m = s.match(/^(\d+)([hd])$/);
  if (!m) return fallback;
  const n = Number.parseInt(m[1]!, 10);
  return m[2] === "d" ? n * 24 : n;
}

function printHelp(): void {
  process.stdout.write(
    [
      "risk-dashboard — Phase 5 telemetry CLI",
      "",
      "Usage:",
      "  risk-dashboard summary [--since 7d]",
      "  risk-dashboard events --ats <id> [--kind <k>] [--since 7d]",
      "  risk-dashboard cooldowns",
      "  risk-dashboard force-cooldown <ats> --hours N [--reason ...]",
      "  risk-dashboard evaluate [--window 24h] [--threshold 1]",
      "  risk-dashboard --help",
      "",
    ].join("\n"),
  );
}

function summary(opts: CliOptions, sinceHours: number): number {
  const sinceMs = Date.now() - sinceHours * 3600_000;
  const events = loadEvents({
    ...(opts.eventsPath ? { filePath: opts.eventsPath } : {}),
    sinceMs,
  });
  if (events.length === 0) {
    process.stdout.write(`(no events in last ${sinceHours}h)\n`);
    return 0;
  }
  const byAts = new Map<string, { scan: number; fill: number; submit: number; verify: number; detect: number }>();
  for (const e of events) {
    const cur = byAts.get(e.ats) ?? { scan: 0, fill: 0, submit: 0, verify: 0, detect: 0 };
    if (e.kind === "scan_result") cur.scan += 1;
    else if (e.kind === "fill_outcome") cur.fill += 1;
    else if (e.kind === "submit_outcome") cur.submit += 1;
    else if (e.kind === "verify_link_outcome") cur.verify += 1;
    else if (e.kind === "detection_signal") cur.detect += 1;
    byAts.set(e.ats, cur);
  }
  const rows: string[] = [];
  rows.push(`ATS              scans  fills  submits  verify  detect  cooldown`);
  rows.push(`---------------  -----  -----  -------  ------  ------  --------`);
  for (const [ats, c] of [...byAts.entries()].sort()) {
    const cd = isInCooldown(ats, opts.cooldownsPath ? { filePath: opts.cooldownsPath } : {});
    const cdCol = cd.active ? `until ${cd.endsAt?.slice(0, 16)}` : "-";
    rows.push(
      `${ats.padEnd(15)}  ${pad(c.scan)}  ${pad(c.fill)}  ${pad(c.submit, 7)}  ${pad(c.verify, 6)}  ${pad(c.detect, 6)}  ${cdCol}`,
    );
  }
  process.stdout.write(rows.join("\n") + "\n");
  return 0;
}

function pad(n: number, w = 5): string {
  return String(n).padStart(w);
}

function eventsSlice(opts: CliOptions, ats: string, kind: EventKind | undefined, sinceHours: number): number {
  const sinceMs = Date.now() - sinceHours * 3600_000;
  const filter: Parameters<typeof loadEvents>[0] = {
    ...(opts.eventsPath ? { filePath: opts.eventsPath } : {}),
    ats,
    sinceMs,
  };
  if (kind) filter.kind = kind;
  const events = loadEvents(filter);
  if (events.length === 0) {
    process.stdout.write(`(no events for ats=${ats} in last ${sinceHours}h)\n`);
    return 0;
  }
  for (const e of events) printEvent(e);
  return 0;
}

function printEvent(e: RiskEvent): void {
  const sig = e.signal ? ` signal=${e.signal}` : "";
  const note = e.note ? ` "${e.note}"` : "";
  process.stdout.write(
    `${e.timestamp}  ${e.severity.padEnd(7)}  ${e.kind.padEnd(20)}  ats=${e.ats}${sig}${note}\n`,
  );
}

function cooldowns(opts: CliOptions): number {
  const list = loadCooldowns(opts.cooldownsPath ? { filePath: opts.cooldownsPath } : {});
  const now = Date.now();
  const active = list.filter((c) => Date.parse(c.ends_at) > now);
  if (active.length === 0) {
    process.stdout.write("(no active cooldowns)\n");
    return 0;
  }
  process.stdout.write(`Active cooldowns (${active.length}):\n\n`);
  for (const c of active) {
    const remainingH = ((Date.parse(c.ends_at) - now) / 3600_000).toFixed(1);
    process.stdout.write(
      `  ${c.ats.padEnd(15)}  ends ${c.ends_at.slice(0, 16)} (${remainingH}h)  ${c.origin}  ${c.reason}\n`,
    );
  }
  return 0;
}

function forceCooldown(
  opts: CliOptions,
  ats: string,
  hours: number,
  reason: string,
): number {
  const now = Date.now();
  const entry = recordCooldown(
    {
      ats,
      started_at: new Date(now).toISOString(),
      ends_at: new Date(now + hours * 3600_000).toISOString(),
      reason: reason || `manual: force-cooldown ${hours}h`,
      origin: "manual",
    },
    opts.cooldownsPath ? { filePath: opts.cooldownsPath } : {},
  );
  process.stdout.write(`force-cooldown ${ats} until ${entry.ends_at} (${hours}h)\n`);
  return 0;
}

function evaluateNow(opts: CliOptions, windowHours: number, threshold: number): number {
  const ev = evaluateCooldowns({
    ...(opts.cooldownsPath ? { filePath: opts.cooldownsPath } : {}),
    ...(opts.eventsPath ? { eventsPath: opts.eventsPath } : {}),
    windowHours,
    threshold,
  });
  process.stdout.write(
    `evaluated ${ev.scannedEvents} event(s); triggered ${ev.triggered.length} cooldown(s)\n`,
  );
  for (const c of ev.triggered) {
    process.stdout.write(`  + ${c.ats}  ${c.signal}  ends ${c.ends_at.slice(0, 16)}\n`);
  }
  return 0;
}

export async function main(argv: string[] = process.argv.slice(2)): Promise<number> {
  const { args, flags } = parseFlags(argv);
  if (flags.help || args[0] === "--help" || args[0] === "-h") {
    printHelp();
    return 0;
  }
  const opts: CliOptions = {};
  if (typeof flags["events-path"] === "string") opts.eventsPath = flags["events-path"];
  if (typeof flags["cooldowns-path"] === "string") opts.cooldownsPath = flags["cooldowns-path"];

  const sub = args[0];
  if (!sub) {
    printHelp();
    return 2;
  }
  if (sub === "summary") {
    const hours = parseSinceToHours(flags.since, DEFAULT_WINDOW_HOURS);
    return summary(opts, hours);
  }
  if (sub === "events") {
    const ats = typeof flags.ats === "string" ? flags.ats : undefined;
    if (!ats) {
      process.stderr.write("missing --ats <id>\n");
      return 2;
    }
    const kind = typeof flags.kind === "string" ? (flags.kind as EventKind) : undefined;
    const hours = parseSinceToHours(flags.since, DEFAULT_WINDOW_HOURS);
    return eventsSlice(opts, ats, kind, hours);
  }
  if (sub === "cooldowns") return cooldowns(opts);
  if (sub === "force-cooldown") {
    const ats = args[1];
    const hours = typeof flags.hours === "string" ? Number.parseInt(flags.hours, 10) : NaN;
    if (!ats || !Number.isFinite(hours) || hours <= 0) {
      process.stderr.write("usage: risk-dashboard force-cooldown <ats> --hours N [--reason ...]\n");
      return 2;
    }
    const reason = typeof flags.reason === "string" ? flags.reason : "";
    return forceCooldown(opts, ats, hours, reason);
  }
  if (sub === "evaluate") {
    const window = parseSinceToHours(flags.window, 24);
    const threshold = typeof flags.threshold === "string" ? Number.parseInt(flags.threshold, 10) : 1;
    return evaluateNow(opts, window, threshold);
  }
  process.stderr.write(`unknown subcommand "${sub}"; try \`risk-dashboard --help\`\n`);
  return 2;
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
