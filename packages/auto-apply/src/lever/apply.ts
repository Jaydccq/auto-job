/**
 * Lever hosted-form apply flow.
 *
 * URLs typically: https://jobs.lever.co/<company>/<job-id>/apply
 */

import { SubmitNotPermittedError } from "../errors.js";
import { fillFormGeneric } from "../fill.js";
import { identifyFormGeneric } from "../identify.js";
import { LEVER_SELECTORS } from "../selectors.js";
import { submitGeneric } from "../greenhouse/apply.js";
import type { ApplyFlow, SubmitOptions, SubmitResult } from "../types.js";

const SUBMIT_BUTTON_SELECTORS = [
  'button[type="submit"]',
  'button[data-qa="btn-submit"]',
  'input[type="submit"]',
];

const SUCCESS_INDICATORS = [
  /thank.you/i,
  /application.*received/i,
  /we'll be in touch/i,
];

export const leverApplyFlow: ApplyFlow = {
  ats: "lever",

  detectsUrl(url: string): boolean {
    try {
      const u = new URL(url);
      return /(^|\.)lever\.co$/.test(u.hostname);
    } catch {
      return false;
    }
  },

  async identifyForm(tab) {
    return identifyFormGeneric(tab, LEVER_SELECTORS);
  },

  async fillForm(tab, schema, data) {
    return fillFormGeneric(tab, schema, data, "lever");
  },

  async submit(tab, opts: SubmitOptions): Promise<SubmitResult> {
    if (opts.allowSubmit !== true) throw new SubmitNotPermittedError();
    return submitGeneric(tab, "lever", SUBMIT_BUTTON_SELECTORS, SUCCESS_INDICATORS);
  },
};
