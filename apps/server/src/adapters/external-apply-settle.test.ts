import { describe, expect, test } from "vitest";

import {
  isLinkedInHost,
  isOffsiteHttpUrl,
  preferredUrlFromTabState,
  settleFinalUrl,
  type TabUrlState,
} from "./external-apply-settle.js";

describe("isLinkedInHost", () => {
  test("matches linkedin.com and subdomains", () => {
    expect(isLinkedInHost("linkedin.com")).toBe(true);
    expect(isLinkedInHost("www.linkedin.com")).toBe(true);
    expect(isLinkedInHost("LINKEDIN.COM")).toBe(true);
    expect(isLinkedInHost("careers.linkedin.com")).toBe(true);
  });

  test("rejects other hosts (including LinkedIn-adjacent)", () => {
    expect(isLinkedInHost("greenhouse.io")).toBe(false);
    expect(isLinkedInHost("notlinkedin.com")).toBe(false);
    expect(isLinkedInHost("media.licdn.com")).toBe(false);
  });
});

describe("isOffsiteHttpUrl", () => {
  test("accepts ATS hosts", () => {
    expect(isOffsiteHttpUrl("https://boards.greenhouse.io/x/jobs/123")).toBe(true);
    expect(isOffsiteHttpUrl("https://jobs.lever.co/example/abc")).toBe(true);
  });

  test("rejects LinkedIn URLs (the bug we are fixing)", () => {
    expect(isOffsiteHttpUrl("https://www.linkedin.com/jobs/view/4347121472"))
      .toBe(false);
    expect(isOffsiteHttpUrl(
      "https://www.linkedin.com/jobs/view/123/apply/external?redirect=...",
    )).toBe(false);
  });

  test("rejects non-http schemes and garbage", () => {
    expect(isOffsiteHttpUrl("ftp://example.com")).toBe(false);
    expect(isOffsiteHttpUrl("javascript:alert(1)")).toBe(false);
    expect(isOffsiteHttpUrl("not a url")).toBe(false);
    expect(isOffsiteHttpUrl("")).toBe(false);
  });
});

describe("preferredUrlFromTabState", () => {
  test("prefers canonical over og:url over href", () => {
    const state: TabUrlState = {
      href: "https://example.com/raw",
      canonical: "https://example.com/canonical",
      ogUrl: "https://example.com/og",
    };
    expect(preferredUrlFromTabState(state)).toBe("https://example.com/canonical");
  });

  test("falls back to og:url when canonical is missing", () => {
    expect(preferredUrlFromTabState({
      href: "https://example.com/raw",
      ogUrl: "https://example.com/og",
    })).toBe("https://example.com/og");
  });

  test("falls back to href when canonical and og:url are missing", () => {
    expect(preferredUrlFromTabState({ href: "https://example.com/raw" }))
      .toBe("https://example.com/raw");
  });

  test("strips fragments", () => {
    expect(preferredUrlFromTabState({ href: "https://example.com/x#frag" }))
      .toBe("https://example.com/x");
  });

  test("returns null for non-http URLs", () => {
    expect(preferredUrlFromTabState({ href: "javascript:0" })).toBeNull();
  });
});

/**
 * Build a polling function that returns each state in order, then keeps
 * returning the last state forever (simulating an idle tab).
 */
function pollSequence(states: readonly TabUrlState[]): () => Promise<TabUrlState | null> {
  let i = 0;
  return async () => {
    const state = i < states.length ? states[i] : states[states.length - 1];
    if (i < states.length) i += 1;
    return state ?? null;
  };
}

/** Like pollSequence but returns null after the sequence ends (tab closed). */
function pollSequenceThenNull(
  states: readonly TabUrlState[],
): () => Promise<TabUrlState | null> {
  let i = 0;
  return async () => {
    if (i < states.length) {
      const state = states[i];
      i += 1;
      return state ?? null;
    }
    return null;
  };
}

describe("settleFinalUrl", () => {
  test("returns the ATS URL when LinkedIn redirects to a stable offsite host (the bug fix)", async () => {
    const poll = pollSequence([
      // Tab opens on LinkedIn intermediate.
      {
        href: "https://www.linkedin.com/jobs/view/123/apply/external?redirect=...",
        readyState: "loading",
      },
      // Redirects through LinkedIn analytics.
      {
        href: "https://www.linkedin.com/redir/redirect?url=...",
        readyState: "loading",
      },
      // Lands on the ATS — first sighting.
      {
        href: "https://boards.greenhouse.io/example/jobs/12345",
        readyState: "interactive",
      },
      // Same URL, page complete. Should count toward stable window.
      {
        href: "https://boards.greenhouse.io/example/jobs/12345",
        readyState: "complete",
      },
      // Same URL again — stable.
      {
        href: "https://boards.greenhouse.io/example/jobs/12345",
        readyState: "complete",
      },
    ]);

    const result = await settleFinalUrl(poll, { intervalMs: 5, stableMs: 5, maxMs: 1_000 });
    expect(result.finalUrl).toBe("https://boards.greenhouse.io/example/jobs/12345");
    expect(result.reason === "stable" || result.reason === "host-stable").toBe(true);
  });

  test("prefers <link rel=canonical> when present", async () => {
    const poll = pollSequence([
      {
        href: "https://boards.greenhouse.io/example/jobs/12345?gh_jid=123",
        canonical: "https://boards.greenhouse.io/example/jobs/12345",
        readyState: "complete",
      },
      {
        href: "https://boards.greenhouse.io/example/jobs/12345?gh_jid=123",
        canonical: "https://boards.greenhouse.io/example/jobs/12345",
        readyState: "complete",
      },
    ]);
    const result = await settleFinalUrl(poll, { intervalMs: 5, stableMs: 5, maxMs: 1_000 });
    expect(result.finalUrl).toBe("https://boards.greenhouse.io/example/jobs/12345");
  });

  test("returns null when the tab never leaves linkedin.com", async () => {
    const poll = pollSequence([
      { href: "https://www.linkedin.com/jobs/view/123", readyState: "complete" },
      { href: "https://www.linkedin.com/jobs/view/123", readyState: "complete" },
      { href: "https://www.linkedin.com/jobs/view/123", readyState: "complete" },
    ]);
    const result = await settleFinalUrl(poll, { intervalMs: 5, stableMs: 5, maxMs: 200 });
    expect(result.finalUrl).toBeNull();
    expect(result.reason).toBe("timeout");
  });

  test("returns null when the tab is closed before reaching offsite", async () => {
    const poll = pollSequenceThenNull([
      { href: "https://www.linkedin.com/jobs/view/123/apply/external", readyState: "loading" },
    ]);
    const result = await settleFinalUrl(poll, { intervalMs: 5, stableMs: 5, maxMs: 1_000 });
    expect(result.finalUrl).toBeNull();
    expect(result.reason).toBe("timeout");
  });

  test("uses host-stable when ATS URL keeps mutating with tracking params", async () => {
    const base = "https://jobs.lever.co/acme/abc-123";
    const poll = pollSequence([
      { href: "https://www.linkedin.com/jobs/view/123/apply/external", readyState: "loading" },
      { href: `${base}?ref=linkedin&utm_source=feed&utm_id=1`, readyState: "interactive" },
      { href: `${base}?ref=linkedin&utm_source=feed&utm_id=2`, readyState: "complete" },
      { href: `${base}?ref=linkedin&utm_source=feed&utm_id=3`, readyState: "complete" },
      { href: `${base}?ref=linkedin&utm_source=feed&utm_id=4`, readyState: "complete" },
    ]);
    const result = await settleFinalUrl(poll, { intervalMs: 5, stableMs: 5, maxMs: 1_000 });
    expect(result.finalUrl?.startsWith(base)).toBe(true);
    expect(["stable", "host-stable"]).toContain(result.reason);
  });

  test("times out within maxMs even on a permanently-loading tab", async () => {
    const poll = pollSequence([
      { href: "https://www.linkedin.com/jobs/view/x/apply/external", readyState: "loading" },
    ]);
    const start = Date.now();
    const result = await settleFinalUrl(poll, { intervalMs: 5, stableMs: 5, maxMs: 80 });
    const elapsed = Date.now() - start;
    expect(result.finalUrl).toBeNull();
    expect(result.reason).toBe("timeout");
    // generous upper bound to dodge CI flakiness
    expect(elapsed).toBeLessThan(2_000);
  });

  test("strips fragments from the picked URL", async () => {
    const poll = pollSequence([
      { href: "https://boards.greenhouse.io/example/jobs/1#hash", readyState: "complete" },
      { href: "https://boards.greenhouse.io/example/jobs/1#hash", readyState: "complete" },
    ]);
    const result = await settleFinalUrl(poll, { intervalMs: 5, stableMs: 5, maxMs: 500 });
    expect(result.finalUrl).toBe("https://boards.greenhouse.io/example/jobs/1");
  });

  test("returns null on tab close after a single transient offsite sighting (codex-warn-2)", async () => {
    // Without the confirmation rule, this would return the transient ATS
    // URL. With the rule, a single sighting that closes immediately is not
    // promoted to finalUrl.
    const poll = pollSequenceThenNull([
      { href: "https://www.linkedin.com/jobs/view/x/apply/external", readyState: "loading" },
      { href: "https://flaky-ats.example.com/job", readyState: "loading" },
      // tab closes — return null
    ]);
    const result = await settleFinalUrl(poll, { intervalMs: 5, stableMs: 50, maxMs: 1_000 });
    expect(result.finalUrl).toBeNull();
    expect(result.reason).toBe("timeout");
  });

  test("does NOT mark stable when URL flaps ATS->LinkedIn->ATS (codex-warn-flap)", async () => {
    // A flap to LinkedIn between two ATS sightings must reset the stability
    // window. Otherwise the first short ATS visit + the third reading would
    // be summed into a false stable.
    const poll = pollSequence([
      { href: "https://ats.example.com/job", readyState: "loading" },         // tracked
      { href: "https://www.linkedin.com/jobs/view/x", readyState: "loading" }, // resets
      { href: "https://ats.example.com/job", readyState: "loading" },         // tracked again — but timer must be from here
      // No more time — should NOT be confirmed.
    ]);
    // stableMs is larger than the time the second ATS sighting has been held.
    const result = await settleFinalUrl(poll, { intervalMs: 5, stableMs: 100, maxMs: 60 });
    expect(result.finalUrl).toBeNull();
    expect(result.reason).toBe("timeout");
  });

  test("ignores non-http URLs (javascript:, about:blank)", async () => {
    const poll = pollSequence([
      { href: "about:blank", readyState: "loading" },
      { href: "javascript:0", readyState: "loading" },
      { href: "https://www.linkedin.com/jobs/view/x", readyState: "complete" },
      { href: "https://www.linkedin.com/jobs/view/x", readyState: "complete" },
    ]);
    const result = await settleFinalUrl(poll, { intervalMs: 5, stableMs: 5, maxMs: 200 });
    expect(result.finalUrl).toBeNull();
  });
});
