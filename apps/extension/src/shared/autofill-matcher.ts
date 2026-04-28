/**
 * autofill-matcher.ts — pure autofill matching engine.
 *
 * Given a profile and a Document, returns ordered (control, field) matches
 * with confidences. Lives outside inject.ts so it can be unit-tested with
 * happy-dom fixtures.
 *
 * Safety boundary: this module never clicks, submits, or mutates DOM
 * values. It only inspects elements and produces a sortable plan.
 */

import type { AutofillProfile, AutofillProfileField } from "../contracts/bridge-wire.js";
import {
  AUTOFILL_CONTROL_SELECTOR,
  answerPolarity,
  optionAnswerScore,
  optionScoreThreshold,
  optionTextMatchesValue,
} from "./autofill-option-scoring.js";
import {
  autofillControlAlreadySet,
  autofillInputKind,
  contextControlLabel,
  controlLabel,
  directControlLabel,
  isAutofillCandidate,
  normalizeAutofillLabel,
  optionTextCandidatesForControl,
  type AutofillControl,
  type AutofillInputKind,
  type AutofillVisibilityOptions,
} from "./autofill-dom.js";

export interface AutofillMatch {
  control: AutofillControl;
  field: AutofillProfileField;
  label: string;
  confidence: number;
  inputKind: AutofillInputKind;
  fieldIndex: number;
}

export interface ScanOptions {
  visibility?: AutofillVisibilityOptions;
  threshold?: number;
}

const OPTION_FIELD_KEYS = new Set<AutofillProfileField["key"]>([
  "age18",
  "workAuthorization",
  "workAuthorizationUs",
  "workAuthorizationCanada",
  "workAuthorizationUk",
  "sponsorship",
  "jobSource",
  "willingToRelocate",
  "desiredStartDate",
  "onsiteWork",
  "currentVisaStatus",
  "futureVisaStatus",
  "internalCandidate",
  "disabilityStatus",
  "raceEthnicity",
  "lgbtqStatus",
  "gender",
  "veteranStatus",
  "experienceCurrentJob",
  "experienceInternal",
  "preferredWorkLocation",
]);

const ADDRESS_FIELD_KEYS = new Set<AutofillProfileField["key"]>([
  "location",
  "addressLine1",
  "addressLine2",
  "addressLine3",
  "city",
  "county",
  "state",
  "postalCode",
  "country",
]);

const AUTOCOMPLETE_BOOSTS: Partial<Record<AutofillProfileField["key"], readonly string[]>> = {
  email: ["email"],
  title: ["honorific prefix"],
  fullName: ["name"],
  birthday: ["bday"],
  firstName: ["given name"],
  lastName: ["family name"],
  phone: ["tel", "tel national"],
  phoneCountryCode: ["tel country code"],
  phoneNational: ["tel national", "tel"],
  addressLine1: ["address line1", "street address", "address line 1"],
  addressLine2: ["address line2", "address line 2"],
  addressLine3: ["address line3", "address line 3"],
  city: ["address level2"],
  county: ["address level3"],
  state: ["address level1"],
  postalCode: ["postal code"],
  country: ["country", "country name"],
  linkedIn: ["url"],
  github: ["url"],
  portfolio: ["url"],
  desiredSalary: ["transaction amount"],
  educationSchool: ["organization"],
  educationAreaOfStudy: ["organization title"],
  experienceEmployer: ["organization"],
  experienceJobTitle: ["organization title"],
};

const ADDRESS_BLOCK_PATTERNS: Partial<Record<AutofillProfileField["key"], readonly RegExp[]>> = {
  addressLine1: [/\b(country|city|county|state|province|region|postal|postcode|zip|address line 2|address 2|address line 3|address 3|tax district)\b/],
  addressLine2: [/\b(country|city|county|state|province|region|postal|postcode|zip|address line 1|address 1|address line 3|address 3|tax district)\b/],
  addressLine3: [/\b(country|city|county|state|province|region|postal|postcode|zip|address line 1|address 1|address line 2|address 2|tax district)\b/],
  city: [/\b(country|county|state|province|region|postal|postcode|zip|address line|address 1|address 2|address 3|tax district)\b/],
  county: [/\b(country|city|state|province|region|postal|postcode|zip|address line|address 1|address 2|address 3|tax district)\b/],
  state: [/\b(country|city|county|postal|postcode|zip|address line|address 1|address 2|address 3|tax district)\b/],
  postalCode: [/\b(country|city|county|state|province|region|address line|address 1|address 2|address 3|tax district)\b/],
  country: [/\b(country code|phone country|city|county|state|province|region|postal|postcode|zip|address line|address 1|address 2|address 3|tax district)\b/],
  phoneCountryCode: [/\b(address|city|county|state|postal|zip)\b/],
  phoneNational: [/\b(address|city|county|state|postal|zip|country code)\b/],
};

function textHasAny(text: string, patterns: readonly RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

export function isOptionField(field: AutofillProfileField): boolean {
  return OPTION_FIELD_KEYS.has(field.key) || field.key === "title";
}

export function pageHasPhoneCountryCodeControl(doc: Document): boolean {
  return Array.from(doc.querySelectorAll("input, textarea, select")).some((control) => (
    control instanceof HTMLInputElement
    || control instanceof HTMLTextAreaElement
    || control instanceof HTMLSelectElement
  ) && /\b(country code|phone country|dialing code|calling code)\b/.test(normalizeAutofillLabel(controlLabel(control, doc))));
}

export function resumeFileControls(doc: Document): HTMLInputElement[] {
  return Array.from(doc.querySelectorAll<HTMLInputElement>("input[type='file']")).filter((control) => {
    if (control.disabled || (control.files?.length ?? 0) > 0) return false;
    const label = normalizeAutofillLabel(controlLabel(control, doc));
    const accept = normalizeAutofillLabel(control.accept);
    if (/\b(cover letter|transcript|portfolio|photo|image|headshot|avatar)\b/.test(label)) return false;
    return /\b(resume|cv|curriculum vitae)\b/.test(label) || /\bpdf\b/.test(accept);
  });
}

export function bestSelectOption(
  control: HTMLSelectElement,
  field: AutofillProfileField,
  value: string,
): HTMLOptionElement | null {
  const candidates = Array.from(control.options)
    .filter((option) => !option.disabled)
    .map((option, index) => {
      const text = normalizeAutofillLabel(`${option.textContent ?? ""} ${option.value}`);
      const score = Math.max(
        optionAnswerScore(field, text),
        optionTextMatchesValue(text, value) ? 1 : 0,
      );
      const placeholderPenalty = index === 0 && !option.value.trim() ? 0.4 : 0;
      return { option, score: Math.max(0, score - placeholderPenalty) };
    })
    .filter((candidate) => candidate.score >= optionScoreThreshold(field))
    .sort((a, b) => b.score - a.score);
  return candidates[0]?.option ?? null;
}

export function optionAnswerScoreForControl(
  control: AutofillControl,
  field: AutofillProfileField,
  doc: Document,
): number {
  return Math.max(0, ...optionTextCandidatesForControl(control, doc).map((text) => optionAnswerScore(field, text)));
}

export function optionMatchesAnswer(
  control: AutofillControl,
  field: AutofillProfileField,
  doc: Document,
): boolean {
  return optionAnswerScoreForControl(control, field, doc) >= optionScoreThreshold(field);
}

export function checkboxShouldBeChecked(
  control: AutofillControl,
  field: AutofillProfileField,
  doc: Document,
): boolean {
  const optionScore = optionAnswerScoreForControl(control, field, doc);
  if (optionScore >= optionScoreThreshold(field)) return true;
  const answer = answerPolarity(field.value);
  const label = normalizeAutofillLabel(controlLabel(control, doc));
  if (answer === "unknown") return false;
  if (answer === "yes") return /\b(sponsorship|visa|require|need|authorized|eligible)\b/.test(label);
  return /\b(no sponsorship|do not require|without sponsorship|authorized to work)\b/.test(label);
}

export function scoreAutofillMatch(
  control: AutofillControl,
  field: AutofillProfileField,
  doc: Document,
): number {
  const directLabel = normalizeAutofillLabel(directControlLabel(control, doc));
  const contextLabel = normalizeAutofillLabel(contextControlLabel(control, doc));
  const autocomplete = normalizeAutofillLabel(control.getAttribute("autocomplete") ?? "");
  const label = `${directLabel} ${contextLabel}`.trim();
  const inputKind = autofillInputKind(control);
  let score = 0;

  for (const token of AUTOCOMPLETE_BOOSTS[field.key] ?? []) {
    if (autocomplete.includes(token)) score = Math.max(score, 0.92);
  }

  for (const alias of field.aliases) {
    const normalizedAlias = normalizeAutofillLabel(alias);
    if (normalizedAlias && directLabel.includes(normalizedAlias)) {
      score = Math.max(score, normalizedAlias.length >= 8 ? 0.88 : 0.72);
    } else if (normalizedAlias && contextLabel.includes(normalizedAlias)) {
      score = Math.max(score, normalizedAlias.length >= 8 ? 0.7 : 0.55);
    }
  }

  if (field.key === "fullName" && textHasAny(`${directLabel} ${autocomplete}`, [
    /\b(first|given|preferred|middle|last|family|surname|suffix|honorific|prefix)\s+name\b/,
    /\b(given|family|honorific)\b/,
  ])) {
    score = 0;
  }

  const hasExplicitFirstNameLabel = /\b(first|given)\s+name\b/.test(directLabel);
  const hasExplicitLastNameLabel = /\b(last|family|surname)\s+name\b/.test(directLabel);
  if (field.key === "firstName" && !hasExplicitFirstNameLabel
    && textHasAny(directLabel, [/\b(middle|last|family|surname|full|legal|preferred)\s+name\b/])) {
    score = 0;
  }
  if (field.key === "middleName"
    && textHasAny(directLabel, [/\b(first|given|last|family|surname|full|legal|preferred)\s+name\b/])) {
    score = 0;
  }
  if (field.key === "lastName" && !hasExplicitLastNameLabel
    && textHasAny(directLabel, [/\b(first|given|middle|full|legal)\s+name\b/, /\bpreferred\s+name\b/])) {
    score = 0;
  }

  const blockedByDirectLabel = ADDRESS_BLOCK_PATTERNS[field.key];
  if (blockedByDirectLabel && textHasAny(directLabel, blockedByDirectLabel)) {
    score = 0;
  }

  const asksCurrentCityState = /\b(city\s+(?:and|\/)\s+state|city\s+(?:and|\/)\s+state\s+province|state\s+province)\b/.test(label)
    && /\b(located|location|today|current)\b/.test(label);
  if (field.key === "location" && asksCurrentCityState) score = Math.max(score, 0.94);
  if ((field.key === "city" || field.key === "state") && asksCurrentCityState) score = 0;

  if (field.key === "email" && control instanceof HTMLInputElement && control.type === "email") {
    score = Math.max(score, 0.96);
  }

  if (field.key === "resumeFile") {
    if (!(control instanceof HTMLInputElement) || control.type.toLowerCase() !== "file") return 0;
    if ((control.files?.length ?? 0) > 0) return 0;
    if (/\b(resume|cv|curriculum vitae)\b/.test(label)) score = Math.max(score, 0.96);
    else if (/\bpdf\b/.test(normalizeAutofillLabel(control.accept))) score = Math.max(score, 0.7);
    if (/\b(cover letter|transcript|portfolio|photo|image|headshot|avatar)\b/.test(label)) score = 0;
  } else if (inputKind === "file") {
    score = 0;
  }

  if (field.key === "phoneNational" && control instanceof HTMLInputElement && control.type === "tel") {
    score = Math.max(score, 0.94);
  }
  if (field.key === "phoneNational" && !pageHasPhoneCountryCodeControl(doc)
    && !/\b(national|local|without country)\b/.test(label)) {
    score = Math.min(score, 0.66);
  }
  if (field.key === "phone" && control instanceof HTMLInputElement && control.type === "tel") {
    score = Math.max(score, /\b(international|country code|including country)\b/.test(label)
      || !pageHasPhoneCountryCodeControl(doc) ? 0.94 : 0.76);
  }

  const combinedUsUkQuestion = /\b(us|u s|usa|united states)\b/.test(label)
    && /\b(united kingdom|uk|u k|great britain|britain)\b/.test(label);
  if (field.key === "workAuthorization" && /\b(canada|united kingdom|uk|great britain)\b/.test(label) && !combinedUsUkQuestion) score = 0;
  if (field.key === "workAuthorizationUs" && !/\b(us|u s|usa|united states|this country)\b/.test(label)) score = 0;
  if (field.key === "workAuthorizationCanada" && !/\b(canada|canadian)\b/.test(label)) score = 0;
  if (field.key === "workAuthorizationUk" && !/\b(united kingdom|uk|u k|great britain|britain)\b/.test(label)) score = 0;
  if (field.key === "jobSource" && !/\b(how did you hear|hear about|job source|referral source|source)\b/.test(label)) score = 0;
  if (field.key === "willingToRelocate" && !/\b(relocate|relocation)\b/.test(label)) score = 0;
  if (field.key === "desiredStartDate" && !/\b(desired start date|available start date|when can you start|when is your desired start date|how soon can you start|start full time|start full-time)\b/.test(label)) score = 0;
  if (field.key === "desiredStartDate" && /\b(education|school|degree|employer|experience|job title|end date)\b/.test(label)) score = 0;
  if (field.key === "onsiteWork" && !/\b(on site|onsite|on-site|in office|work site)\b/.test(label)) score = 0;
  if (field.key === "raceEthnicity" && /\b(race|ethnicity|ethnic)\b/.test(label)) score = Math.max(score, 0.72);
  if (field.key === "lgbtqStatus" && /\b(lgbtq|lgbt|sexual orientation)\b/.test(label)) score = Math.max(score, 0.72);
  if (field.key === "gender" && /\bgender\b/.test(label)) score = Math.max(score, 0.72);
  if (field.key === "veteranStatus" && /\bveteran\b/.test(label)) score = Math.max(score, 0.72);
  if (field.key === "preferredWorkLocations" && !/\b(where would you like to work|preferred work locations|preferred locations|location preferences)\b/.test(label)) score = 0;
  if (field.key === "preferredWorkLocation" && !/\b(where would you like to work|preferred work location|preferred location|location preference)\b/.test(label)) score = 0;
  if (ADDRESS_FIELD_KEYS.has(field.key) && /\b(preferred|desired|target|willing|open to)\s+(work\s+)?location\b|\blocation preference\b/.test(label)) {
    score = 0;
  }
  if (["country", "city", "state"].includes(field.key)
    && /\b(education|school|degree|employer|experience|job title|current job|internal)\b/.test(contextLabel)) {
    score = 0;
  }
  if (field.key === "educationDegree" && !/\b(education|degree|school|university|college)\b/.test(label)) score = 0;
  if (field.key === "educationSchool" && !/\b(education|school|university|college|institution)\b/.test(label)) score = 0;
  if (field.key.startsWith("education") && /\b(employer|job title|current job|internal|experience)\b/.test(label)) score = 0;
  if (field.key === "experienceEmployer" && !/\b(employer|company|organization|experience)\b/.test(label)) score = 0;
  if (field.key === "experienceJobTitle" && !/\b(job title|position title|experience)\b/.test(label)) score = 0;
  if (field.key.startsWith("experience") && /\b(education|school|university|college|degree|area of study)\b/.test(label)) score = 0;
  if ((inputKind === "radio" || inputKind === "checkbox" || inputKind === "button") && !isOptionField(field)) {
    score = 0;
  }
  if (inputKind === "radio" && !optionMatchesAnswer(control, field, doc)) {
    score = 0;
  }
  if (inputKind === "checkbox" && !checkboxShouldBeChecked(control, field, doc)) {
    score = 0;
  }
  if (inputKind === "button" && !optionMatchesAnswer(control, field, doc)) {
    score = 0;
  }
  if (["fullName", "firstName", "lastName"].includes(field.key) && /\b(company|employer|school|university|college)\b/.test(label)) {
    score = 0;
  }
  if (field.key === "location" && /\b(job|role|position|office|preferred|desired|target)\s+location\b/.test(label)) score = 0;
  if ((field.key === "desiredSalary" || field.key === "minimumSalary") && /\b(company|employer|current)\b/.test(label)) score = 0;
  if (inputKind === "select" && control instanceof HTMLSelectElement && score > 0
    && !bestSelectOption(control, field, field.value)) {
    score = 0;
  }
  return score;
}

export function scanAutofillMatches(
  profile: AutofillProfile,
  doc: Document,
  options?: ScanOptions,
): AutofillMatch[] {
  const visibility = options?.visibility;
  const threshold = options?.threshold ?? 0.68;
  const candidatesQuery = Array.from(doc.querySelectorAll(AUTOFILL_CONTROL_SELECTOR));
  const visibleControls = candidatesQuery
    .filter((el): el is AutofillControl => isAutofillCandidate(el, visibility));
  const controls = uniqueElements([...visibleControls, ...resumeFileControls(doc)]);
  const usedControls = new Set<AutofillControl>();
  const usedFieldIndexes = new Set<number>();
  const candidates: AutofillMatch[] = [];
  const matches: AutofillMatch[] = [];
  for (const [fieldIndex, field] of profile.fields.entries()) {
    for (const control of controls) {
      if (autofillControlAlreadySet(control, doc)) continue;
      const confidence = scoreAutofillMatch(control, field, doc);
      if (confidence < threshold) continue;
      const label = controlLabel(control, doc).replace(/\s+/g, " ").trim().slice(0, 80) || field.label;
      candidates.push({
        control,
        field,
        label,
        confidence,
        inputKind: autofillInputKind(control),
        fieldIndex,
      });
    }
  }
  candidates.sort((a, b) =>
    b.confidence - a.confidence
    || b.field.confidence - a.field.confidence
    || a.fieldIndex - b.fieldIndex);
  for (const candidate of candidates) {
    if (usedControls.has(candidate.control) || usedFieldIndexes.has(candidate.fieldIndex)) continue;
    usedControls.add(candidate.control);
    usedFieldIndexes.add(candidate.fieldIndex);
    matches.push(candidate);
  }
  return matches.sort((a, b) => b.confidence - a.confidence);
}

function uniqueElements(elements: AutofillControl[]): AutofillControl[] {
  const seen = new Set<AutofillControl>();
  const result: AutofillControl[] = [];
  for (const el of elements) {
    if (seen.has(el)) continue;
    seen.add(el);
    result.push(el);
  }
  return result;
}
