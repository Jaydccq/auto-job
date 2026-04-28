// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, test } from "vitest";

import {
  autofillControlAlreadySet,
  autofillInputKind,
  choiceQuestionLabel,
  controlLabel,
  directControlLabel,
  isAutofillCandidate,
  isAutofillElementVisible,
  nearbyFieldLabelText,
  normalizeAutofillLabel,
  optionTextCandidatesForControl,
  type AutofillControl,
} from "../src/shared/autofill-dom.js";
import { AUTOFILL_CONTROL_SELECTOR } from "../src/shared/autofill-option-scoring.js";

const VISIBILITY_OPTIONS = { requireLayout: false } as const;

function loadHTML(html: string): void {
  document.body.innerHTML = html;
}

function $(selector: string): AutofillControl {
  const element = document.querySelector(selector);
  if (!element) throw new Error(`fixture missing selector: ${selector}`);
  return element as AutofillControl;
}

function scanCandidates(): AutofillControl[] {
  return Array.from(document.querySelectorAll(AUTOFILL_CONTROL_SELECTOR))
    .filter((el) => isAutofillCandidate(el, VISIBILITY_OPTIONS)) as AutofillControl[];
}

beforeEach(() => {
  document.body.innerHTML = "";
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("isAutofillCandidate", () => {
  test("accepts a normal text input", () => {
    loadHTML(`<input id="x" type="text">`);
    expect(isAutofillCandidate($("#x"), VISIBILITY_OPTIONS)).toBe(true);
  });

  test("rejects disabled and readonly fields", () => {
    loadHTML(`<input id="d" type="text" disabled><input id="r" type="text" readonly>`);
    expect(isAutofillCandidate($("#d"), VISIBILITY_OPTIONS)).toBe(false);
    expect(isAutofillCandidate($("#r"), VISIBILITY_OPTIONS)).toBe(false);
  });

  test("rejects hidden, password, file, submit, reset, image inputs", () => {
    loadHTML(`
      <input id="h" type="hidden">
      <input id="p" type="password">
      <input id="s" type="submit">
      <input id="rs" type="reset">
      <input id="im" type="image">
    `);
    for (const id of ["#h", "#p", "#s", "#rs", "#im"]) {
      expect(isAutofillCandidate($(id), VISIBILITY_OPTIONS)).toBe(false);
    }
  });

  test("accepts explicit non-submit native button but not submit or reset buttons", () => {
    loadHTML(`<button id="b0">Yes</button><button id="b1" type="button">Yes</button><button id="b2" type="reset">Reset</button>`);
    expect(isAutofillCandidate($("#b0"), VISIBILITY_OPTIONS)).toBe(false);
    expect(isAutofillCandidate($("#b1"), VISIBILITY_OPTIONS)).toBe(true);
    expect(isAutofillCandidate($("#b2"), VISIBILITY_OPTIONS)).toBe(false);
  });

  test("rejects action buttons that could submit or advance an application", () => {
    loadHTML(`
      <button id="submit" type="button">Submit application</button>
      <button id="next" type="button">Next</button>
      <div id="continue" role="button">Continue</div>
      <input id="apply" type="button" value="Apply now">
      <button id="yes" type="button">Yes</button>
    `);
    for (const id of ["#submit", "#next", "#continue", "#apply"]) {
      expect(isAutofillCandidate($(id), VISIBILITY_OPTIONS)).toBe(false);
    }
    expect(isAutofillCandidate($("#yes"), VISIBILITY_OPTIONS)).toBe(true);
  });

  test("accepts ARIA choice roles, rejects unrelated roles", () => {
    loadHTML(`
      <div id="rb" role="button">Yes</div>
      <div id="rr" role="radio">Yes</div>
      <div id="rc" role="checkbox">Agree</div>
      <div id="rl" role="link">Click me</div>
    `);
    expect(isAutofillCandidate($("#rb"), VISIBILITY_OPTIONS)).toBe(true);
    expect(isAutofillCandidate($("#rr"), VISIBILITY_OPTIONS)).toBe(true);
    expect(isAutofillCandidate($("#rc"), VISIBILITY_OPTIONS)).toBe(true);
    expect(isAutofillCandidate($("#rl"), VISIBILITY_OPTIONS)).toBe(false);
  });

  test("rejects elements hidden via display:none, visibility:hidden, hidden attribute, aria-hidden ancestor", () => {
    loadHTML(`
      <input id="dn" type="text" style="display: none">
      <input id="vh" type="text" style="visibility: hidden">
      <input id="ha" type="text" hidden>
      <div aria-hidden="true"><input id="ah" type="text"></div>
      <input id="ok" type="text">
    `);
    expect(isAutofillElementVisible($("#dn"), VISIBILITY_OPTIONS)).toBe(false);
    expect(isAutofillElementVisible($("#vh"), VISIBILITY_OPTIONS)).toBe(false);
    expect(isAutofillCandidate($("#ha"), VISIBILITY_OPTIONS)).toBe(false);
    expect(isAutofillCandidate($("#ah"), VISIBILITY_OPTIONS)).toBe(false);
    expect(isAutofillCandidate($("#ok"), VISIBILITY_OPTIONS)).toBe(true);
  });

  test("rejects aria-disabled controls on choice-role elements", () => {
    loadHTML(`<div id="b" role="button" aria-disabled="true">Yes</div>`);
    expect(isAutofillCandidate($("#b"), VISIBILITY_OPTIONS)).toBe(false);
  });
});

describe("autofillInputKind", () => {
  test("classifies common control shapes", () => {
    loadHTML(`
      <input id="t" type="text">
      <input id="e" type="email">
      <input id="tel" type="tel">
      <input id="num" type="number">
      <input id="r" type="radio">
      <input id="c" type="checkbox">
      <input id="ib" type="button">
      <input id="f" type="file">
      <textarea id="ta"></textarea>
      <select id="se"><option>1</option></select>
      <button id="bn">Yes</button>
      <div id="rb" role="button">Yes</div>
      <div id="rr" role="radio">Yes</div>
      <div id="rc" role="checkbox">Agree</div>
    `);
    expect(autofillInputKind($("#t"))).toBe("text");
    expect(autofillInputKind($("#e"))).toBe("text");
    expect(autofillInputKind($("#tel"))).toBe("text");
    expect(autofillInputKind($("#num"))).toBe("text");
    expect(autofillInputKind($("#r"))).toBe("radio");
    expect(autofillInputKind($("#c"))).toBe("checkbox");
    expect(autofillInputKind($("#ib"))).toBe("button");
    expect(autofillInputKind($("#f"))).toBe("file");
    expect(autofillInputKind($("#ta"))).toBe("textarea");
    expect(autofillInputKind($("#se"))).toBe("select");
    expect(autofillInputKind($("#bn"))).toBe("button");
    expect(autofillInputKind($("#rb"))).toBe("button");
    expect(autofillInputKind($("#rr"))).toBe("radio");
    expect(autofillInputKind($("#rc"))).toBe("checkbox");
  });
});

describe("directControlLabel — Greenhouse / standard label patterns", () => {
  test("reads label[for=...] text", () => {
    loadHTML(`
      <label for="job_application_first_name">First Name *</label>
      <input id="job_application_first_name" name="job_application[first_name]" type="text">
    `);
    const label = directControlLabel($("input"), document);
    expect(normalizeAutofillLabel(label)).toContain("first name");
  });

  test("reads aria-labelledby reference", () => {
    loadHTML(`
      <span id="lblEmail">Email Address</span>
      <input id="email" type="email" aria-labelledby="lblEmail">
    `);
    const label = directControlLabel($("#email"), document);
    expect(normalizeAutofillLabel(label)).toContain("email address");
  });

  test("reads aria-label attribute", () => {
    loadHTML(`<input id="phone" type="tel" aria-label="Phone Number">`);
    expect(normalizeAutofillLabel(directControlLabel($("#phone"), document))).toContain("phone number");
  });

  test("reads placeholder + name + autocomplete", () => {
    loadHTML(`<input id="z" type="text" name="address-zip" placeholder="ZIP Code" autocomplete="postal-code">`);
    const label = normalizeAutofillLabel(directControlLabel($("#z"), document));
    expect(label).toContain("zip code");
    expect(label).toContain("postal code");
  });
});

describe("nearbyFieldLabelText — non-standard label placements", () => {
  test("picks up label text from previous sibling", () => {
    loadHTML(`
      <div class="form-row">
        <div class="field-label">City</div>
        <input id="city" type="text">
      </div>
    `);
    const label = normalizeAutofillLabel(nearbyFieldLabelText($("#city")));
    expect(label).toContain("city");
  });

  test("picks up label from container's first labeled child", () => {
    loadHTML(`
      <div class="application-question">
        <span class="question-title">LinkedIn Profile</span>
        <div><input id="linkedin" type="url"></div>
      </div>
    `);
    const label = normalizeAutofillLabel(directControlLabel($("#linkedin"), document));
    expect(label).toContain("linkedin profile");
  });

  test("picks up Ashby field-container question title", () => {
    loadHTML(`
      <div class="ashby-application-form-field-entry" data-field-path="profile.linkedin">
        <label class="ashby-application-form-question-title">LinkedIn Profile</label>
        <input type="url" name="linkedin">
      </div>
    `);
    const label = normalizeAutofillLabel(directControlLabel($("input"), document));
    expect(label).toContain("linkedin profile");
  });

  test("picks up label five+ levels above the input", () => {
    loadHTML(`
      <section class="application-question">
        <header><span class="question-title">First Name</span></header>
        <div class="row"><div class="col"><div class="cell"><div class="inner"><input id="fn" type="text"></div></div></div></div>
      </section>
    `);
    const label = normalizeAutofillLabel(directControlLabel($("#fn"), document));
    expect(label).toContain("first name");
  });
});

describe("choiceQuestionLabel — segmented buttons / radio groups", () => {
  test("native fieldset/legend question + Yes/No buttons", () => {
    loadHTML(`
      <fieldset>
        <legend>Are you legally authorized to work in the United States?</legend>
        <button id="yes">Yes</button>
        <button id="no">No</button>
      </fieldset>
    `);
    const label = normalizeAutofillLabel(choiceQuestionLabel($("#yes"), document));
    expect(label).toContain("legally authorized");
    expect(label).toContain("united states");
  });

  test("question 4+ levels above the button", () => {
    loadHTML(`
      <section>
        <header><span class="question-title">Do you require visa sponsorship?</span></header>
        <fieldset>
          <div class="options-grid">
            <div class="option"><button>Yes</button></div>
            <div class="option"><button>No</button></div>
          </div>
        </fieldset>
      </section>
    `);
    const yesBtn = document.querySelectorAll("button")[0]!;
    const label = normalizeAutofillLabel(choiceQuestionLabel(yesBtn, document));
    expect(label).toContain("require visa sponsorship");
  });

  test("Lever-style application question div above buttons", () => {
    loadHTML(`
      <div class="application-question">
        <h4>Are you legally authorized to work in the United States?</h4>
        <div class="application-radio-group">
          <button data-qa-trigger="yes">Yes</button>
          <button data-qa-trigger="no">No</button>
        </div>
      </div>
    `);
    const yesBtn = document.querySelectorAll("button")[0]!;
    const label = normalizeAutofillLabel(choiceQuestionLabel(yesBtn, document));
    expect(label).toContain("authorized to work");
  });
});

describe("optionTextCandidatesForControl — option detection", () => {
  test("native button text", () => {
    loadHTML(`<button id="y">Yes</button>`);
    expect(optionTextCandidatesForControl($("#y"), document)).toContain("yes");
  });

  test("ARIA role=button div text", () => {
    loadHTML(`<div id="y" role="button">Yes, I require sponsorship</div>`);
    const candidates = optionTextCandidatesForControl($("#y"), document);
    expect(candidates.some((c) => c.includes("require sponsorship"))).toBe(true);
  });

  test("input[type=button][value=Yes]", () => {
    loadHTML(`<input id="y" type="button" value="Yes">`);
    expect(optionTextCandidatesForControl($("#y"), document)).toContain("yes");
  });

  test("radio with for-bound label", () => {
    loadHTML(`
      <input type="radio" id="r1" name="g">
      <label for="r1">Yes, I am legally authorized</label>
    `);
    const candidates = optionTextCandidatesForControl($("#r1"), document);
    expect(candidates.some((c) => c.includes("legally authorized"))).toBe(true);
  });

  test("radio inside wrapping <label>", () => {
    loadHTML(`
      <label><input type="radio" name="g"> Yes, I require sponsorship</label>
    `);
    const radio = document.querySelector("input[type=radio]")! as AutofillControl;
    const candidates = optionTextCandidatesForControl(radio, document);
    expect(candidates.some((c) => c.includes("require sponsorship"))).toBe(true);
  });

  test("radio with sibling <span> text node", () => {
    loadHTML(`
      <div class="row">
        <input type="radio" name="g" id="r1"><span>Yes, I require sponsorship</span>
      </div>
    `);
    const candidates = optionTextCandidatesForControl($("#r1"), document);
    expect(candidates.some((c) => c.includes("require sponsorship"))).toBe(true);
  });

  test("radio with adjacent text node (`<input> Yes`)", () => {
    loadHTML(`<div><input type="radio" name="g" id="r1"> Yes</div>`);
    const candidates = optionTextCandidatesForControl($("#r1"), document);
    expect(candidates).toContain("yes");
  });
});

describe("autofillControlAlreadySet — pre-existing values", () => {
  test("checked radio in group is set", () => {
    loadHTML(`
      <input type="radio" name="g" id="a" checked>
      <input type="radio" name="g" id="b">
    `);
    expect(autofillControlAlreadySet($("#a"), document)).toBe(true);
    expect(autofillControlAlreadySet($("#b"), document)).toBe(true);
  });

  test("checkbox already checked is set; unchecked is not", () => {
    loadHTML(`<input type="checkbox" id="a" checked><input type="checkbox" id="b">`);
    expect(autofillControlAlreadySet($("#a"), document)).toBe(true);
    expect(autofillControlAlreadySet($("#b"), document)).toBe(false);
  });

  test("button without aria-pressed/checked is not set", () => {
    loadHTML(`<button id="a">Yes</button><button id="b" aria-pressed="true">No</button>`);
    expect(autofillControlAlreadySet($("#a"), document)).toBe(false);
    expect(autofillControlAlreadySet($("#b"), document)).toBe(true);
  });

  test("input[type=button] without aria-pressed is not set", () => {
    loadHTML(`<input type="button" id="a" value="Yes">`);
    expect(autofillControlAlreadySet($("#a"), document)).toBe(false);
  });

  test("text input with empty value is not set; with value is set", () => {
    loadHTML(`<input type="text" id="a"><input type="text" id="b" value="Hongxi">`);
    expect(autofillControlAlreadySet($("#a"), document)).toBe(false);
    expect(autofillControlAlreadySet($("#b"), document)).toBe(true);
  });
});

describe("controlLabel — combined direct + context", () => {
  test("combines direct label and surrounding container question", () => {
    loadHTML(`
      <fieldset>
        <legend>Do you require visa sponsorship?</legend>
        <button id="yes">Yes</button>
      </fieldset>
    `);
    const label = normalizeAutofillLabel(controlLabel($("#yes"), document));
    expect(label).toContain("yes");
    expect(label).toContain("visa sponsorship");
  });
});

describe("scanCandidates — end-to-end candidate set", () => {
  test("collects all interactive controls and excludes hidden / disabled / submit-input", () => {
    loadHTML(`
      <input id="a" type="text">
      <input id="b" type="hidden">
      <input id="c" type="submit">
      <button id="d" type="button">Yes</button>
      <button id="e" type="reset">Reset</button>
      <div id="f" role="button">Choice</div>
      <div id="g" role="link">Click</div>
      <input id="h" type="text" disabled>
      <textarea id="i"></textarea>
      <select id="j"><option>v</option></select>
    `);
    const ids = scanCandidates().map((el) => el.id).sort();
    expect(ids).toEqual(["a", "d", "f", "i", "j"].sort());
  });
});
