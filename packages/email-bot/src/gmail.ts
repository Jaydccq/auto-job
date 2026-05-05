/**
 * Minimal Gmail API client for email-bot.
 *
 * Reuses the same on-disk credentials as scripts/gmail-oauth-refresh.mjs:
 *   - config/gmail-oauth-credentials.json (client id/secret)
 *   - config/gmail-oauth-token.json      (access + refresh token)
 *
 * Scope: gmail.readonly is enough for poll. To add the `auto-job/processed`
 * label we ALSO need gmail.modify; document that callers must re-run
 * `npm run gmail:auth` with the broader scope when they want labeling on.
 *
 * The bot fails closed if the token can't be refreshed (GmailAuthError).
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { mkdirSync } from "node:fs";

import { GmailAuthError } from "./errors.js";

const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";

export interface GmailOptions {
  credentialsPath?: string;
  tokenPath?: string;
  /** Override fetch (used by tests). */
  fetchImpl?: typeof fetch;
  /** Override "now" (used by tests for token expiry math). */
  nowMs?: number;
}

interface OAuthCredentials {
  client_id?: string;
  client_secret?: string;
  installed?: { client_id?: string; client_secret?: string };
}

export interface OAuthToken {
  access_token: string;
  refresh_token?: string;
  expiry_date?: number; // ms epoch
  token_type?: string;
  scope?: string;
}

export interface GmailMessageHeader {
  name: string;
  value: string;
}

export interface GmailMessage {
  id: string;
  threadId: string;
  labelIds?: string[];
  snippet?: string;
  internalDate?: string;
  payload?: {
    headers?: GmailMessageHeader[];
    body?: { data?: string };
    parts?: GmailMessage["payload"][];
    mimeType?: string;
  };
}

const DEFAULT_CREDENTIALS = "config/gmail-oauth-credentials.json";
const DEFAULT_TOKEN = "config/gmail-oauth-token.json";

export class GmailClient {
  constructor(
    private readonly credentialsPath: string,
    private readonly tokenPath: string,
    private readonly fetchImpl: typeof fetch,
    private readonly nowMs: () => number,
  ) {}

  static create(opts: GmailOptions = {}): GmailClient {
    return new GmailClient(
      opts.credentialsPath ?? DEFAULT_CREDENTIALS,
      opts.tokenPath ?? DEFAULT_TOKEN,
      opts.fetchImpl ?? fetch,
      opts.nowMs !== undefined ? () => opts.nowMs! : () => Date.now(),
    );
  }

  private readToken(): OAuthToken {
    if (!existsSync(this.tokenPath)) {
      throw new GmailAuthError(`token file missing at ${this.tokenPath}`);
    }
    const raw = readFileSync(this.tokenPath, "utf-8");
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new GmailAuthError(`token file at ${this.tokenPath} is not valid JSON`);
    }
    const t = parsed as OAuthToken;
    if (!t || typeof t !== "object" || typeof t.access_token !== "string") {
      throw new GmailAuthError(`token file at ${this.tokenPath} missing access_token`);
    }
    return t;
  }

  private readCredentials(): { clientId: string; clientSecret: string } {
    if (!existsSync(this.credentialsPath)) {
      throw new GmailAuthError(`credentials file missing at ${this.credentialsPath}`);
    }
    const raw = readFileSync(this.credentialsPath, "utf-8");
    let parsed: OAuthCredentials;
    try {
      parsed = JSON.parse(raw) as OAuthCredentials;
    } catch {
      throw new GmailAuthError(`credentials file is not valid JSON`);
    }
    const clientId = parsed.client_id ?? parsed.installed?.client_id ?? "";
    const clientSecret = parsed.client_secret ?? parsed.installed?.client_secret ?? "";
    if (!clientId || !clientSecret) {
      throw new GmailAuthError(`credentials file missing client_id/client_secret`);
    }
    return { clientId, clientSecret };
  }

  private async ensureFreshToken(): Promise<string> {
    const t = this.readToken();
    const expired = typeof t.expiry_date === "number" && t.expiry_date < this.nowMs() + 60_000;
    if (!expired) return t.access_token;
    if (!t.refresh_token) {
      throw new GmailAuthError("token expired and no refresh_token present");
    }
    const { clientId, clientSecret } = this.readCredentials();
    const body = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: t.refresh_token,
      grant_type: "refresh_token",
    });
    const resp = await this.fetchImpl(TOKEN_ENDPOINT, {
      method: "POST",
      body,
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
    if (!resp.ok) {
      throw new GmailAuthError(`token refresh HTTP ${resp.status}`);
    }
    const refreshed = (await resp.json()) as { access_token?: string; expires_in?: number };
    if (!refreshed.access_token) {
      throw new GmailAuthError(`token refresh response missing access_token`);
    }
    const next: OAuthToken = {
      ...t,
      access_token: refreshed.access_token,
      expiry_date: this.nowMs() + (refreshed.expires_in ?? 3600) * 1000,
    };
    mkdirSync(dirname(this.tokenPath), { recursive: true });
    writeFileSync(this.tokenPath, JSON.stringify(next, null, 2), "utf-8");
    return refreshed.access_token;
  }

  /**
   * Search for messages matching a Gmail query, return ids only.
   */
  async listMessages(query: string, maxResults = 25): Promise<string[]> {
    const token = await this.ensureFreshToken();
    const url = new URL(`${GMAIL_API}/messages`);
    url.searchParams.set("q", query);
    url.searchParams.set("maxResults", String(maxResults));
    const resp = await this.fetchImpl(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!resp.ok) throw new GmailAuthError(`Gmail list HTTP ${resp.status}`);
    const body = (await resp.json()) as { messages?: { id: string }[] };
    return (body.messages ?? []).map((m) => m.id);
  }

  /**
   * Fetch a full message (format=full) so we get headers + body parts.
   */
  async getMessage(id: string): Promise<GmailMessage> {
    const token = await this.ensureFreshToken();
    const url = `${GMAIL_API}/messages/${encodeURIComponent(id)}?format=full`;
    const resp = await this.fetchImpl(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!resp.ok) throw new GmailAuthError(`Gmail get HTTP ${resp.status}`);
    return (await resp.json()) as GmailMessage;
  }

  /**
   * Apply a label to a message. Caller is responsible for label id resolution
   * (via labelByName).
   */
  async addLabel(messageId: string, labelId: string): Promise<void> {
    const token = await this.ensureFreshToken();
    const url = `${GMAIL_API}/messages/${encodeURIComponent(messageId)}/modify`;
    const resp = await this.fetchImpl(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ addLabelIds: [labelId] }),
    });
    if (!resp.ok) throw new GmailAuthError(`Gmail label HTTP ${resp.status}`);
  }

  /**
   * Look up a label by exact name (case-sensitive).
   */
  async findLabelByName(name: string): Promise<string | null> {
    const token = await this.ensureFreshToken();
    const resp = await this.fetchImpl(`${GMAIL_API}/labels`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!resp.ok) throw new GmailAuthError(`Gmail labels HTTP ${resp.status}`);
    const body = (await resp.json()) as { labels?: { id: string; name: string }[] };
    return body.labels?.find((l) => l.name === name)?.id ?? null;
  }

  /**
   * Create a label if it doesn't already exist; return its id.
   */
  async ensureLabel(name: string): Promise<string> {
    const existing = await this.findLabelByName(name);
    if (existing) return existing;
    const token = await this.ensureFreshToken();
    const resp = await this.fetchImpl(`${GMAIL_API}/labels`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name,
        labelListVisibility: "labelShow",
        messageListVisibility: "show",
      }),
    });
    if (!resp.ok) throw new GmailAuthError(`Gmail create-label HTTP ${resp.status}`);
    const body = (await resp.json()) as { id: string };
    return body.id;
  }
}

/** Decode a base64url-encoded Gmail body part. */
export function decodeBase64Url(s: string): string {
  const padded = s.replace(/-/g, "+").replace(/_/g, "/").padEnd(s.length + ((4 - (s.length % 4)) % 4), "=");
  return Buffer.from(padded, "base64").toString("utf-8");
}

/** Recursively pull text/html and text/plain bodies out of a Gmail message. */
export function extractBody(msg: GmailMessage): string {
  const parts: string[] = [];
  function visit(p: GmailMessage["payload"] | undefined): void {
    if (!p) return;
    if (p.body?.data) parts.push(decodeBase64Url(p.body.data));
    for (const child of p.parts ?? []) visit(child);
  }
  visit(msg.payload);
  return parts.join("\n");
}

/** Headers helper. */
export function headerValue(msg: GmailMessage, name: string): string | undefined {
  const headers = msg.payload?.headers ?? [];
  return headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value;
}
