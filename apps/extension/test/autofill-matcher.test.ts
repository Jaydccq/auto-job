// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, test } from "vitest";

import type { AutofillProfile, AutofillProfileField, AutofillFieldKind } from "../src/contracts/bridge-wire.js";
import {
  scanAutofillMatches,
  scoreAutofillMatch,
} from "../src/shared/autofill-matcher.js";

const VISIBILITY = { requireLayout: false } as const;

interface FieldOverrides {
  confidence?: number;
  aliases?: readonly string[];
  source?: AutofillProfileField["source"];
}

const DEFAULT_ALIASES: Record<string, readonly string[]> = {
  firstName: ["first name", "given name"],
  lastName: ["last name", "family name", "surname"],
  fullName: ["full name", "legal name", "name"],
  email: ["email", "email address", "e-mail"],
  phone: ["phone", "mobile", "telephone", "cell"],
  phoneNational: ["phone number", "mobile number", "telephone number", "cell number"],
  phoneCountryCode: ["country code", "phone country code"],
  linkedIn: ["linkedin", "linkedin url", "linkedin profile", "linkedin profile or website", "linkedin or website"],
  github: ["github", "github url", "github profile"],
  portfolio: ["portfolio", "website", "personal website", "portfolio url"],
  location: ["location", "current location", "located in today", "city and state", "city and state province", "city state", "address"],
  city: ["city"],
  state: ["state", "province", "region"],
  country: ["country"],
  postalCode: ["postal code", "zip code", "zip", "postcode"],
  addressLine1: ["address line 1", "address 1", "street address", "address"],
  workAuthorization: ["work authorization", "authorized to work", "employment authorization", "work eligibility"],
  workAuthorizationUs: ["authorized to work in the us", "authorized to work in the united states", "us work authorization"],
  sponsorship: ["sponsorship", "visa sponsorship", "require sponsorship", "need sponsorship"],
  jobSource: ["how did you hear about this job", "how did you hear about us", "job source", "source", "referral source"],
  willingToRelocate: ["willing to relocate", "relocate", "relocation"],
  desiredStartDate: ["desired start date", "available start date", "when can you start", "how soon can you start", "start full time", "start full-time"],
  onsiteWork: ["able to work on site", "work on site", "work onsite", "onsite", "on-site"],
  age18: ["18 years of age", "at least 18", "eighteen years", "age"],
  raceEthnicity: ["race", "ethnicity", "ethnic", "hispanic", "asian"],
  gender: ["gender", "gender identity"],
  disabilityStatus: ["disability"],
  veteranStatus: ["veteran", "protected veteran"],
  resumeFile: ["resume", "cv", "curriculum vitae", "upload resume", "attach resume"],
};

function field(key: AutofillFieldKind, label: string, value: string, overrides: FieldOverrides = {}): AutofillProfileField {
  return {
    key,
    label,
    value,
    source: overrides.source ?? "config/profile.yml",
    confidence: overrides.confidence ?? 0.9,
    aliases: overrides.aliases ?? DEFAULT_ALIASES[key] ?? [],
  };
}

function profileWith(fields: AutofillProfileField[]): AutofillProfile {
  return {
    generatedAt: new Date(0).toISOString(),
    fields,
    sources: ["config/profile.yml"],
    warnings: [],
  };
}

const HONGXI_PROFILE = profileWith([
  field("fullName", "Full name", "Hongxi Chen"),
  field("firstName", "First name", "Hongxi", { confidence: 0.92 }),
  field("lastName", "Last name", "Chen", { confidence: 0.9 }),
  field("email", "Email", "smyhc1@gmail.com", { confidence: 0.96 }),
  field("phone", "Phone", "+13417327552", { confidence: 0.96 }),
  field("phoneCountryCode", "Phone country code", "+1", { confidence: 0.96 }),
  field("phoneNational", "Phone number", "3417327552", { confidence: 0.96 }),
  field("linkedIn", "LinkedIn", "https://linkedin.com/in/hongxi-chen"),
  field("github", "GitHub", "https://github.com/HongxiChen"),
  field("portfolio", "Portfolio", "https://hongxi.dev"),
  field("location", "Location", "Durham, NC, USA"),
  field("addressLine1", "Address line 1", "123 Main St", { confidence: 0.96 }),
  field("city", "City", "Durham", { confidence: 0.9 }),
  field("state", "State", "NC", { confidence: 0.9 }),
  field("country", "Country", "United States", { confidence: 0.9 }),
  field("postalCode", "Postal code", "27701", { confidence: 0.92 }),
  field("workAuthorization", "Work authorization", "Yes", { confidence: 0.94 }),
  field("workAuthorizationUs", "US work authorization", "Yes", { confidence: 0.94 }),
  field("sponsorship", "Sponsorship", "Yes", { confidence: 0.9 }),
  field("jobSource", "Job source", "LinkedIn", { confidence: 0.84 }),
  field("willingToRelocate", "Willing to relocate", "Yes", { confidence: 0.84 }),
  field("desiredStartDate", "Desired start date", "June", { confidence: 0.82 }),
  field("onsiteWork", "Able to work on-site", "Yes", { confidence: 0.84 }),
  field("age18", "At least 18", "Yes", { confidence: 0.92 }),
]);

beforeEach(() => { document.body.innerHTML = ""; });
afterEach(() => { document.body.innerHTML = ""; });

function loadHTML(html: string): void {
  document.body.innerHTML = html;
}

describe("scoreAutofillMatch — text fields with standard labels", () => {
  test("matches Greenhouse first/last/email by label[for=...]", () => {
    loadHTML(`
      <form>
        <div><label for="first">First Name *</label><input id="first" type="text"></div>
        <div><label for="last">Last Name *</label><input id="last" type="text"></div>
        <div><label for="email">Email *</label><input id="email" type="email"></div>
      </form>
    `);
    const matches = scanAutofillMatches(HONGXI_PROFILE, document, { visibility: VISIBILITY });
    const byKey = Object.fromEntries(matches.map((m) => [m.field.key, m]));
    expect(byKey.firstName?.control.id).toBe("first");
    expect(byKey.lastName?.control.id).toBe("last");
    expect(byKey.email?.control.id).toBe("email");
  });

  test("matches LinkedIn url field by alias 'linkedin profile'", () => {
    loadHTML(`
      <div class="application-question">
        <span class="question-title">LinkedIn Profile</span>
        <input type="url" name="linkedin">
      </div>
    `);
    const matches = scanAutofillMatches(HONGXI_PROFILE, document, { visibility: VISIBILITY });
    const linkedIn = matches.find((m) => m.field.key === "linkedIn");
    expect(linkedIn).toBeDefined();
    expect(linkedIn?.control.tagName).toBe("INPUT");
  });

  test("matches deeply nested input through container question title", () => {
    loadHTML(`
      <section>
        <header><span class="question-title">First Name</span></header>
        <div class="row"><div class="col"><div class="cell"><input type="text" name="first_name"></div></div></div>
      </section>
    `);
    const matches = scanAutofillMatches(HONGXI_PROFILE, document, { visibility: VISIBILITY });
    expect(matches.find((m) => m.field.key === "firstName")).toBeDefined();
  });
});

describe("scoreAutofillMatch — radio buttons", () => {
  test("matches sponsorship Yes/No native radios with label[for=...]", () => {
    loadHTML(`
      <fieldset>
        <legend>Do you require visa sponsorship to work in the United States?</legend>
        <input type="radio" id="s_yes" name="sponsorship" value="yes">
        <label for="s_yes">Yes</label>
        <input type="radio" id="s_no" name="sponsorship" value="no">
        <label for="s_no">No</label>
      </fieldset>
    `);
    const matches = scanAutofillMatches(HONGXI_PROFILE, document, { visibility: VISIBILITY });
    const sponsorshipMatch = matches.find((m) => m.field.key === "sponsorship");
    expect(sponsorshipMatch).toBeDefined();
    expect((sponsorshipMatch?.control as HTMLInputElement).id).toBe("s_yes");
  });

  test("matches radio with sibling <span> label (no for binding)", () => {
    loadHTML(`
      <div class="application-question">
        <h4>Are you legally authorized to work in the United States?</h4>
        <div><input type="radio" name="auth"><span>Yes, I am authorized</span></div>
        <div><input type="radio" name="auth"><span>No, I am not</span></div>
      </div>
    `);
    const matches = scanAutofillMatches(HONGXI_PROFILE, document, { visibility: VISIBILITY });
    const authMatch = matches.find((m) => m.field.key === "workAuthorization" || m.field.key === "workAuthorizationUs");
    expect(authMatch).toBeDefined();
    expect((authMatch?.control as HTMLInputElement).type).toBe("radio");
  });

  test("matches radio inside wrapping <label>", () => {
    loadHTML(`
      <fieldset>
        <legend>Are you at least 18 years of age?</legend>
        <label><input type="radio" name="age"> Yes</label>
        <label><input type="radio" name="age"> No</label>
      </fieldset>
    `);
    const matches = scanAutofillMatches(HONGXI_PROFILE, document, { visibility: VISIBILITY });
    const ageMatch = matches.find((m) => m.field.key === "age18");
    expect(ageMatch).toBeDefined();
  });
});

describe("scoreAutofillMatch — segmented Yes/No buttons", () => {
  test("matches Ashby native <button> Yes/No for sponsorship question", () => {
    loadHTML(`
      <div class="ashby-application-form-field-entry" data-field-path="q.sponsorship">
        <label class="ashby-application-form-question-title">Do you now or at a future date require visa sponsorship to work in the United States?</label>
        <button type="button">Yes</button>
        <button type="button">No</button>
      </div>
    `);
    const matches = scanAutofillMatches(HONGXI_PROFILE, document, { visibility: VISIBILITY });
    const sponsorshipMatch = matches.find((m) => m.field.key === "sponsorship");
    expect(sponsorshipMatch).toBeDefined();
    expect(sponsorshipMatch?.control.tagName).toBe("BUTTON");
    expect(sponsorshipMatch?.control.textContent).toBe("Yes");
  });

  test("matches custom div[role=button] Yes/No for work authorization", () => {
    loadHTML(`
      <div class="application-question">
        <h4>Are you legally authorized to work in the United States?</h4>
        <div class="application-radio-group">
          <div role="button" tabindex="0">Yes</div>
          <div role="button" tabindex="0">No</div>
        </div>
      </div>
    `);
    const matches = scanAutofillMatches(HONGXI_PROFILE, document, { visibility: VISIBILITY });
    const authMatch = matches.find((m) => m.field.key === "workAuthorization" || m.field.key === "workAuthorizationUs");
    expect(authMatch).toBeDefined();
    expect(authMatch?.control.getAttribute("role")).toBe("button");
    expect(authMatch?.control.textContent).toBe("Yes");
  });

  test("matches input[type=button] Yes/No on a relocation question", () => {
    loadHTML(`
      <fieldset>
        <legend>Are you willing to relocate?</legend>
        <input type="button" value="Yes">
        <input type="button" value="No">
      </fieldset>
    `);
    const matches = scanAutofillMatches(HONGXI_PROFILE, document, { visibility: VISIBILITY });
    const relocate = matches.find((m) => m.field.key === "willingToRelocate");
    expect(relocate).toBeDefined();
    expect((relocate?.control as HTMLInputElement).value).toBe("Yes");
  });

  test("does not click No when answer is Yes", () => {
    loadHTML(`
      <fieldset>
        <legend>Do you require visa sponsorship?</legend>
        <button type="button">Yes</button>
        <button type="button">No</button>
      </fieldset>
    `);
    const matches = scanAutofillMatches(HONGXI_PROFILE, document, { visibility: VISIBILITY });
    const sponsorshipMatches = matches.filter((m) => m.field.key === "sponsorship");
    expect(sponsorshipMatches.length).toBe(1);
    expect(sponsorshipMatches[0]?.control.textContent).toBe("Yes");
  });

  test("does not match anything when there is no recognized question", () => {
    loadHTML(`
      <div>
        <button type="button">Yes</button>
        <button type="button">No</button>
      </div>
    `);
    const matches = scanAutofillMatches(HONGXI_PROFILE, document, { visibility: VISIBILITY });
    expect(matches).toHaveLength(0);
  });
});

describe("scoreAutofillMatch — selects", () => {
  test("matches a country select via option text", () => {
    loadHTML(`
      <label for="country">Country</label>
      <select id="country">
        <option value="">Select…</option>
        <option value="us">United States</option>
        <option value="ca">Canada</option>
      </select>
    `);
    const matches = scanAutofillMatches(HONGXI_PROFILE, document, { visibility: VISIBILITY });
    const country = matches.find((m) => m.field.key === "country");
    expect(country).toBeDefined();
    expect((country?.control as HTMLSelectElement).id).toBe("country");
  });

  test("matches sponsorship select with descriptive options", () => {
    loadHTML(`
      <label for="sp">Will you now or in the future require employer sponsorship?</label>
      <select id="sp">
        <option value="">Select an option</option>
        <option value="y">I will now or in the future require employer sponsorship</option>
        <option value="n">I do not require sponsorship</option>
      </select>
    `);
    const matches = scanAutofillMatches(HONGXI_PROFILE, document, { visibility: VISIBILITY });
    const sponsorship = matches.find((m) => m.field.key === "sponsorship");
    expect(sponsorship).toBeDefined();
  });

  test("skips select when no option matches the answer", () => {
    loadHTML(`
      <label for="sp">Will you now or in the future require employer sponsorship?</label>
      <select id="sp">
        <option value="">Select…</option>
        <option value="cust">Banana</option>
        <option value="cust2">Mango</option>
      </select>
    `);
    const matches = scanAutofillMatches(HONGXI_PROFILE, document, { visibility: VISIBILITY });
    expect(matches.find((m) => m.field.key === "sponsorship")).toBeUndefined();
  });
});

describe("scoreAutofillMatch — visibility / disabled / already-set", () => {
  test("skips disabled and pre-filled inputs", () => {
    loadHTML(`
      <label for="a">Email</label><input id="a" type="email" value="other@x.com">
      <label for="b">Email</label><input id="b" type="email" disabled>
    `);
    const matches = scanAutofillMatches(HONGXI_PROFILE, document, { visibility: VISIBILITY });
    expect(matches.find((m) => m.field.key === "email")).toBeUndefined();
  });

  test("skips display:none / aria-hidden inputs", () => {
    loadHTML(`
      <div aria-hidden="true">
        <label for="a">Email</label><input id="a" type="email">
      </div>
      <div style="display:none">
        <label for="b">Email</label><input id="b" type="email">
      </div>
    `);
    const matches = scanAutofillMatches(HONGXI_PROFILE, document, { visibility: VISIBILITY });
    expect(matches.find((m) => m.field.key === "email")).toBeUndefined();
  });
});

describe("scoreAutofillMatch — guards against false positives", () => {
  test("does not fill 'Preferred Work Location' from home address", () => {
    loadHTML(`
      <label for="pref">Preferred Work Location</label>
      <input id="pref" type="text">
    `);
    const matches = scanAutofillMatches(HONGXI_PROFILE, document, { visibility: VISIBILITY });
    expect(matches.find((m) => m.field.key === "city" || m.field.key === "state" || m.field.key === "country" || m.field.key === "location")).toBeUndefined();
  });

  test("does not match employer name to first/last name fields", () => {
    loadHTML(`
      <label for="emp">Most Recent Employer Name</label>
      <input id="emp" type="text">
    `);
    const matches = scanAutofillMatches(HONGXI_PROFILE, document, { visibility: VISIBILITY });
    expect(matches.find((m) => m.field.key === "firstName" || m.field.key === "lastName" || m.field.key === "fullName")).toBeUndefined();
  });

  test("matches preferred last name to lastName, not firstName", () => {
    loadHTML(`
      <label for="pln">Preferred Last Name</label>
      <input id="pln" type="text">
    `);
    const matches = scanAutofillMatches(HONGXI_PROFILE, document, { visibility: VISIBILITY });
    const lastNameMatch = matches.find((m) => m.field.key === "lastName");
    expect(lastNameMatch?.control.id).toBe("pln");
    expect(matches.find((m) => m.field.key === "firstName")?.control.id).not.toBe("pln");
  });
});

describe("scoreAutofillMatch — score gating", () => {
  test("Yes/No buttons without a recognized question score zero", () => {
    loadHTML(`<button id="b" type="button">Yes</button>`);
    const buttons = HONGXI_PROFILE.fields.filter((f) => f.key === "sponsorship" || f.key === "workAuthorization");
    for (const f of buttons) {
      expect(scoreAutofillMatch(document.getElementById("b") as HTMLButtonElement, f, document)).toBeLessThan(0.68);
    }
  });

  test("buttons with sponsorship question + Yes label score >= 0.68", () => {
    loadHTML(`
      <fieldset>
        <legend>Do you require visa sponsorship to work?</legend>
        <button id="y" type="button">Yes</button>
      </fieldset>
    `);
    const sponsorship = HONGXI_PROFILE.fields.find((f) => f.key === "sponsorship")!;
    expect(scoreAutofillMatch(document.getElementById("y") as HTMLButtonElement, sponsorship, document)).toBeGreaterThanOrEqual(0.68);
  });

  test("does not match submit, next, continue, or apply action controls", () => {
    loadHTML(`
      <fieldset>
        <legend>Are you legally authorized to work in the United States?</legend>
        <button type="button">Submit application</button>
        <button type="button">Next</button>
        <button type="button">Continue</button>
        <button type="button">Apply now</button>
        <button type="button">Yes</button>
      </fieldset>
    `);
    const matches = scanAutofillMatches(HONGXI_PROFILE, document, { visibility: VISIBILITY });
    const labels = matches.map((match) => match.control.textContent?.trim() ?? "");
    expect(labels).toContain("Yes");
    expect(labels).not.toContain("Submit application");
    expect(labels).not.toContain("Next");
    expect(labels).not.toContain("Continue");
    expect(labels).not.toContain("Apply now");
  });
});
