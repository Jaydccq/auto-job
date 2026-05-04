/**
 * Workday hosted-form apply flow.
 *
 * URLs typically: https://<tenant>.<wd>.myworkdayjobs.com/<sitePath>/job/.../apply
 *
 * Workday applications span multiple pages (Personal Info → Work History →
 * Education → Voluntary Disclosures → Review). This flow handles only the
 * FIRST page (typically personal info + name + email + phone). Multi-step
 * progression is deferred to a follow-up phase.
 */

import { SubmitNotPermittedError } from "../errors.js";
import { fillFormGeneric } from "../fill.js";
import { identifyFormGeneric } from "../identify.js";
import { WORKDAY_SELECTORS } from "../selectors.js";
import { submitGeneric } from "../greenhouse/apply.js";
import type { ApplyFlow, SubmitOptions, SubmitResult } from "../types.js";

// Workday's "next page" button on multi-step forms. NOT actually clicked
// by submit() in this fill-only phase — the gate still blocks unless
// allowSubmit:true.
const SUBMIT_BUTTON_SELECTORS = [
  'button[data-automation-id="bottom-navigation-next-button"]',
  'button[data-automation-id="wd-FormButton-submit"]',
  'button[type="submit"]',
];

const SUCCESS_INDICATORS = [
  /thank you/i,
  /your application/i,
  /successfully submitted/i,
];

export const workdayApplyFlow: ApplyFlow = {
  ats: "workday",

  detectsUrl(url: string): boolean {
    try {
      const u = new URL(url);
      return /\.myworkdayjobs\.com$/.test(u.hostname);
    } catch {
      return false;
    }
  },

  async identifyForm(tab) {
    return identifyFormGeneric(tab, WORKDAY_SELECTORS);
  },

  async fillForm(tab, schema, data) {
    return fillFormGeneric(tab, schema, data, "workday");
  },

  async submit(tab, opts: SubmitOptions): Promise<SubmitResult> {
    if (opts.allowSubmit !== true) throw new SubmitNotPermittedError();
    return submitGeneric(tab, "workday", SUBMIT_BUTTON_SELECTORS, SUCCESS_INDICATORS);
  },
};
