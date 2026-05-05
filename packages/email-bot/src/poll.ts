/**
 * pollVerificationEmails — Gmail query builder + executor.
 *
 * Builds the Gmail search query from the allowlist + the standard
 * verification subject keywords + label exclusion, then resolves each
 * matching id to a structured `PendingVerification` (sender, subject,
 * extracted link, body).
 *
 * The query is intentionally narrow:
 *   newer_than:1h
 *   from:({allowed-hosts})
 *   subject:(verify OR confirm OR activate OR "is this you")
 *   -label:auto-job/processed
 */

import type { Allowlist } from "./allowlist.js";
import { extractVerificationLink } from "./extract-link.js";
import {
  GmailClient,
  extractBody,
  headerValue,
  type GmailMessage,
  type GmailOptions,
} from "./gmail.js";
import { MultiLinkAmbiguousError } from "./errors.js";

export const PROCESSED_LABEL_NAME = "auto-job/processed";

export interface PendingVerification {
  messageId: string;
  threadId: string;
  fromHeader: string;
  subject: string;
  link: string;
  body: string;
  internalDateMs: number;
}

export interface PollOptions extends GmailOptions {
  newerThan?: string;          // e.g. "1h", "6h"
  maxResults?: number;
  /** Override Gmail client (used by tests). */
  client?: GmailClient;
}

/**
 * Build the Gmail search query.
 */
export function buildPollQuery(allowlist: Allowlist, opts: { newerThan?: string } = {}): string | null {
  const hosts = allowlist.entries.filter((e) => e.autoClick).map((e) => e.host);
  if (hosts.length === 0) return null;
  const newerThan = opts.newerThan ?? "1h";
  const fromClause = hosts.map((h) => `from:${h}`).join(" OR ");
  const subjectClause = `subject:(verify OR confirm OR activate OR "is this you")`;
  return [
    `newer_than:${newerThan}`,
    `(${fromClause})`,
    subjectClause,
    `-label:${PROCESSED_LABEL_NAME}`,
  ].join(" ");
}

export async function pollVerificationEmails(
  allowlist: Allowlist,
  opts: PollOptions = {},
): Promise<{ pending: PendingVerification[]; ambiguous: { messageId: string; reason: string }[] }> {
  const query = buildPollQuery(allowlist, opts.newerThan ? { newerThan: opts.newerThan } : {});
  if (!query) return { pending: [], ambiguous: [] };

  const client = opts.client ?? GmailClient.create(opts);
  const ids = await client.listMessages(query, opts.maxResults ?? 25);
  const pending: PendingVerification[] = [];
  const ambiguous: { messageId: string; reason: string }[] = [];
  for (const id of ids) {
    const msg = await client.getMessage(id);
    const body = extractBody(msg);
    try {
      const link = extractVerificationLink(body, allowlist);
      pending.push({
        messageId: id,
        threadId: msg.threadId,
        fromHeader: headerValue(msg, "From") ?? "",
        subject: headerValue(msg, "Subject") ?? "",
        link,
        body,
        internalDateMs: Number(msg.internalDate ?? "0"),
      });
    } catch (err) {
      if (err instanceof MultiLinkAmbiguousError) {
        ambiguous.push({ messageId: id, reason: err.message });
      } else {
        throw err;
      }
    }
  }
  return { pending, ambiguous };
}

/** Re-export for callers that just want the raw message helper. */
export type { GmailMessage };
