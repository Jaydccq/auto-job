import { describe, expect, it } from "vitest";

import { extractVerificationLink } from "../src/extract-link.js";
import { MultiLinkAmbiguousError } from "../src/errors.js";
import type { Allowlist } from "../src/allowlist.js";

function makeAllowlist(...hosts: string[]): Allowlist {
  const entries = hosts.map((h) => ({ host: h, autoClick: true }));
  const byHost = new Map(entries.map((e) => [e.host, e]));
  return { entries, byHost };
}

describe("extractVerificationLink", () => {
  it("returns the single allowlisted-host URL", () => {
    const body = `Hi,\n\nPlease confirm your email: https://wd5.myworkdayjobs.com/verify?token=abc.\n\nThanks.`;
    const url = extractVerificationLink(body, makeAllowlist("myworkdayjobs.com"));
    expect(url).toBe("https://wd5.myworkdayjobs.com/verify?token=abc");
  });

  it("strips trailing punctuation", () => {
    const body = `link here: https://a.greenhouse.io/x.`;
    const url = extractVerificationLink(body, makeAllowlist("greenhouse.io"));
    expect(url).toBe("https://a.greenhouse.io/x");
  });

  it("ignores non-allowlisted hosts even when they look like real links", () => {
    const body = `https://evil-clone.com/v + https://workday.com/v?t=1`;
    const url = extractVerificationLink(body, makeAllowlist("workday.com"));
    expect(url).toBe("https://workday.com/v?t=1");
  });

  it("throws MultiLinkAmbiguousError when zero matching hosts found", () => {
    const body = `nothing relevant here, https://random.example/`;
    expect(() => extractVerificationLink(body, makeAllowlist("workday.com"))).toThrow(
      MultiLinkAmbiguousError,
    );
  });

  it("throws MultiLinkAmbiguousError when 2+ matches found", () => {
    const body = `https://workday.com/a https://workday.com/b`;
    expect(() => extractVerificationLink(body, makeAllowlist("workday.com"))).toThrow(
      MultiLinkAmbiguousError,
    );
  });

  it("dedupes identical URLs", () => {
    const body = `link: https://workday.com/a\nfooter: https://workday.com/a`;
    const url = extractVerificationLink(body, makeAllowlist("workday.com"));
    expect(url).toBe("https://workday.com/a");
  });

  it("matches subdomains of allowlisted hosts", () => {
    const body = `https://wd5.myworkdayjobs.com/x`;
    const url = extractVerificationLink(body, makeAllowlist("myworkdayjobs.com"));
    expect(url).toBe("https://wd5.myworkdayjobs.com/x");
  });

  it("does NOT match suffix-only confusables", () => {
    const body = `https://fakemyworkdayjobs.com/x`;
    expect(() => extractVerificationLink(body, makeAllowlist("myworkdayjobs.com"))).toThrow(
      MultiLinkAmbiguousError,
    );
  });
});
