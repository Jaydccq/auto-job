import { describe, expect, it } from "vitest";

import { AdapterParseError } from "../../src/errors.js";
import {
  ICIMS_ADAPTER,
  parseICIMSUrl,
  searchICIMS,
} from "../../src/sites/icims/index.js";

interface FakeFetchResult {
  ok?: boolean;
  status?: number;
  body?: unknown;
}

interface FakeTabBehavior {
  fetch?: (url: string) => FakeFetchResult;
  /** Function the test wants the in-page parser to "return". */
  evaluate?: (script: string) => unknown;
}

function makeFakeTab(behavior: FakeTabBehavior) {
  return {
    url: "about:blank",
    async navigate() {},
    async fetch(url: string) {
      const result = behavior.fetch?.(url) ?? { ok: false, status: 500, body: {} };
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
    async evaluate(script: string) {
      if (!behavior.evaluate) throw new Error("fakeTab.evaluate not configured");
      return behavior.evaluate(script);
    },
  } as unknown as Parameters<typeof searchICIMS>[0];
}

const V3_RESPONSE_OK = {
  totalCount: 8,
  jobs: [
    {
      id: 12345,
      title: "Imagineer, Software Engineering",
      locations: [{ name: "Anaheim, CA" }],
      postedDate: "2026-04-30",
      url: "https://careers-disney.icims.com/jobs/12345/imagineer/job",
    },
    {
      id: 67890,
      title: "Senior DevOps Engineer",
      location: "Burbank, CA",
      postedAt: "2026-05-01",
    },
  ],
};

const V3_RESPONSE_EMPTY = { totalCount: 0, jobs: [] };

const V3_RESPONSE_UNKNOWN_SHAPE = {
  data: { weird: "shape" },
};

describe("parseICIMSUrl", () => {
  it("parses tenant from careers-<tenant>.icims.com", () => {
    expect(parseICIMSUrl("https://careers-disney.icims.com/jobs/search").tenant).toBe("disney");
  });

  it("parses tenant from <tenant>.icims.com", () => {
    expect(parseICIMSUrl("https://comcast.icims.com/jobs/search").tenant).toBe("comcast");
  });

  it("normalizes casing", () => {
    expect(parseICIMSUrl("https://CAREERS-DISNEY.icims.com/").tenant).toBe("disney");
  });

  it("throws for non-iCIMS hostnames", () => {
    expect(() => parseICIMSUrl("https://example.com/jobs")).toThrow(AdapterParseError);
  });

  it("throws for malformed URLs", () => {
    expect(() => parseICIMSUrl("not a url")).toThrow(AdapterParseError);
  });
});

describe("searchICIMS — v3 API path", () => {
  it("v3 happy path returns typed jobs with resolvedVia: v3-api", async () => {
    const tab = makeFakeTab({
      fetch: (url) =>
        url.includes("/api/v3/jobs") ? { ok: true, body: V3_RESPONSE_OK } : { ok: false, status: 404, body: {} },
    });
    const r = await searchICIMS(tab, { tenant: "disney", query: "engineer" });
    expect(r.source).toBe("icims");
    expect(r.tenant).toBe("disney");
    expect(r.resolvedVia).toBe("v3-api");
    expect(r.totalAvailable).toBe(8);
    expect(r.count).toBe(2);
    expect(r.jobs[0]).toMatchObject({
      id: "12345",
      title: "Imagineer, Software Engineering",
      company: "disney",
      location: "Anaheim, CA",
    });
    // Second job uses scalar `location` field
    expect(r.jobs[1]?.location).toBe("Burbank, CA");
  });

  it("v3 empty board returns success (count: 0)", async () => {
    const tab = makeFakeTab({
      fetch: (url) =>
        url.includes("/api/v3/jobs") ? { ok: true, body: V3_RESPONSE_EMPTY } : { ok: false, status: 404, body: {} },
    });
    const r = await searchICIMS(tab, { tenant: "disney" });
    expect(r.count).toBe(0);
    expect(r.totalAvailable).toBe(0);
    expect(r.jobs).toEqual([]);
    expect(r.resolvedVia).toBe("v3-api");
  });
});

describe("searchICIMS — HTML fallback path", () => {
  it("v3 returns 404, HTML succeeds with resolvedVia: html-scrape", async () => {
    const tab = makeFakeTab({
      fetch: (url) => {
        if (url.includes("/api/v3/jobs")) return { ok: false, status: 404, body: {} };
        return { ok: true, body: "<html><body>" + "x".repeat(300) + "</body></html>" };
      },
      evaluate: () => ({
        jobs: [
          {
            id: "JOB-1",
            title: "Software Developer",
            company: "comcast",
            location: "Philadelphia, PA",
            postedAt: "1 day ago",
            url: "https://careers-comcast.icims.com/jobs/JOB-1/job",
          },
        ],
        totalAvailable: 47,
        empty: false,
      }),
    });
    const r = await searchICIMS(tab, { tenant: "comcast", query: "dev" });
    expect(r.resolvedVia).toBe("html-scrape");
    expect(r.count).toBe(1);
    expect(r.totalAvailable).toBe(47);
    expect(r.jobs[0]?.title).toBe("Software Developer");
  });

  it("v3 returns unknown shape, HTML succeeds", async () => {
    const tab = makeFakeTab({
      fetch: (url) => {
        if (url.includes("/api/v3/jobs")) return { ok: true, body: V3_RESPONSE_UNKNOWN_SHAPE };
        return { ok: true, body: "<html><body>" + "x".repeat(300) + "</body></html>" };
      },
      evaluate: () => ({
        jobs: [{ id: "X1", title: "Test Job", company: "comcast", location: "", postedAt: "", url: "" }],
        totalAvailable: 1,
        empty: false,
      }),
    });
    const r = await searchICIMS(tab, { tenant: "comcast" });
    expect(r.resolvedVia).toBe("html-scrape");
    expect(r.count).toBe(1);
  });

  it("HTML reports empty board (success)", async () => {
    const tab = makeFakeTab({
      fetch: (url) => {
        if (url.includes("/api/v3/jobs")) return { ok: false, status: 404, body: {} };
        return { ok: true, body: "<html><body>" + "x".repeat(300) + "</body></html>" };
      },
      evaluate: () => ({ jobs: [], totalAvailable: 0, empty: true }),
    });
    const r = await searchICIMS(tab, { tenant: "ghostco" });
    expect(r.count).toBe(0);
    expect(r.resolvedVia).toBe("html-scrape");
  });
});

describe("searchICIMS — error paths", () => {
  it("schema drift: HTML present but parser yields no jobs throws", async () => {
    const tab = makeFakeTab({
      fetch: (url) => {
        if (url.includes("/api/v3/jobs")) return { ok: false, status: 404, body: {} };
        return { ok: true, body: "<html><body>" + "x".repeat(300) + "</body></html>" };
      },
      evaluate: () => ({ jobs: [], totalAvailable: 0, empty: false }),
    });
    await expect(searchICIMS(tab, { tenant: "weirdco" })).rejects.toThrow(
      /icims: response present but parser found no jobs.*tenant weirdco/,
    );
  });

  it("both mechanisms fail throws", async () => {
    const tab = makeFakeTab({
      fetch: () => ({ ok: false, status: 500, body: { error: "server" } }),
    });
    await expect(searchICIMS(tab, { tenant: "deadco" })).rejects.toThrow(
      /icims: tried v3 API and HTML scrape, both failed.*tenant deadco/,
    );
  });

  it("missing tenant and url throws", async () => {
    const tab = makeFakeTab({});
    await expect(searchICIMS(tab, {})).rejects.toThrow(/icims: tenant or url is required/);
  });
});

describe("ICIMS_ADAPTER export", () => {
  it("registers in SITE_ADAPTERS via ICIMS_ADAPTER export", () => {
    expect(ICIMS_ADAPTER.meta.id).toBe("icims");
    expect(ICIMS_ADAPTER.meta.requiresAuth).toBe(false);
    expect(ICIMS_ADAPTER.search).toBe(searchICIMS);
  });
});
