import { describe, expect, it } from "vitest";

import {
  SITE_ADAPTERS,
  SITE_IDS,
  getSiteAdapter,
  isKnownSiteId,
  listSiteMetas,
} from "../../src/sites/registry.js";

describe("site registry", () => {
  it("includes the four search-style adapters by stable id", () => {
    expect(SITE_IDS).toEqual(["builtin", "indeed", "jobright", "greenhouse"]);
  });

  it("each registered adapter has a SiteAdapterMeta with id matching the registry key", () => {
    for (const id of SITE_IDS) {
      const a = SITE_ADAPTERS[id];
      expect(a.meta.id).toBe(id);
      expect(typeof a.meta.name).toBe("string");
      expect(a.meta.name.length).toBeGreaterThan(0);
      expect(typeof a.meta.domain).toBe("string");
      expect(a.meta.domain.length).toBeGreaterThan(0);
      expect(typeof a.meta.requiresAuth).toBe("boolean");
      expect(typeof a.meta.description).toBe("string");
      expect(typeof a.search).toBe("function");
    }
  });

  it("listSiteMetas mirrors registry order and exposes safe-to-ship fields only", () => {
    const metas = listSiteMetas();
    expect(metas.map((m) => m.id)).toEqual([...SITE_IDS]);
    for (const m of metas) {
      // Should NOT leak the search function via the meta surface.
      expect(m).not.toHaveProperty("search");
    }
  });

  it("getSiteAdapter returns the registered adapter for known ids", () => {
    const a = getSiteAdapter("greenhouse");
    expect(a.meta.id).toBe("greenhouse");
    expect(a.meta.requiresAuth).toBe(false);
  });

  it("getSiteAdapter throws a helpful error for unknown ids", () => {
    expect(() => getSiteAdapter("notreal" as never)).toThrow(/Unknown site id "notreal"/);
  });

  it("isKnownSiteId narrows correctly", () => {
    expect(isKnownSiteId("builtin")).toBe(true);
    expect(isKnownSiteId("greenhouse")).toBe(true);
    expect(isKnownSiteId("linkedin")).toBe(false); // intentionally NOT registered
    expect(isKnownSiteId("nope")).toBe(false);
  });

  it("requiresAuth is set per site (smoke check on the reference data)", () => {
    expect(SITE_ADAPTERS.builtin.meta.requiresAuth).toBe(false);
    expect(SITE_ADAPTERS.indeed.meta.requiresAuth).toBe(false);
    expect(SITE_ADAPTERS.greenhouse.meta.requiresAuth).toBe(false);
    expect(SITE_ADAPTERS.jobright.meta.requiresAuth).toBe(true);
  });
});
