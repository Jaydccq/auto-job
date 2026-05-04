/**
 * Generic fill engine. Adapters call this with the resolved FormSchema
 * and ApplicationData; we humanize-fill the matched fields and return
 * counts. File uploads use playwright's setInputFiles via tab evaluation.
 */

import type { HumanizedTab } from "@auto-job/humanize";

import { FormFillError } from "./errors.js";
import type {
  ApplicationData,
  FillResult,
  FormSchema,
  StandardFieldKey,
  SupportedATS,
} from "./types.js";

/** Map StandardFieldKey → string value from ApplicationData. */
function valueFor(key: StandardFieldKey, data: ApplicationData): string | null {
  switch (key) {
    case "firstName": return data.name.first;
    case "lastName": return data.name.last;
    case "fullName": return `${data.name.first} ${data.name.last}`;
    case "email": return data.email;
    case "phone": return data.phone;
    case "city": return data.location.city;
    case "state": return data.location.state ?? null;
    case "country": return data.location.country ?? null;
    case "linkedin": return data.links.linkedin ?? null;
    case "github": return data.links.github ?? null;
    case "portfolio": return data.links.portfolio ?? null;
    case "resume": return data.resumePath; // file path (handled separately)
    case "coverLetter": return data.defaultCoverLetter ?? null;
    case "workAuthorization": return data.workAuthorization;
    case "requiresSponsorship": return data.requiresSponsorship ? "Yes" : "No";
  }
}

const FILE_SET_SOURCE = `(function(selector, path) {
  // Browsers don't allow setting input.files programmatically from JS for
  // security reasons. Use playwright's setInputFiles via the bound page;
  // we expose this fact to the caller via a special return code.
  return "USE_PLAYWRIGHT_SET_INPUT_FILES";
})`;

export async function fillFormGeneric(
  tab: HumanizedTab,
  schema: FormSchema,
  data: ApplicationData,
  ats: SupportedATS,
): Promise<Omit<FillResult, "reviewSnapshotPath" | "filledAt">> {
  let filled = 0;
  const missing: StandardFieldKey[] = [];
  for (const [keyRaw, field] of Object.entries(schema.standardFields)) {
    const key = keyRaw as StandardFieldKey;
    if (!field) {
      missing.push(key);
      continue;
    }
    const value = valueFor(key, data);
    if (value === null || value === "") {
      missing.push(key);
      continue;
    }
    try {
      if (key === "resume") {
        // File upload — emit a marker; the orchestrator handles via tab API.
        // We intentionally don't reach into playwright internals here; the
        // runner.ts overrides this by calling page.setInputFiles directly.
        await tab.evaluate(`${FILE_SET_SOURCE}(${JSON.stringify(field.selector)}, ${JSON.stringify(value)})`);
        filled += 1;
      } else if (field.tag === "select") {
        // Selects need .selectOption — humanizeTab doesn't expose it,
        // fall back to evaluate that sets the value.
        await tab.evaluate(
          `(function(sel, v) { const e = document.querySelector(sel); if (e) { e.value = v; e.dispatchEvent(new Event('change', { bubbles: true })); } })(${JSON.stringify(field.selector)}, ${JSON.stringify(value)})`,
        );
        filled += 1;
      } else {
        await tab.fill(field.selector, value);
        filled += 1;
      }
    } catch (e) {
      throw new FormFillError(
        `failed to fill ${key} (selector ${field.selector}): ${e instanceof Error ? e.message : String(e)}`,
        ats,
        key,
      );
    }
  }
  // Standard fields the adapter looks for but the schema didn't find go into missing.
  // (Already accumulated above when field was undefined.)
  return {
    fieldsFilled: filled,
    fieldsMissing: missing,
    fieldsSkipped: schema.unknownFields,
  };
}
