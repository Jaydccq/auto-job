/**
 * Ashby hosted-form apply flow.
 *
 * URLs typically: https://jobs.ashbyhq.com/<company>/<job-id>
 * Ashby uses a React SPA; selectors target the rendered form.
 */

import { SubmitNotPermittedError } from "../errors.js";
import { fillFormGeneric } from "../fill.js";
import { identifyFormGeneric } from "../identify.js";
import { ASHBY_SELECTORS } from "../selectors.js";
import { submitGeneric } from "../greenhouse/apply.js";
import type { ApplyFlow, SubmitOptions, SubmitResult } from "../types.js";

const SUBMIT_BUTTON_SELECTORS = [
  'button[type="submit"]',
  'button[data-testid="apply-form-submit-button"]',
];

const SUCCESS_INDICATORS = [
  /thank you/i,
  /application has been submitted/i,
];

export const ashbyApplyFlow: ApplyFlow = {
  ats: "ashby",

  detectsUrl(url: string): boolean {
    try {
      const u = new URL(url);
      return u.hostname === "jobs.ashbyhq.com";
    } catch {
      return false;
    }
  },

  async identifyForm(tab) {
    return identifyFormGeneric(tab, ASHBY_SELECTORS);
  },

  async fillForm(tab, schema, data) {
    return fillFormGeneric(tab, schema, data, "ashby");
  },

  async submit(tab, opts: SubmitOptions): Promise<SubmitResult> {
    if (opts.allowSubmit !== true) throw new SubmitNotPermittedError();
    return submitGeneric(tab, "ashby", SUBMIT_BUTTON_SELECTORS, SUCCESS_INDICATORS);
  },
};
