import { describe, expect, it } from "vitest";

import { APPLY_FLOWS, applyFlowFor } from "../src/registry.js";
import { UnsupportedATSError } from "../src/errors.js";

describe("applyFlowFor", () => {
  it("returns flow with matching ats id for each supported ATS", () => {
    expect(applyFlowFor("greenhouse").ats).toBe("greenhouse");
    expect(applyFlowFor("lever").ats).toBe("lever");
    expect(applyFlowFor("ashby").ats).toBe("ashby");
    expect(applyFlowFor("workday").ats).toBe("workday");
  });

  it("throws UnsupportedATSError for icims (deferred)", () => {
    expect(() => applyFlowFor("icims")).toThrow(UnsupportedATSError);
  });

  it("throws UnsupportedATSError for unknown ats", () => {
    expect(() => applyFlowFor("monster")).toThrow(UnsupportedATSError);
  });

  it("APPLY_FLOWS map has exactly the four expected entries", () => {
    expect(Object.keys(APPLY_FLOWS).sort()).toEqual(["ashby", "greenhouse", "lever", "workday"]);
  });
});
