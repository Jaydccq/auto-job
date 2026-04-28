import type { AutofillProfileField } from "../contracts/bridge-wire.js";

export type AutofillAnswerPolarity = "yes" | "no" | "unknown";
export type AutofillChoiceRole = "radio" | "checkbox" | "button";

export const AUTOFILL_CONTROL_SELECTOR =
  "input, textarea, select, button, [role='radio'], [role='checkbox'], [role='button']";

export function autofillChoiceRole(role: string | null): AutofillChoiceRole | null {
  const normalized = role?.toLowerCase() ?? "";
  if (normalized === "radio" || normalized === "checkbox" || normalized === "button") return normalized;
  return null;
}

export function isInteractiveButtonInputType(type: string): boolean {
  return type.toLowerCase() === "button";
}

export function isAutofillButtonTypeAllowed(type: string): boolean {
  return type.toLowerCase() === "button";
}

export function isUnsafeAutofillActionText(value: string): boolean {
  const normalized = normalizeAutofillOptionText(value);
  if (!normalized) return false;
  return /\b(apply|submit|next|continue)\b/.test(normalized);
}

const US_STATE_NAMES: Record<string, string> = {
  al: "alabama", ak: "alaska", az: "arizona", ar: "arkansas", ca: "california",
  co: "colorado", ct: "connecticut", de: "delaware", fl: "florida", ga: "georgia",
  hi: "hawaii", id: "idaho", il: "illinois", in: "indiana", ia: "iowa",
  ks: "kansas", ky: "kentucky", la: "louisiana", me: "maine", md: "maryland",
  ma: "massachusetts", mi: "michigan", mn: "minnesota", ms: "mississippi",
  mo: "missouri", mt: "montana", ne: "nebraska", nv: "nevada", nh: "new hampshire",
  nj: "new jersey", nm: "new mexico", ny: "new york", nc: "north carolina",
  nd: "north dakota", oh: "ohio", ok: "oklahoma", or: "oregon", pa: "pennsylvania",
  ri: "rhode island", sc: "south carolina", sd: "south dakota", tn: "tennessee",
  tx: "texas", ut: "utah", vt: "vermont", va: "virginia", wa: "washington",
  wv: "west virginia", wi: "wisconsin", wy: "wyoming", dc: "district of columbia",
};

export function normalizeAutofillOptionText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

export function answerPolarity(value: string): AutofillAnswerPolarity {
  const normalized = normalizeAutofillOptionText(value);
  if (/\b(no|none|n a|not applicable|do not|dont|does not|without|not a protected veteran|not protected veteran|not a veteran|do not have a disability|no disability)\b/.test(normalized)) {
    return "no";
  }
  if (/\b(yes|require|requires|need|needs|sponsorship support)\b/.test(normalized)) return "yes";
  return "unknown";
}

export function optionScoreThreshold(field: Pick<AutofillProfileField, "key">): number {
  if (field.key === "jobSource") return 0.56;
  if (field.key === "raceEthnicity" || field.key === "gender" || field.key === "disabilityStatus" || field.key === "veteranStatus") return 0.58;
  return 0.62;
}

export function optionAnswerScore(field: Pick<AutofillProfileField, "key" | "value">, optionText: string): number {
  const option = normalizeAutofillOptionText(optionText);
  const value = normalizeAutofillOptionText(field.value);
  if (!option || !value) return 0;
  switch (field.key) {
    case "workAuthorization":
    case "workAuthorizationUs":
    case "workAuthorizationCanada":
    case "workAuthorizationUk":
    case "age18":
    case "willingToRelocate":
    case "onsiteWork":
    case "lgbtqStatus":
    case "experienceCurrentJob":
    case "experienceInternal":
    case "internalCandidate":
      return yesNoOptionScore(answerPolarity(field.value), option);
    case "sponsorship":
      return sponsorshipOptionScore(answerPolarity(field.value), option);
    case "disabilityStatus":
      return disabilityOptionScore(field.value, option);
    case "veteranStatus":
      return veteranOptionScore(field.value, option);
    case "raceEthnicity":
      return raceOptionScore(field.value, option);
    case "gender":
      return genderOptionScore(field.value, option);
    case "jobSource":
      return jobSourceOptionScore(field.value, option);
    case "desiredStartDate":
      return startDateOptionScore(field.value, option);
    case "title":
      return titleOptionScore(field.value, option);
    default:
      return optionTextMatchesValue(option, field.value) ? 1 : 0;
  }
}

export function optionTextMatchesValue(normalizedOptionText: string, value: string): boolean {
  const normalizedValue = normalizeAutofillOptionText(value);
  if (!normalizedValue) return false;
  if (normalizedOptionText === normalizedValue) return true;
  if (normalizedValue.length >= 3 && normalizedOptionText.includes(normalizedValue)) return true;
  if (normalizedOptionText.length >= 3 && normalizedValue.includes(normalizedOptionText)) return true;
  const canonicalOption = canonicalLocationText(normalizedOptionText);
  const canonicalValue = canonicalLocationText(normalizedValue);
  if (canonicalOption === canonicalValue) return true;
  if (canonicalValue.length >= 3 && canonicalOption.includes(canonicalValue)) return true;
  if (canonicalOption.length >= 3 && canonicalValue.includes(canonicalOption)) return true;
  const stateName = US_STATE_NAMES[normalizedValue];
  if (stateName && normalizedOptionText.includes(stateName)) return true;
  if (stateName && normalizedOptionText === normalizedValue) return true;
  const stateCode = Object.entries(US_STATE_NAMES).find(([, name]) => normalizedValue === name)?.[0];
  if (stateCode && normalizedOptionText === stateCode) return true;
  if (normalizedValue === "united states" && /\b(united states|usa|us|u s a|u s)\b/.test(normalizedOptionText)) return true;
  if (normalizedValue === "1" && /\b(united states|usa|us|u s)\b/.test(normalizedOptionText)) return true;
  return false;
}

function canonicalLocationText(normalizedText: string): string {
  let text = ` ${normalizedText} `;
  text = text.replace(/\b(united states of america|u s a|usa|u s|us)\b/g, "united states");
  for (const [code, name] of Object.entries(US_STATE_NAMES)) {
    text = text.replace(new RegExp(`\\b${code}\\b`, "g"), name);
  }
  return text.replace(/\s+/g, " ").trim();
}

function yesNoOptionScore(answer: AutofillAnswerPolarity, option: string): number {
  if (answer === "yes") {
    if (/\b(no|false|not|cannot|can t|unable|decline|do not|dont)\b/.test(option)) return 0;
    if (/\b(yes|true)\b/.test(option)) return 1;
    if (/\b(authorized|eligible|able|willing|open|can work|legally work)\b/.test(option)) return 0.82;
    return 0;
  }
  if (answer === "no") {
    if (/\b(yes|true)\b/.test(option) && !/\b(no|not|do not|dont|false)\b/.test(option)) return 0;
    if (/\b(no|false|not|do not|dont|decline|none)\b/.test(option)) return 1;
  }
  return 0;
}

function sponsorshipOptionScore(answer: AutofillAnswerPolarity, option: string): number {
  if (answer === "yes") {
    if (/\b(no|not|without|do not|dont|will not)\b/.test(option)) return 0;
    if (/\b(yes|require|need|sponsor|sponsorship|visa|h1b|h 1b|employment based)\b/.test(option)) return 1;
    return 0;
  }
  if (answer === "no") {
    if (/\b(no|not|without|do not|dont|will not)\b/.test(option) && /\b(sponsor|sponsorship|visa|require|need)\b/.test(option)) return 1;
    if (/\b(no|false)\b/.test(option)) return 0.9;
  }
  return 0;
}

function disabilityOptionScore(value: string, option: string): number {
  const answer = answerPolarity(value);
  const normalizedValue = normalizeAutofillOptionText(value);
  const valueIsDecline = /\b(prefer not|decline|do not wish|dont wish)\b/.test(normalizedValue);
  const optionIsDecline = /\b(prefer not|decline|do not wish|dont wish)\b/.test(option);
  if (valueIsDecline) return optionIsDecline ? 1 : 0;
  if (answer === "no") {
    if (/\b(yes|i have|have a disability|disabled)\b/.test(option) && !/\b(no|not|do not|dont)\b/.test(option)) return 0;
    if (/\b(do not have|dont have|not disabled|no disability|have not had)\b/.test(option)) return 1;
    if (/\b(no|none)\b/.test(option) && /\b(disability|disabled)\b/.test(option)) return 1;
    if (option === "no") return 0.9;
    if (optionIsDecline) return 0.2;
  }
  return yesNoOptionScore(answer, option);
}

function veteranOptionScore(value: string, option: string): number {
  const answer = answerPolarity(value);
  if (answer === "no") {
    if (/\b(not a protected veteran|not protected veteran|not a veteran|no|do not identify|dont identify)\b/.test(option)) return 1;
    if (/\b(protected veteran|veteran)\b/.test(option)) return 0;
  }
  return yesNoOptionScore(answer, option);
}

function raceOptionScore(value: string, option: string): number {
  const normalizedValue = normalizeAutofillOptionText(value);
  if (optionTextMatchesValue(option, value)) return 1;
  if (/\basian\b/.test(normalizedValue)) {
    if (/\beast asian\b/.test(option)) return 1;
    if (/\basian\b/.test(option)) return 0.88;
    if (/\b(chinese|china|korean|japanese|taiwanese|hong kong)\b/.test(option)) return 0.78;
  }
  return 0;
}

function genderOptionScore(value: string, option: string): number {
  const normalizedValue = normalizeAutofillOptionText(value);
  if (option === normalizedValue) return 1;
  if (/\b(male|man)\b/.test(normalizedValue)) {
    if (/\b(female|woman|trans woman)\b/.test(option)) return 0;
    if (/\b(male|man|cisgender man|cis man)\b/.test(option)) return 1;
  }
  if (/\b(female|woman)\b/.test(normalizedValue)) {
    if (/\b(male|man|trans man)\b/.test(option)) return 0;
    if (/\b(female|woman|cisgender woman|cis woman)\b/.test(option)) return 1;
  }
  return 0;
}

function titleOptionScore(value: string, option: string): number {
  const normalizedValue = normalizeAutofillOptionText(value);
  if (option === normalizedValue) return 1;
  if (normalizedValue === "mr" && /\b(mister|mr)\b/.test(option) && !/\b(mrs|ms|miss)\b/.test(option)) return 1;
  if (normalizedValue === "ms" && /\b(ms)\b/.test(option) && !/\b(mrs|miss)\b/.test(option)) return 1;
  if (normalizedValue === "mrs" && /\b(mrs)\b/.test(option)) return 1;
  if (normalizedValue === "miss" && /\b(miss)\b/.test(option)) return 1;
  if (normalizedValue === "doctor" && /\b(doctor|dr)\b/.test(option)) return 1;
  if (normalizedValue === "dr" && /\b(doctor|dr)\b/.test(option)) return 1;
  return 0;
}

function jobSourceOptionScore(value: string, option: string): number {
  const normalizedValue = normalizeAutofillOptionText(value);
  if (optionTextMatchesValue(option, value)) return 1;
  if (/\blinkedin\b/.test(normalizedValue)) {
    if (/\blinkedin\b/.test(option)) return 1;
    if (/\b(job board|online job board|job site|jobs board|career site)\b/.test(option)) return 0.74;
    if (/\b(social media|social network)\b/.test(option)) return 0.62;
  }
  return 0;
}

function startDateOptionScore(value: string, option: string): number {
  const normalizedValue = normalizeAutofillOptionText(value);
  if (optionTextMatchesValue(option, value)) return 1;
  if (normalizedValue === "june" && /\b(jun|summer|mid year)\b/.test(option)) return 0.74;
  return 0;
}
