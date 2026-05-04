import { describe, expect, it } from "vitest";

import { AdapterParseError } from "../../src/errors.js";
import {
  GREENHOUSE_ADAPTER,
  searchGreenhouse,
} from "../../src/sites/greenhouse/index.js";

const SAMPLE_API_RESPONSE = {
  jobs: [
    {
      id: 4567890,
      title: "Senior Software Engineer, Payments",
      location: { name: "Remote, US" },
      departments: [{ name: "Engineering" }, { name: "Payments" }],
      offices: [{ name: "Remote — Americas" }],
      absolute_url: "https://boards.greenhouse.io/example/jobs/4567890",
      updated_at: "2026-05-01T12:00:00Z",
    },
    {
      id: 4567891,
      title: "Product Designer",
      location: { name: "New York, NY" },
      departments: [{ name: "Design" }],
      offices: [{ name: "New York" }],
      absolute_url: "https://boards.greenhouse.io/example/jobs/4567891",
      updated_at: "2026-05-02T08:30:00Z",
    },
  ],
};

function fakeTab(response: unknown, ok = true, status = 200) {
  return {
    url: "about:blank",
    async navigate() {},
    async fetch() {
      return {
        ok,
        status,
        statusText: ok ? "OK" : "Error",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(response),
        json: response,
        url: "https://boards-api.greenhouse.io/v1/boards/example/jobs",
      };
    },
  } as unknown as Parameters<typeof searchGreenhouse>[0];
}

describe("greenhouse adapter", () => {
  it("normalizes a typical board response", async () => {
    const r = await searchGreenhouse(fakeTab(SAMPLE_API_RESPONSE), { company: "example" });
    expect(r.source).toBe("greenhouse");
    expect(r.company).toBe("example");
    expect(r.totalAvailable).toBe(2);
    expect(r.count).toBe(2);
    expect(r.jobs).toHaveLength(2);
    expect(r.jobs[0]).toMatchObject({
      id: "4567890",
      title: "Senior Software Engineer, Payments",
      company: "example",
      location: "Remote, US",
      departments: ["Engineering", "Payments"],
      url: "https://boards.greenhouse.io/example/jobs/4567890",
    });
  });

  it("filters by department substring (case-insensitive)", async () => {
    const r = await searchGreenhouse(fakeTab(SAMPLE_API_RESPONSE), {
      company: "example",
      department: "design",
    });
    expect(r.count).toBe(1);
    expect(r.jobs[0]?.title).toBe("Product Designer");
    expect(r.totalAvailable).toBe(2);
  });

  it("filters by location substring", async () => {
    const r = await searchGreenhouse(fakeTab(SAMPLE_API_RESPONSE), {
      company: "example",
      location: "remote",
    });
    expect(r.count).toBe(1);
    expect(r.jobs[0]?.location).toBe("Remote, US");
  });

  it("respects limit", async () => {
    const r = await searchGreenhouse(fakeTab(SAMPLE_API_RESPONSE), {
      company: "example",
      limit: 1,
    });
    expect(r.count).toBe(1);
    expect(r.totalAvailable).toBe(2);
  });

  it("throws AdapterParseError on missing company slug", async () => {
    await expect(
      searchGreenhouse(fakeTab(SAMPLE_API_RESPONSE), { company: "" }),
    ).rejects.toBeInstanceOf(AdapterParseError);
  });

  it("throws AdapterParseError on HTTP non-OK", async () => {
    await expect(
      searchGreenhouse(fakeTab({ error: "not found" }, false, 404), { company: "ghost-co" }),
    ).rejects.toBeInstanceOf(AdapterParseError);
  });

  it("throws AdapterParseError on malformed response", async () => {
    await expect(
      searchGreenhouse(fakeTab({ jobs: "not-an-array" }), { company: "example" }),
    ).rejects.toBeInstanceOf(AdapterParseError);
  });

  it("registers in SITE_ADAPTERS via GREENHOUSE_ADAPTER export", () => {
    expect(GREENHOUSE_ADAPTER.meta.id).toBe("greenhouse");
    expect(GREENHOUSE_ADAPTER.search).toBe(searchGreenhouse);
  });
});
