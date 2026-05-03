// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, test } from "vitest";

import type { AutofillProfile, AutofillProfileField, AutofillFieldKind } from "../src/contracts/bridge-wire.js";
import { scanAutofillMatches } from "../src/shared/autofill-matcher.js";
import {
  assertSafeClick,
  findEasyApplyModal,
  findEasyApplyProgressButton,
  findEasyApplySubmitButton,
} from "../src/shared/easy-apply.js";

const VISIBILITY = { requireLayout: false } as const;

function field(key: AutofillFieldKind, label: string, value: string, aliases: readonly string[]): AutofillProfileField {
  return {
    key,
    label,
    value,
    source: "config/profile.yml",
    confidence: 0.92,
    aliases,
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

const PROFILE = profileWith([
  field("firstName", "First name", "Hongxi", ["first name", "given name"]),
  field("lastName", "Last name", "Chen", ["last name", "family name", "surname"]),
  field("email", "Email", "smyhc1@gmail.com", ["email", "email address", "e-mail"]),
]);

beforeEach(() => { document.body.innerHTML = ""; });
afterEach(() => { document.body.innerHTML = ""; });

describe("scanAutofillMatches — root option", () => {
  test("scoping to a subtree omits matches outside it", () => {
    document.body.innerHTML = `
      <div id="outside">
        <label for="outside-email">Email</label>
        <input id="outside-email" type="email">
      </div>
      <div id="modal">
        <label for="inside-first">First Name</label>
        <input id="inside-first" type="text">
      </div>
    `;
    const modal = document.getElementById("modal") as HTMLElement;
    const matches = scanAutofillMatches(PROFILE, document, { visibility: VISIBILITY, root: modal });
    expect(matches.find((m) => m.field.key === "email")).toBeUndefined();
    const firstName = matches.find((m) => m.field.key === "firstName");
    expect(firstName?.control.id).toBe("inside-first");
  });

  test("default scan still picks up controls anywhere in the document", () => {
    document.body.innerHTML = `
      <label for="anywhere-email">Email</label>
      <input id="anywhere-email" type="email">
    `;
    const matches = scanAutofillMatches(PROFILE, document, { visibility: VISIBILITY });
    expect(matches.find((m) => m.field.key === "email")?.control.id).toBe("anywhere-email");
  });
});

describe("findEasyApplyModal", () => {
  test("returns the .jobs-easy-apply-modal element when present", () => {
    document.body.innerHTML = `
      <div role="dialog" class="jobs-easy-apply-modal" aria-labelledby="easy-apply-title">
        <h2 id="easy-apply-title">Apply to Acme Corp</h2>
        <form aria-label="Easy Apply form"></form>
      </div>
    `;
    const modal = findEasyApplyModal(document);
    expect(modal).not.toBeNull();
    expect(modal?.classList.contains("jobs-easy-apply-modal")).toBe(true);
  });

  test("falls back to dialog whose text mentions Easy Apply", () => {
    document.body.innerHTML = `
      <div role="dialog">
        <p>Easy Apply — Step 2 of 4</p>
        <button type="button">Continue</button>
      </div>
    `;
    const modal = findEasyApplyModal(document);
    expect(modal).not.toBeNull();
  });

  test("returns null when no Easy Apply dialog exists", () => {
    document.body.innerHTML = `<div><p>Just a regular page.</p></div>`;
    expect(findEasyApplyModal(document)).toBeNull();
  });
});

describe("findEasyApplyProgressButton", () => {
  test("picks Continue but not Submit", () => {
    document.body.innerHTML = `
      <div id="modal" role="dialog" class="jobs-easy-apply-modal">
        <button type="button" aria-label="Continue to next step">Continue</button>
        <button type="button" aria-label="Submit application">Submit application</button>
      </div>
    `;
    const modal = document.getElementById("modal") as HTMLElement;
    const progress = findEasyApplyProgressButton(modal);
    expect(progress).not.toBeNull();
    expect(progress?.getAttribute("aria-label")).toBe("Continue to next step");
  });

  test("picks Next when only Next exists", () => {
    document.body.innerHTML = `
      <div id="modal">
        <button type="button">Next</button>
        <button type="button" disabled>Continue</button>
      </div>
    `;
    const progress = findEasyApplyProgressButton(document.getElementById("modal") as HTMLElement);
    expect(progress?.textContent).toBe("Next");
  });

  test("returns null when only Submit / Withdraw / Save are present", () => {
    document.body.innerHTML = `
      <div id="modal">
        <button type="button">Submit application</button>
        <button type="button">Save</button>
        <button type="button">Withdraw</button>
      </div>
    `;
    expect(findEasyApplyProgressButton(document.getElementById("modal") as HTMLElement)).toBeNull();
  });
});

describe("findEasyApplySubmitButton", () => {
  test("picks Submit application by aria-label", () => {
    document.body.innerHTML = `
      <div id="modal">
        <button type="button" aria-label="Submit application">Submit application</button>
        <button type="button">Continue</button>
      </div>
    `;
    const submit = findEasyApplySubmitButton(document.getElementById("modal") as HTMLElement);
    expect(submit).not.toBeNull();
    expect(submit?.textContent).toBe("Submit application");
  });

  test("picks a plain Submit button by text", () => {
    document.body.innerHTML = `
      <div id="modal">
        <button type="button">Submit</button>
      </div>
    `;
    expect(findEasyApplySubmitButton(document.getElementById("modal") as HTMLElement)).not.toBeNull();
  });

  test("returns null when only progress buttons are present", () => {
    document.body.innerHTML = `
      <div id="modal">
        <button type="button">Continue</button>
        <button type="button">Review your application</button>
      </div>
    `;
    expect(findEasyApplySubmitButton(document.getElementById("modal") as HTMLElement)).toBeNull();
  });
});

describe("assertSafeClick", () => {
  test("throws on Submit application label", () => {
    document.body.innerHTML = `<button type="button" aria-label="Submit application">Submit</button>`;
    const button = document.querySelector("button") as HTMLButtonElement;
    expect(() => assertSafeClick(button)).toThrow();
  });

  test("throws on Withdraw label", () => {
    document.body.innerHTML = `<button type="button">Withdraw application</button>`;
    const button = document.querySelector("button") as HTMLButtonElement;
    expect(() => assertSafeClick(button)).toThrow();
  });

  test("does not throw on Continue", () => {
    document.body.innerHTML = `<button type="button">Continue</button>`;
    const button = document.querySelector("button") as HTMLButtonElement;
    expect(() => assertSafeClick(button)).not.toThrow();
  });
});

describe("buttonAccessibleLabel — title-attribute trap (codex-warn)", () => {
  test("a button with visible text 'Review' but title='Submit application' is treated as Submit", () => {
    document.body.innerHTML = `
      <div id="modal">
        <button type="button" title="Submit application">Review</button>
      </div>
    `;
    const modal = document.getElementById("modal") as HTMLElement;
    // Must NOT be returned as a progress button.
    expect(findEasyApplyProgressButton(modal)).toBeNull();
    // MUST be detected as a submit button — the loop must stop.
    expect(findEasyApplySubmitButton(modal)).not.toBeNull();
    // assertSafeClick must reject it even though the visible text says Review.
    const button = modal.querySelector("button") as HTMLButtonElement;
    expect(() => assertSafeClick(button)).toThrow();
  });

  test("inner-span aria-label='Submit application' on a Review button still trips the guard", () => {
    document.body.innerHTML = `
      <div id="modal">
        <button type="button"><span aria-label="Submit application">Review</span></button>
      </div>
    `;
    const button = document.querySelector("button") as HTMLButtonElement;
    expect(() => assertSafeClick(button)).toThrow();
  });

  test("aria-labelledby pointing at a hidden 'Submit application' label trips the guard (codex-pass-2)", () => {
    document.body.innerHTML = `
      <span id="hidden-label" style="display:none">Submit application</span>
      <div id="modal">
        <button type="button" aria-labelledby="hidden-label">Review</button>
      </div>
    `;
    const button = document.querySelector("button") as HTMLButtonElement;
    expect(() => assertSafeClick(button)).toThrow();
    const modal = document.getElementById("modal") as HTMLElement;
    // Must NOT be returned as a progress button.
    expect(findEasyApplyProgressButton(modal)).toBeNull();
    // MUST be detected as a submit button.
    expect(findEasyApplySubmitButton(modal)).not.toBeNull();
  });
});

describe("auto-loop safety: never clicks Submit", () => {
  // Mirrors easyApplyLoop's stop-on-submit branch in inject.ts. When a Submit
  // button is present, the loop must STOP without invoking .click() on it.
  test("Submit-present step short-circuits before any click", () => {
    document.body.innerHTML = `
      <div role="dialog" class="jobs-easy-apply-modal">
        <input type="text" aria-label="First name">
        <button type="button" id="submit-btn" aria-label="Submit application">Submit application</button>
      </div>
    `;
    const submit = document.getElementById("submit-btn") as HTMLButtonElement;
    let clickCount = 0;
    submit.addEventListener("click", () => { clickCount += 1; });

    // Simulate the loop's pre-flight: re-find modal, then check for submit.
    const modal = findEasyApplyModal(document);
    expect(modal).not.toBeNull();
    const detectedSubmit = findEasyApplySubmitButton(modal as HTMLElement);
    expect(detectedSubmit).toBe(submit);
    // Loop MUST return here. assertSafeClick must also reject this button if
    // anyone tried to click it.
    expect(() => assertSafeClick(submit)).toThrow();
    expect(clickCount).toBe(0);
  });
});
