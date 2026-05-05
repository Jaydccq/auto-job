/**
 * Per-ATS selector tables.
 *
 * Each adapter has 3+ selector alternates per standard field for resilience.
 * Probed in order; first match wins.
 *
 * To add a selector for a newly-discovered ATS form variant, append to the
 * relevant array. Tests should use captured form HTML fixtures.
 */

import type { StandardFieldKey } from "./types.js";

export type SelectorTable = Partial<Record<StandardFieldKey, readonly string[]>>;

export const GREENHOUSE_SELECTORS: SelectorTable = {
  firstName: [
    'input[name="job_application[first_name]"]',
    'input#first_name',
    'input[autocomplete="given-name"]',
  ],
  lastName: [
    'input[name="job_application[last_name]"]',
    'input#last_name',
    'input[autocomplete="family-name"]',
  ],
  email: [
    'input[name="job_application[email]"]',
    'input#email',
    'input[type="email"]',
  ],
  phone: [
    'input[name="job_application[phone]"]',
    'input#phone',
    'input[type="tel"]',
  ],
  resume: [
    'input#resume',
    'input[name="job_application[resume]"]',
    'input[type="file"][name*="resume"]',
  ],
  coverLetter: [
    'textarea[name="job_application[cover_letter_text]"]',
    'textarea#cover_letter',
  ],
  linkedin: [
    'input[name*="linkedin" i]',
    'input[id*="linkedin" i]',
  ],
};

export const LEVER_SELECTORS: SelectorTable = {
  fullName: [
    'input[name="name"]',
    'input#name',
  ],
  email: [
    'input[name="email"]',
    'input#email',
    'input[type="email"]',
  ],
  phone: [
    'input[name="phone"]',
    'input[type="tel"]',
  ],
  resume: [
    'input[name="resume"]',
    'input[type="file"]',
  ],
  linkedin: [
    'input[name="urls[LinkedIn]"]',
    'input[name="urls[linkedin]" i]',
  ],
  github: [
    'input[name="urls[GitHub]"]',
    'input[name="urls[github]" i]',
  ],
  portfolio: [
    'input[name="urls[Portfolio]"]',
    'input[name="urls[portfolio]" i]',
    'input[name="urls[Other]"]',
  ],
  city: [
    'input[name="location"]',
  ],
  coverLetter: [
    'textarea[name="comments"]',
  ],
};

export const ASHBY_SELECTORS: SelectorTable = {
  fullName: [
    'input[id$="name"]',
    'input[name="_systemfield_name"]',
  ],
  email: [
    'input[id$="email"]',
    'input[name="_systemfield_email"]',
    'input[type="email"]',
  ],
  phone: [
    'input[id$="phone"]',
    'input[name="_systemfield_phone"]',
    'input[type="tel"]',
  ],
  resume: [
    'input[type="file"][accept*="pdf" i]',
    'input[type="file"]',
  ],
  linkedin: [
    'input[id*="linkedin" i]',
    'input[name*="linkedin" i]',
  ],
};

export const WORKDAY_SELECTORS: SelectorTable = {
  firstName: [
    'input[data-automation-id="legalNameSection_firstName"]',
    'input[id*="firstName" i]',
  ],
  lastName: [
    'input[data-automation-id="legalNameSection_lastName"]',
    'input[id*="lastName" i]',
  ],
  email: [
    'input[data-automation-id="email"]',
    'input[type="email"]',
  ],
  phone: [
    'input[data-automation-id="phone-number"]',
    'input[type="tel"]',
  ],
  city: [
    'input[data-automation-id="addressSection_city"]',
  ],
  state: [
    'input[data-automation-id="addressSection_countryRegion"]',
  ],
  country: [
    'button[data-automation-id="countryDropdown"]',
  ],
  resume: [
    'input[data-automation-id="file-upload-input-ref"]',
    'input[type="file"]',
  ],
};
