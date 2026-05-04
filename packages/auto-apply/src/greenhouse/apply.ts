/**
 * Greenhouse hosted-form apply flow.
 *
 * URLs typically: https://boards.greenhouse.io/<company>/jobs/<id>
 * Form is rendered server-side; selectors are stable across companies.
 */

import { SubmitNotPermittedError } from "../errors.js";
import { fillFormGeneric } from "../fill.js";
import { identifyFormGeneric } from "../identify.js";
import { GREENHOUSE_SELECTORS } from "../selectors.js";
import type {
  ApplyFlow,
  FormSchema,
  SubmitOptions,
  SubmitResult,
} from "../types.js";

const SUBMIT_BUTTON_SELECTORS = [
  'input[type="submit"][value*="Submit"]',
  'button[type="submit"]',
  'button[data-cy="submit-button"]',
];

const SUCCESS_INDICATORS = [
  /thank.you/i,
  /application.*submitted/i,
  /we received/i,
];

export const greenhouseApplyFlow: ApplyFlow = {
  ats: "greenhouse",

  detectsUrl(url: string): boolean {
    try {
      const u = new URL(url);
      return /(^|\.)greenhouse\.io$/.test(u.hostname) && /\/jobs\/\d+/.test(u.pathname);
    } catch {
      return false;
    }
  },

  async identifyForm(tab) {
    return identifyFormGeneric(tab, GREENHOUSE_SELECTORS);
  },

  async fillForm(tab, schema, data) {
    return fillFormGeneric(tab, schema, data, "greenhouse");
  },

  async submit(tab, opts: SubmitOptions): Promise<SubmitResult> {
    if (opts.allowSubmit !== true) throw new SubmitNotPermittedError();
    return submitGeneric(tab, "greenhouse", SUBMIT_BUTTON_SELECTORS, SUCCESS_INDICATORS);
  },
};

import type { HumanizedTab } from "@auto-job/humanize";
import type { SupportedATS } from "../types.js";

/** Shared submit helper — used by all 4 adapters when allowSubmit:true. */
export async function submitGeneric(
  tab: HumanizedTab,
  _ats: SupportedATS,
  buttonSelectors: readonly string[],
  successPatterns: readonly RegExp[],
): Promise<SubmitResult> {
  // Find first matching submit button
  for (const sel of buttonSelectors) {
    const found = await tab
      .evaluate<boolean>(`!!document.querySelector(${JSON.stringify(sel)})`)
      .catch(() => false);
    if (found) {
      await tab.click(sel);
      // Wait briefly for navigation/response
      await new Promise((r) => setTimeout(r, 2000));
      const finalUrl = tab.url;
      const text = await tab.evaluate<string>("(document.body && document.body.innerText) || ''").catch(() => "");
      const appearsSuccessful = successPatterns.some((p) => p.test(text));
      return { submittedAt: new Date().toISOString(), finalUrl, appearsSuccessful };
    }
  }
  return {
    submittedAt: new Date().toISOString(),
    finalUrl: tab.url,
    appearsSuccessful: false,
  };
}

// Re-export so tests can construct schemas if needed
export { GREENHOUSE_SELECTORS };
export type { FormSchema };
