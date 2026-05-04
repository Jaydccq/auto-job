import { describe, expect, it } from "vitest";

import {
  searchBuiltIn,
  BUILTIN_ADAPTER_SOURCE,
} from "../../src/sites/builtin/index.js";
import {
  searchIndeed,
  INDEED_ADAPTER_SOURCE,
} from "../../src/sites/indeed/index.js";
import {
  recommendJobright,
  jobrightDismissPopups,
  JOBRIGHT_NEWGRAD_SOURCE,
  JOBRIGHT_DISMISS_SOURCE,
} from "../../src/sites/jobright/index.js";
import {
  captureLinkedInAuthState,
  detectLinkedInAuthBlock,
  searchLinkedIn,
  linkedInJobDetail,
} from "../../src/sites/linkedin/index.js";

describe("adapter exports — public surface", () => {
  it("BuiltIn exports a function and a non-empty source string", () => {
    expect(typeof searchBuiltIn).toBe("function");
    expect(typeof BUILTIN_ADAPTER_SOURCE).toBe("string");
    expect(BUILTIN_ADAPTER_SOURCE).toContain("builtinJobs");
    expect(BUILTIN_ADAPTER_SOURCE).toContain("builtin.com");
  });

  it("Indeed exports a function and a non-empty source string", () => {
    expect(typeof searchIndeed).toBe("function");
    expect(typeof INDEED_ADAPTER_SOURCE).toBe("string");
    expect(INDEED_ADAPTER_SOURCE).toContain("indeedJobs");
    expect(INDEED_ADAPTER_SOURCE).toContain("www.indeed.com");
  });

  it("JobRight exports recommend/detail/dismiss functions and source strings", () => {
    expect(typeof recommendJobright).toBe("function");
    expect(typeof jobrightDismissPopups).toBe("function");
    expect(JOBRIGHT_NEWGRAD_SOURCE).toContain("jobrightNewgrad");
    expect(JOBRIGHT_NEWGRAD_SOURCE).toContain("jobright.ai");
    expect(JOBRIGHT_DISMISS_SOURCE).toContain("ant-modal-close");
  });

  it("LinkedIn exports tab-aware wrappers", () => {
    expect(typeof captureLinkedInAuthState).toBe("function");
    expect(typeof detectLinkedInAuthBlock).toBe("function");
    expect(typeof searchLinkedIn).toBe("function");
    expect(typeof linkedInJobDetail).toBe("function");
  });
});

describe("adapter source — shape sanity", () => {
  it("BuiltIn source is a syntactically valid IIFE-able async function", () => {
    expect(() => new Function(`(${BUILTIN_ADAPTER_SOURCE})`)).not.toThrow();
  });

  it("Indeed source is a syntactically valid IIFE-able async function", () => {
    expect(() => new Function(`(${INDEED_ADAPTER_SOURCE})`)).not.toThrow();
  });

  it("JobRight source is a syntactically valid IIFE-able async function", () => {
    expect(() => new Function(`(${JOBRIGHT_NEWGRAD_SOURCE})`)).not.toThrow();
  });

  it("JobRight dismiss source is a syntactically valid expression", () => {
    expect(() => new Function(`return ${JOBRIGHT_DISMISS_SOURCE}`)).not.toThrow();
  });
});
