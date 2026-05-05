import { describe, expect, it, vi } from "vitest";

import { buildPollQuery, pollVerificationEmails, PROCESSED_LABEL_NAME } from "../src/poll.js";
import type { Allowlist } from "../src/allowlist.js";
import { GmailClient } from "../src/gmail.js";

function makeAllowlist(hosts: { host: string; autoClick: boolean }[]): Allowlist {
  const entries = hosts.map((h) => ({ host: h.host, autoClick: h.autoClick }));
  const byHost = new Map(entries.map((e) => [e.host, e]));
  return { entries, byHost };
}

describe("buildPollQuery", () => {
  it("returns null when no hosts opted in", () => {
    const q = buildPollQuery(makeAllowlist([]));
    expect(q).toBeNull();
  });

  it("includes only auto_click=true hosts", () => {
    const q = buildPollQuery(
      makeAllowlist([
        { host: "workday.com", autoClick: true },
        { host: "icims.com", autoClick: false },
      ]),
    );
    expect(q).toContain("from:workday.com");
    expect(q).not.toContain("from:icims.com");
  });

  it("excludes the processed label", () => {
    const q = buildPollQuery(makeAllowlist([{ host: "x.com", autoClick: true }]));
    expect(q).toContain(`-label:${PROCESSED_LABEL_NAME}`);
  });

  it("respects newerThan override", () => {
    const q = buildPollQuery(makeAllowlist([{ host: "x.com", autoClick: true }]), {
      newerThan: "6h",
    });
    expect(q).toContain("newer_than:6h");
  });
});

describe("pollVerificationEmails", () => {
  it("returns empty when allowlist has no auto_click hosts", async () => {
    const result = await pollVerificationEmails(makeAllowlist([]));
    expect(result.pending).toEqual([]);
  });

  it("uses the injected client and parses pending entries", async () => {
    const allowlist = makeAllowlist([{ host: "workday.com", autoClick: true }]);
    const client = {
      listMessages: vi.fn().mockResolvedValue(["m1"]),
      getMessage: vi.fn().mockResolvedValue({
        id: "m1",
        threadId: "t1",
        internalDate: "1234",
        payload: {
          headers: [
            { name: "From", value: "verify@workday.com" },
            { name: "Subject", value: "Confirm your email" },
          ],
          body: { data: Buffer.from("Click https://wd5.workday.com/verify?t=1").toString("base64url") },
        },
      }),
    } as unknown as GmailClient;

    const result = await pollVerificationEmails(allowlist, { client });
    expect(client.listMessages).toHaveBeenCalledTimes(1);
    expect(result.pending).toHaveLength(1);
    expect(result.pending[0]?.link).toBe("https://wd5.workday.com/verify?t=1");
    expect(result.pending[0]?.subject).toBe("Confirm your email");
  });

  it("collects ambiguous emails separately", async () => {
    const allowlist = makeAllowlist([{ host: "workday.com", autoClick: true }]);
    const client = {
      listMessages: vi.fn().mockResolvedValue(["m1"]),
      getMessage: vi.fn().mockResolvedValue({
        id: "m1",
        threadId: "t1",
        internalDate: "1",
        payload: {
          headers: [{ name: "From", value: "x@workday.com" }],
          body: {
            data: Buffer.from("https://workday.com/a https://workday.com/b").toString("base64url"),
          },
        },
      }),
    } as unknown as GmailClient;
    const result = await pollVerificationEmails(allowlist, { client });
    expect(result.pending).toEqual([]);
    expect(result.ambiguous).toHaveLength(1);
  });
});
