/**
 * auto-signup — Phase 4 user-facing CLI.
 *
 * Subcommands:
 *
 *   auto-signup status
 *     Show RISK_ACK + quota policy + recent signup history.
 *
 *   auto-signup dry-run --ats <id> --tenant <slug> --url <signup-url>
 *     Run signupGate (without opening a tab) and print whether a real
 *     run would be allowed.
 *
 *   auto-signup run --ats <id> --tenant <slug> --url <signup-url>
 *     Real signup — opens browser, fills form, submits. Single user-
 *     facing path that exercises runSignupFlow.
 *
 * Exit codes:
 *   0 — success
 *   2 — user error
 *   3 — runtime failure
 */

import { existsSync, readFileSync } from "node:fs";

import {
  hasValidRiskAck,
  RequiresPhoneVerificationError,
  RiskAckMissingError,
  runSignupFlow,
  signupGate,
  SignupCooldownError,
  SignupQuotaExceededError,
  SignupSubmitFailedError,
  type SignupQuotaPolicy,
  type SupportedSignupATS,
} from "../packages/auto-signup/src/index.js";

interface CliOptions {
  ackPath?: string;
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
      "auto-signup — Phase 4 signup CLI",
      "",
      "Usage:",
      "  auto-signup status",
      "  auto-signup dry-run --ats <id> --tenant <slug> --url <signup-url>",
      "  auto-signup run     --ats <id> --tenant <slug> --url <signup-url>",
      "  auto-signup --help",
      "",
      "Phase 4 requires a signed RISK_ACK.md (see RISK_ACK.example.md).",
    ].join("\n"),
  );
}

function loadQuotaPolicy(): SignupQuotaPolicy {
  // Read auto-apply-policy.yml's signup_quota subsection.
  // Fall back to disabled (zeros) if missing or malformed.
  const path = "config/auto-apply-policy.yml";
  if (!existsSync(path)) return { total_per_week: 0, per_ats_per_week: {} };
  try {
    const yaml = require("yaml") as typeof import("yaml");
    const parsed = yaml.parse(readFileSync(path, "utf-8")) as
      | { signup_quota?: { total_per_week?: number; per_ats_per_week?: Record<string, number> } }
      | null;
    return {
      total_per_week: parsed?.signup_quota?.total_per_week ?? 0,
      per_ats_per_week: parsed?.signup_quota?.per_ats_per_week ?? {},
    };
  } catch {
    return { total_per_week: 0, per_ats_per_week: {} };
  }
}

function status(opts: CliOptions): number {
  const ackOk = hasValidRiskAck(opts.ackPath ? { filePath: opts.ackPath } : {});
  const policy = loadQuotaPolicy();
  process.stdout.write(`RISK_ACK.md: ${ackOk ? "valid" : "MISSING / INVALID"}\n`);
  process.stdout.write(`Signup quota: total_per_week=${policy.total_per_week}\n`);
  for (const [ats, n] of Object.entries(policy.per_ats_per_week)) {
    process.stdout.write(`  ${ats}: ${n}/week\n`);
  }
  if (Object.keys(policy.per_ats_per_week).length === 0) {
    process.stdout.write(`  (no per-ATS limits set; signup is effectively disabled)\n`);
  }
  return 0;
}

function dryRun(opts: CliOptions, ats: string, _tenant: string, _url: string): number {
  const policy = loadQuotaPolicy();
  try {
    signupGate(
      {
        ats,
        policy,
        history: [], // CLI doesn't track history; gate uses zero baseline
      },
      {
        ...(opts.ackPath ? { filePath: opts.ackPath } : {}),
      },
    );
    process.stdout.write(`✓ gate would allow signup for ${ats}\n`);
    return 0;
  } catch (err) {
    if (err instanceof RiskAckMissingError) {
      process.stderr.write(`✗ ${err.message}\n`);
      return 2;
    }
    if (err instanceof SignupQuotaExceededError) {
      process.stderr.write(`✗ quota: ${err.message}\n`);
      return 2;
    }
    if (err instanceof SignupCooldownError) {
      process.stderr.write(`✗ cooldown: ${err.message}\n`);
      return 2;
    }
    process.stderr.write(`✗ ${err instanceof Error ? err.message : String(err)}\n`);
    return 3;
  }
}

async function runReal(
  opts: CliOptions,
  ats: SupportedSignupATS,
  tenant: string,
  url: string,
): Promise<number> {
  // Lazy-load identity from the auto-apply profile loader (single source of truth).
  const { loadApplicationData } = await import("@auto-job/auto-apply");
  const data = loadApplicationData();
  const policy = loadQuotaPolicy();
  const { createBrowserController } = await import("@auto-job/browser");
  const controller = await createBrowserController();
  try {
    const result = await runSignupFlow(
      controller,
      { id: `${ats}-${tenant}-${Date.now()}`, ats, tenant, signupUrl: url },
      {
        identity: {
          email: data.email,
          firstName: data.name.first,
          lastName: data.name.last,
          ...(data.phone ? { phone: data.phone } : {}),
        },
        quotaPolicy: policy,
        history: [],
        ...(opts.ackPath ? { filePath: opts.ackPath } : {}),
      },
    );
    process.stdout.write(
      `✓ account created for ${ats}/${tenant}\n` +
        `  vaultRef: ${result.vaultRef}\n` +
        `  finalUrl: ${result.finalUrl}\n` +
        `  requiresEmailVerification: ${result.requiresEmailVerification}\n` +
        `  snapshot: ${result.snapshotDir}\n`,
    );
    return 0;
  } catch (err) {
    if (err instanceof RiskAckMissingError || err instanceof SignupQuotaExceededError ||
        err instanceof SignupCooldownError) {
      process.stderr.write(`✗ blocked: ${err.message}\n`);
      return 2;
    }
    if (err instanceof RequiresPhoneVerificationError) {
      process.stderr.write(`✗ phone verification required: ${err.message}\n`);
      return 3;
    }
    if (err instanceof SignupSubmitFailedError) {
      process.stderr.write(`✗ submit failed: ${err.message}\n`);
      return 3;
    }
    process.stderr.write(`✗ ${err instanceof Error ? err.message : String(err)}\n`);
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
  if (typeof flags["ack-path"] === "string") opts.ackPath = flags["ack-path"];

  const sub = args[0];
  if (!sub) {
    printHelp();
    return 2;
  }
  if (sub === "status") return status(opts);
  if (sub === "dry-run" || sub === "run") {
    const ats = typeof flags.ats === "string" ? flags.ats : undefined;
    const tenant = typeof flags.tenant === "string" ? flags.tenant : undefined;
    const url = typeof flags.url === "string" ? flags.url : undefined;
    if (!ats || !tenant || !url) {
      process.stderr.write(`missing required flags: --ats <id> --tenant <slug> --url <signup-url>\n`);
      return 2;
    }
    if (sub === "dry-run") return dryRun(opts, ats, tenant, url);
    if (!isSupportedAts(ats)) {
      process.stderr.write(`unsupported ats "${ats}" — supported: greenhouse, lever, ashby, workday\n`);
      return 2;
    }
    return await runReal(opts, ats, tenant, url);
  }
  process.stderr.write(`unknown subcommand "${sub}"\n`);
  return 2;
}

function isSupportedAts(s: string): s is SupportedSignupATS {
  return s === "greenhouse" || s === "lever" || s === "ashby" || s === "workday";
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
