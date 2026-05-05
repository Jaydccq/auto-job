/**
 * Generic form-identification engine. Each adapter passes its selector table;
 * we probe each in order via tab.evaluate, returning a FormSchema.
 */

import type { Tab } from "@auto-job/browser";

import type { SelectorTable } from "./selectors.js";
import type { FormSchema, FormSchemaField, StandardFieldKey } from "./types.js";

interface ProbeResult {
  exists: boolean;
  tag: string;
  fieldType: string;
  required: boolean;
  label: string;
}

/**
 * In-page probe: returns metadata about the first matching element, or
 * { exists: false } if none.
 */
const PROBE_SOURCE = `(function(selectors) {
  for (const sel of selectors) {
    let el = null;
    try { el = document.querySelector(sel); } catch (_) { continue; }
    if (!el) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) continue; // skip hidden
    let label = "";
    if (el.id) {
      const lab = document.querySelector('label[for="' + el.id + '"]');
      if (lab) label = (lab.textContent || "").trim().slice(0, 200);
    }
    if (!label) {
      const aria = el.getAttribute("aria-label");
      if (aria) label = aria.trim().slice(0, 200);
    }
    if (!label) {
      const placeholder = el.getAttribute("placeholder");
      if (placeholder) label = placeholder.trim().slice(0, 200);
    }
    return {
      exists: true,
      tag: el.tagName.toLowerCase(),
      fieldType: el.getAttribute("type") || "",
      required: el.hasAttribute("required") || el.getAttribute("aria-required") === "true",
      label: label || "",
      matchedSelector: sel,
    };
  }
  return { exists: false };
})`;

const UNKNOWN_SOURCE = `(function() {
  const standard = new Set();
  // We don't know which selectors the adapter probed, so we just enumerate
  // all visible inputs/textareas/selects and let the caller subtract.
  const out = [];
  for (const el of document.querySelectorAll("input, textarea, select")) {
    const type = el.getAttribute("type") || "";
    if (type === "hidden" || type === "submit" || type === "button") continue;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) continue;
    let label = "";
    if (el.id) {
      const lab = document.querySelector('label[for="' + el.id + '"]');
      if (lab) label = (lab.textContent || "").trim().slice(0, 200);
    }
    if (!label) {
      const aria = el.getAttribute("aria-label");
      if (aria) label = aria.trim().slice(0, 200);
    }
    if (!label) label = el.getAttribute("placeholder") || "";
    out.push({
      tag: el.tagName.toLowerCase(),
      fieldType: type,
      required: el.hasAttribute("required") || el.getAttribute("aria-required") === "true",
      label: label.trim().slice(0, 200),
      selector: el.id ? "#" + el.id : el.getAttribute("name") ? '[name="' + el.getAttribute("name") + '"]' : el.tagName.toLowerCase(),
    });
  }
  return out;
})()`;

export async function identifyFormGeneric(
  tab: Tab,
  selectors: SelectorTable,
): Promise<FormSchema> {
  const standardFields: FormSchema["standardFields"] = {};
  const matchedSelectors = new Set<string>();
  for (const [key, alternates] of Object.entries(selectors) as [StandardFieldKey, readonly string[]][]) {
    if (!alternates) continue;
    const result = (await tab.evaluate(
      `${PROBE_SOURCE}(${JSON.stringify(alternates)})`,
    )) as ProbeResult & { matchedSelector?: string };
    if (result.exists) {
      const matched = result.matchedSelector ?? alternates[0]!;
      matchedSelectors.add(matched);
      standardFields[key] = {
        selector: matched,
        tag: result.tag,
        label: result.label,
        ...(result.fieldType ? { fieldType: result.fieldType } : {}),
        required: result.required,
      };
    }
  }
  const allVisible = (await tab.evaluate(UNKNOWN_SOURCE)) as Array<{
    tag: string;
    fieldType: string;
    required: boolean;
    label: string;
    selector: string;
  }>;
  // unknownFields = visible inputs whose selector we did NOT match.
  const unknownFields: FormSchemaField[] = allVisible
    .filter((f) => !matchedSelectors.has(f.selector))
    .map((f) => ({
      selector: f.selector,
      tag: f.tag,
      label: f.label,
      required: f.required,
      ...(f.fieldType ? { fieldType: f.fieldType } : {}),
    }));
  return {
    standardFields,
    unknownFields,
    pageUrl: tab.url,
  };
}
