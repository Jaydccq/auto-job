import { describe, expect, it } from "vitest";

import { AdapterParseError } from "../../src/errors.js";
import {
  WORKDAY_ADAPTER,
  parseWorkdayUrl,
  searchWorkday,
} from "../../src/sites/workday/index.js";

interface FakeFetchResult {
  ok?: boolean;
  status?: number;
  body?: unknown;
}

function makeFakeTab(
  handler: (url: string, init: { method?: string; body?: string } | undefined) => FakeFetchResult,
  navigationOptions: { staysOnOrigin?: boolean; finalUrl?: (requested: string) => string } = {},
) {
  const state = { url: "about:blank" };
  const stays = navigationOptions.staysOnOrigin ?? true;
  return {
    get url() {
      return state.url;
    },
    async navigate(toUrl: string) {
      // Default: navigation succeeds and tab lands on the requested URL.
      // For tests that simulate redirects (e.g. maintenance), pass a finalUrl resolver.
      if (navigationOptions.finalUrl) {
        state.url = navigationOptions.finalUrl(toUrl);
      } else if (stays) {
        state.url = toUrl;
      }
    },
    async fetch(url: string, init?: { method?: string; body?: string }) {
      const result = handler(url, init);
      const ok = result.ok ?? true;
      const bodyString =
        typeof result.body === "string" ? result.body : JSON.stringify(result.body ?? null);
      const json = typeof result.body === "object" ? result.body : undefined;
      return {
        ok,
        status: result.status ?? (ok ? 200 : 500),
        statusText: ok ? "OK" : "Error",
        headers: { "content-type": "application/json" },
        body: bodyString,
        json,
        url,
      };
    },
  } as unknown as Parameters<typeof searchWorkday>[0];
}

const WORKDAY_RESPONSE_2 = {
  total: 142,
  jobPostings: [
    {
      title: "Senior Software Engineer",
      externalPath: "/job/Seattle/Senior-SWE_R-12345",
      locationsText: "Seattle, WA, United States",
      postedOn: "Posted 5 Days Ago",
      bulletFields: ["R-12345"],
    },
    {
      title: "Principal Engineer, Platform",
      externalPath: "/job/Austin/Principal-Eng_R-67890",
      locationsText: "Austin, TX",
      postedOn: "Posted Yesterday",
      bulletFields: ["R-67890"],
    },
  ],
};

const WORKDAY_RESPONSE_EMPTY = { total: 0, jobPostings: [] };

describe("parseWorkdayUrl", () => {
  it("parses tenant + wdCenter + sitePath", () => {
    expect(
      parseWorkdayUrl("https://amazon.wd5.myworkdayjobs.com/External_Career_Site"),
    ).toEqual({
      tenant: "amazon",
      wdCenter: "wd5",
      sitePath: "External_Career_Site",
    });
  });

  it("normalizes tenant casing", () => {
    expect(parseWorkdayUrl("https://AMAZON.WD5.myworkdayjobs.com/External").tenant).toBe(
      "amazon",
    );
  });

  it("returns null sitePath when path is empty", () => {
    expect(parseWorkdayUrl("https://salesforce.wd1.myworkdayjobs.com/").sitePath).toBeNull();
  });

  it("throws for non-Workday hostnames", () => {
    expect(() => parseWorkdayUrl("https://example.com/jobs")).toThrow(AdapterParseError);
  });

  it("throws for malformed URLs", () => {
    expect(() => parseWorkdayUrl("not a url")).toThrow(AdapterParseError);
  });
});

describe("searchWorkday — happy paths", () => {
  it("parsed components input returns typed jobs", async () => {
    const tab = makeFakeTab((url) => {
      if (url.includes("/External_Career_Site/jobs")) {
        return { ok: true, status: 200, body: WORKDAY_RESPONSE_2 };
      }
      return { ok: false, status: 404, body: { error: "not found" } };
    });
    const r = await searchWorkday(tab, { tenant: "amazon", query: "swe", limit: 20 });
    expect(r.source).toBe("workday");
    expect(r.tenant).toBe("amazon");
    expect(r.wdCenter).toBe("wd5");
    expect(r.sitePath).toBe("External_Career_Site");
    expect(r.totalAvailable).toBe(142);
    expect(r.count).toBe(2);
    expect(r.jobs[0]).toMatchObject({
      id: "R-12345",
      title: "Senior Software Engineer",
      company: "amazon",
      location: "Seattle, WA, United States",
      postedAgo: "Posted 5 Days Ago",
    });
    expect(r.jobs[0]?.url).toContain("amazon.wd5.myworkdayjobs.com");
    expect(r.jobs[0]?.url).toContain("Senior-SWE_R-12345");
  });

  it("full URL input parses tenant/wdCenter/sitePath", async () => {
    const tab = makeFakeTab(() => ({ ok: true, body: WORKDAY_RESPONSE_2 }));
    const r = await searchWorkday(tab, {
      url: "https://salesforce.wd1.myworkdayjobs.com/External_Career_Site",
      query: "engineer",
    });
    expect(r.tenant).toBe("salesforce");
    expect(r.wdCenter).toBe("wd1");
    expect(r.sitePath).toBe("External_Career_Site");
    expect(r.url).toContain("salesforce.wd1.myworkdayjobs.com");
  });
});

describe("searchWorkday — sitePath probing", () => {
  it("navigation-based probe: first candidate redirects, second stays on origin", async () => {
    const targetHost = "weirdco.wd5.myworkdayjobs.com";
    const calls: string[] = [];
    const tab = makeFakeTab(
      (url) => {
        calls.push(url);
        return { ok: true, body: WORKDAY_RESPONSE_2 };
      },
      {
        finalUrl: (requested) => {
          // First probe (External_Career_Site) "redirects" away from origin (off-host URL).
          if (requested.includes("/External_Career_Site"))
            return "https://community.workday.com/maintenance-page";
          // Second probe (Careers) stays on origin.
          return requested;
        },
      },
    );
    const r = await searchWorkday(tab, { tenant: "weirdco" });
    expect(r.sitePath).toBe("Careers");
    expect(r.tenant).toBe("weirdco");
    // After resolveTarget, only ONE fetch happens (the main API call).
    expect(calls.length).toBe(1);
    expect(calls[0]).toContain(`https://${targetHost}/wday/cxs/weirdco/Careers/jobs`);
  });

  it("probe exhaustion throws with tenant in message", async () => {
    const tab = makeFakeTab(
      () => ({ ok: true, body: WORKDAY_RESPONSE_2 }),
      { finalUrl: () => "https://community.workday.com/maintenance-page" },
    );
    await expect(searchWorkday(tab, { tenant: "ghostco" })).rejects.toThrow(
      /ghostco.*(scheduled maintenance|could not auto-detect sitePath)/,
    );
  });
});

describe("searchWorkday — error paths", () => {
  it("HTTP non-OK throws AdapterParseError with status", async () => {
    const tab = makeFakeTab(() => ({ ok: false, status: 503, body: { error: "service unavailable" } }));
    await expect(
      searchWorkday(tab, { tenant: "amazon", sitePath: "External_Career_Site" }),
    ).rejects.toThrow(/workday HTTP 503/);
  });

  it("403/429 throws with access-denied message", async () => {
    const tab = makeFakeTab(() => ({ ok: false, status: 403, body: { error: "blocked" } }));
    await expect(
      searchWorkday(tab, { tenant: "amazon", sitePath: "External_Career_Site" }),
    ).rejects.toThrow(/access denied \(HTTP 403\)/);
  });

  it("schema mismatch throws", async () => {
    const tab = makeFakeTab(() => ({ ok: true, body: { unexpected: "shape" } }));
    await expect(
      searchWorkday(tab, { tenant: "amazon", sitePath: "External_Career_Site" }),
    ).rejects.toThrow(/workday: schema mismatch/);
  });

  it("empty board returns success with count: 0", async () => {
    const tab = makeFakeTab(() => ({ ok: true, body: WORKDAY_RESPONSE_EMPTY }));
    const r = await searchWorkday(tab, { tenant: "amazon", sitePath: "External_Career_Site" });
    expect(r.count).toBe(0);
    expect(r.totalAvailable).toBe(0);
    expect(r.jobs).toEqual([]);
  });

  it("missing tenant and url throws", async () => {
    const tab = makeFakeTab(() => ({ ok: true, body: WORKDAY_RESPONSE_2 }));
    await expect(searchWorkday(tab, {})).rejects.toThrow(/workday: tenant or url is required/);
  });

  it("tenant in maintenance (navigation lands off-origin) throws helpful message", async () => {
    const tab = makeFakeTab(
      () => ({ ok: true, body: WORKDAY_RESPONSE_2 }),
      { finalUrl: () => "https://community.workday.com/maintenance-page" },
    );
    await expect(
      searchWorkday(tab, { tenant: "amazon", sitePath: "External_Career_Site" }),
    ).rejects.toThrow(/redirected away from origin/);
  });
});

describe("WORKDAY_ADAPTER export", () => {
  it("registers in SITE_ADAPTERS via WORKDAY_ADAPTER export", () => {
    expect(WORKDAY_ADAPTER.meta.id).toBe("workday");
    expect(WORKDAY_ADAPTER.meta.requiresAuth).toBe(false);
    expect(WORKDAY_ADAPTER.search).toBe(searchWorkday);
  });
});
