/**
 * processNextVerificationEmail — single-pass orchestrator.
 *
 *   1. Load allowlist (refuse if empty)
 *   2. pollVerificationEmails
 *   3. Pick first pending → verifyLink(controller, link)
 *   4. On success: ensure label → addLabel
 *   5. Return outcome
 */

import type { BrowserController } from "@auto-job/browser";

import { loadAllowlist, type Allowlist, type LoadOptions as AllowlistOptions } from "./allowlist.js";
import {
  ConfirmButtonNotFoundError,
  EmailBotDisabledError,
  LinkHostNotAllowedError,
} from "./errors.js";
import { GmailClient, type GmailOptions } from "./gmail.js";
import {
  PROCESSED_LABEL_NAME,
  pollVerificationEmails,
  type PendingVerification,
  type PollOptions,
} from "./poll.js";
import { verifyLink, type VerifyLinkOptions, type VerifyLinkResult } from "./verify-link.js";

export interface RunOptions {
  allowlistPath?: string;
  snapshotRoot?: string;
  /** Override Gmail client for tests. */
  gmailClient?: GmailClient;
  /** Override allowlist (skip disk read; tests). */
  allowlist?: Allowlist;
  /** Override delay calc for tests. */
  delayMs?: (buttonText: string) => number;
  /** newer_than filter; default 1h. */
  newerThan?: string;
}

export type RunOutcome =
  | { kind: "no-allowlist" }
  | { kind: "no-pending" }
  | { kind: "succeeded"; messageId: string; result: VerifyLinkResult }
  | { kind: "host-not-allowed"; messageId: string; reason: string }
  | { kind: "button-not-found"; messageId: string; reason: string }
  | { kind: "error"; messageId: string; reason: string };

export async function processNextVerificationEmail(
  controller: BrowserController,
  opts: RunOptions = {},
): Promise<RunOutcome> {
  const allowlist =
    opts.allowlist ??
    loadAllowlist(opts.allowlistPath ? ({ filePath: opts.allowlistPath } as AllowlistOptions) : {});
  if (allowlist.entries.length === 0) return { kind: "no-allowlist" };

  const pollOpts: PollOptions = {};
  if (opts.gmailClient) pollOpts.client = opts.gmailClient;
  if (opts.newerThan) pollOpts.newerThan = opts.newerThan;
  const { pending } = await pollVerificationEmails(allowlist, pollOpts);
  if (pending.length === 0) return { kind: "no-pending" };

  const next = pending[0]!;
  return runOne(controller, next, allowlist, opts);
}

export async function runOne(
  controller: BrowserController,
  next: PendingVerification,
  allowlist: Allowlist,
  opts: RunOptions = {},
): Promise<RunOutcome> {
  const verifyOpts: VerifyLinkOptions = {
    messageId: next.messageId,
    fromHeader: next.fromHeader,
    subject: next.subject,
  };
  if (opts.snapshotRoot) verifyOpts.snapshotRoot = opts.snapshotRoot;
  if (opts.delayMs) verifyOpts.delayMs = opts.delayMs;
  try {
    const result = await verifyLink(controller, next.link, allowlist, verifyOpts);
    // Label as processed (best-effort; failure logs but doesn't undo click).
    await applyProcessedLabel(next.messageId, opts);
    return { kind: "succeeded", messageId: next.messageId, result };
  } catch (rawErr) {
    if (rawErr instanceof EmailBotDisabledError) {
      return { kind: "no-allowlist" };
    }
    if (rawErr instanceof LinkHostNotAllowedError) {
      return { kind: "host-not-allowed", messageId: next.messageId, reason: rawErr.message };
    }
    if (rawErr instanceof ConfirmButtonNotFoundError) {
      return { kind: "button-not-found", messageId: next.messageId, reason: rawErr.message };
    }
    const message = rawErr instanceof Error ? rawErr.message : String(rawErr);
    return { kind: "error", messageId: next.messageId, reason: message };
  }
}

async function applyProcessedLabel(messageId: string, opts: RunOptions): Promise<void> {
  try {
    const gmailOpts: GmailOptions = {};
    const client = opts.gmailClient ?? GmailClient.create(gmailOpts);
    const labelId = await client.ensureLabel(PROCESSED_LABEL_NAME);
    await client.addLabel(messageId, labelId);
  } catch (err) {
    // Label apply failure is non-fatal; log and continue. Bot will reprocess
    // next poll, which is acceptable for verification (links are idempotent).
    process.stderr.write(
      `email-bot: failed to add label to ${messageId}: ${err instanceof Error ? err.message : String(err)}\n`,
    );
  }
}
