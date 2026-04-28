import { describe, expect, test } from "vitest";

import {
  AUTOFILL_CONTROL_SELECTOR,
  autofillChoiceRole,
  isAutofillButtonTypeAllowed,
  isInteractiveButtonInputType,
  isUnsafeAutofillActionText,
  optionAnswerScore,
  optionScoreThreshold,
  optionTextMatchesValue,
} from "../src/shared/autofill-option-scoring.js";
import type { AutofillProfileField } from "../src/contracts/bridge-wire.js";

function field(key: AutofillProfileField["key"], value: string): Pick<AutofillProfileField, "key" | "value"> {
  return { key, value };
}

describe("autofill option scoring", () => {
  test("uses option wording for sponsorship instead of matching bare yes", () => {
    const sponsorship = field("sponsorship", "Yes");

    expect(optionAnswerScore(sponsorship, "Yes, I require visa sponsorship")).toBeGreaterThanOrEqual(optionScoreThreshold(sponsorship));
    expect(optionAnswerScore(sponsorship, "Yes, I do not require sponsorship")).toBe(0);
    expect(optionAnswerScore(sponsorship, "No, I do not require sponsorship")).toBe(0);
  });

  test("supports bare yes/no buttons for require visa sponsorship questions", () => {
    const sponsorship = field("sponsorship", "Yes");

    expect(optionAnswerScore(sponsorship, "Yes")).toBeGreaterThanOrEqual(optionScoreThreshold(sponsorship));
    expect(optionAnswerScore(sponsorship, "No")).toBe(0);
  });

  test("prefers no-disability wording over decline-to-answer wording", () => {
    const disability = field("disabilityStatus", "No, I do not have a disability and have not had one in the past");

    expect(optionAnswerScore(disability, "No, I do not have a disability and have not had one in the past")).toBeGreaterThanOrEqual(optionScoreThreshold(disability));
    expect(optionAnswerScore(disability, "I do not wish to answer")).toBeLessThan(optionScoreThreshold(disability));
    expect(optionAnswerScore(disability, "Yes, I have a disability")).toBe(0);
  });

  test("maps narrower profile values to broader available options", () => {
    expect(optionAnswerScore(field("raceEthnicity", "East Asian"), "Asian")).toBeGreaterThanOrEqual(optionScoreThreshold(field("raceEthnicity", "East Asian")));
    expect(optionAnswerScore(field("veteranStatus", "I am not a protected veteran"), "I am not a protected veteran")).toBeGreaterThanOrEqual(optionScoreThreshold(field("veteranStatus", "I am not a protected veteran")));
    expect(optionAnswerScore(field("jobSource", "LinkedIn"), "Online job board")).toBeGreaterThanOrEqual(optionScoreThreshold(field("jobSource", "LinkedIn")));
    expect(optionAnswerScore(field("desiredStartDate", "June"), "Summer 2026")).toBeGreaterThanOrEqual(optionScoreThreshold(field("desiredStartDate", "June")));
    expect(optionAnswerScore(field("desiredStartDate", "June"), "June 2026 full-time")).toBeGreaterThanOrEqual(optionScoreThreshold(field("desiredStartDate", "June")));
  });

  test("matches location options across state and country abbreviations", () => {
    expect(optionTextMatchesValue("durham north carolina united states", "Durham, NC, USA")).toBe(true);
    expect(optionTextMatchesValue("durham nc us", "Durham, North Carolina, United States")).toBe(true);
  });

  test("rejects unrelated available options instead of forcing an answer", () => {
    expect(optionAnswerScore(field("jobSource", "LinkedIn"), "Employee referral")).toBe(0);
    expect(optionAnswerScore(field("raceEthnicity", "East Asian"), "Hispanic or Latino")).toBe(0);
    expect(optionAnswerScore(field("gender", "Male"), "Female")).toBe(0);
    expect(optionAnswerScore(field("title", "Mr."), "Mrs.")).toBe(0);
    expect(optionTextMatchesValue("mrs", "Mr.")).toBe(false);
  });

  test("includes custom segmented choice buttons in autofill controls", () => {
    expect(AUTOFILL_CONTROL_SELECTOR).toContain("[role='button']");
    expect(autofillChoiceRole("button")).toBe("button");
    expect(autofillChoiceRole("radio")).toBe("radio");
    expect(autofillChoiceRole("link")).toBeNull();
    expect(isInteractiveButtonInputType("button")).toBe(true);
    expect(isInteractiveButtonInputType("submit")).toBe(false);
    expect(isAutofillButtonTypeAllowed("submit")).toBe(false);
    expect(isAutofillButtonTypeAllowed("button")).toBe(true);
    expect(isAutofillButtonTypeAllowed("reset")).toBe(false);
  });

  test("flags submit, next, continue, and apply controls as unsafe actions", () => {
    expect(isUnsafeAutofillActionText("Submit application")).toBe(true);
    expect(isUnsafeAutofillActionText("Next")).toBe(true);
    expect(isUnsafeAutofillActionText("Continue")).toBe(true);
    expect(isUnsafeAutofillActionText("Apply now")).toBe(true);
    expect(isUnsafeAutofillActionText("Yes, I am authorized")).toBe(false);
  });
});
