import { describe, expect, it, vi } from "vitest";

import {
  ashbySignupFlow,
  greenhouseSignupFlow,
  leverSignupFlow,
  signupFlowFor,
  workdaySignupFlow,
} from "../src/adapters.js";
import { SignupSubmitNotPermittedError } from "../src/errors.js";

describe("detectsUrl per ATS", () => {
  it("greenhouse matches boards.greenhouse.io", () => {
    expect(greenhouseSignupFlow.detectsUrl("https://boards.greenhouse.io/x/jobs/1")).toBe(true);
    expect(greenhouseSignupFlow.detectsUrl("https://example.com")).toBe(false);
  });
  it("lever matches jobs.lever.co", () => {
    expect(leverSignupFlow.detectsUrl("https://jobs.lever.co/x/y")).toBe(true);
  });
  it("ashby matches jobs.ashbyhq.com", () => {
    expect(ashbySignupFlow.detectsUrl("https://jobs.ashbyhq.com/x")).toBe(true);
  });
  it("workday matches myworkdayjobs.com", () => {
    expect(workdaySignupFlow.detectsUrl("https://wd5.myworkdayjobs.com/x")).toBe(true);
  });
});

describe("signupFlowFor", () => {
  it("returns each known adapter", () => {
    expect(signupFlowFor("greenhouse").ats).toBe("greenhouse");
    expect(signupFlowFor("lever").ats).toBe("lever");
    expect(signupFlowFor("ashby").ats).toBe("ashby");
    expect(signupFlowFor("workday").ats).toBe("workday");
  });
  it("throws for icims (deferred)", () => {
    expect(() => signupFlowFor("icims")).toThrow(/auto-signup does not support/);
  });
  it("throws for unknown", () => {
    expect(() => signupFlowFor("monster")).toThrow(/auto-signup does not support/);
  });
});

describe("submit gating", () => {
  it("greenhouse submit refuses without allowSubmit:true", async () => {
    const tab = makeTab();
    await expect(greenhouseSignupFlow.submit(tab, {})).rejects.toBeInstanceOf(SignupSubmitNotPermittedError);
    await expect(greenhouseSignupFlow.submit(tab, { allowSubmit: false })).rejects.toBeInstanceOf(
      SignupSubmitNotPermittedError,
    );
    await expect(greenhouseSignupFlow.submit(tab, { allowSubmit: "true" as unknown as boolean })).rejects.toBeInstanceOf(
      SignupSubmitNotPermittedError,
    );
  });
});

describe("identifyForm picks first matching selector", () => {
  it("returns selectors that exist + omits ones that don't", async () => {
    const present = new Set([
      'input[type="email"]',
      'input[type="password"]:not([name*="confirm" i])',
      'input[name="first_name"]',
      'input[name="last_name"]',
      'button[type="submit"]',
    ]);
    const tab = {
      url: "https://x",
      async evaluate(code: string) {
        // The evaluate calls all look like:
        //   `!!document.querySelector(${JSON.stringify(sel)})`
        const m = code.match(/querySelector\((.+)\)/);
        if (!m) return false;
        try {
          const sel = JSON.parse(m[1]!);
          return present.has(sel);
        } catch {
          return false;
        }
      },
    } as unknown as Parameters<typeof greenhouseSignupFlow.identifyForm>[0];
    const schema = await greenhouseSignupFlow.identifyForm(tab);
    expect(schema.standardFields.email).toBe('input[type="email"]');
    expect(schema.standardFields.firstName).toBe('input[name="first_name"]');
    expect(schema.standardFields.lastName).toBe('input[name="last_name"]');
    expect(schema.submitSelector).toBe('button[type="submit"]');
    // Phone wasn't present.
    expect(schema.standardFields.phone).toBeUndefined();
  });
});

describe("fillForm calls into humanized tab", () => {
  it("fills email/password/firstName/lastName and clicks terms when present", async () => {
    const fills: Array<{ sel: string; value: string }> = [];
    const clicks: string[] = [];
    const ht = {
      async fill(sel: string, value: string) {
        fills.push({ sel, value });
      },
      async click(sel: string) {
        clicks.push(sel);
      },
    } as Parameters<typeof greenhouseSignupFlow.fillForm>[0];
    await greenhouseSignupFlow.fillForm(
      ht,
      {
        pageUrl: "x",
        standardFields: {
          email: "input[type=email]",
          password: "input[type=password]",
          firstName: "input[name=first_name]",
          lastName: "input[name=last_name]",
          termsCheckbox: "input[name=terms]",
        },
      },
      {
        email: "x@y.z",
        password: "MyPwd!1234",
        firstName: "Hongxi",
        lastName: "Chen",
      },
    );
    expect(fills).toEqual([
      { sel: "input[type=email]", value: "x@y.z" },
      { sel: "input[type=password]", value: "MyPwd!1234" },
      { sel: "input[name=first_name]", value: "Hongxi" },
      { sel: "input[name=last_name]", value: "Chen" },
    ]);
    expect(clicks).toEqual(["input[name=terms]"]);
  });
});

function makeTab() {
  return {
    url: "https://x",
    async evaluate() {
      return false;
    },
    click: vi.fn(async () => undefined),
  } as unknown as Parameters<typeof greenhouseSignupFlow.submit>[0];
}
