/**
 * autofill-dom.ts — testable DOM helpers for the autofill panel.
 *
 * inject.ts owns the live UI/event wiring. This module exposes the pure DOM
 * inspection logic so it can be unit-tested with happy-dom fixtures and
 * reused across surfaces. Every function takes its inputs as arguments and
 * returns plain strings/booleans/numbers — no global panel state.
 */

import {
  autofillChoiceRole,
  isAutofillButtonTypeAllowed,
  isInteractiveButtonInputType,
  isUnsafeAutofillActionText,
} from "./autofill-option-scoring.js";

export type AutofillControl =
  | HTMLInputElement
  | HTMLTextAreaElement
  | HTMLSelectElement
  | HTMLButtonElement
  | HTMLElement;

export type AutofillInputKind =
  | "text"
  | "textarea"
  | "select"
  | "radio"
  | "checkbox"
  | "button"
  | "file";

export interface AutofillVisibilityOptions {
  /** When true, also requires non-zero bounding rect. Default true. */
  requireLayout?: boolean;
}

export function normalizeAutofillLabel(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function ownerWindow(element: Element): Window | null {
  return element.ownerDocument?.defaultView ?? null;
}

function ancestorAriaHidden(element: Element): boolean {
  for (let cur: Element | null = element; cur; cur = cur.parentElement) {
    if (cur instanceof HTMLElement && cur.getAttribute("aria-hidden") === "true") return true;
  }
  return false;
}

function elementHasNonZeroLayout(element: Element): boolean {
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function ancestorHasInlineHidden(element: Element): boolean {
  for (let cur: Element | null = element; cur; cur = cur.parentElement) {
    if (!(cur instanceof HTMLElement)) continue;
    if (cur.hidden) return true;
    const display = cur.style.display;
    const visibility = cur.style.visibility;
    if (display === "none") return true;
    if (visibility === "hidden") return true;
  }
  return false;
}

function actionText(control: HTMLElement): string {
  const value = control instanceof HTMLInputElement ? control.value : "";
  return [
    value,
    control.textContent ?? "",
    control.getAttribute("aria-label") ?? "",
    control.getAttribute("title") ?? "",
  ].join(" ");
}

export function isAutofillElementVisible(element: Element, options?: AutofillVisibilityOptions): boolean {
  if (element instanceof HTMLElement && element.hidden) return false;
  if (ancestorAriaHidden(element)) return false;
  if (ancestorHasInlineHidden(element)) return false;
  const win = ownerWindow(element);
  if (win && element instanceof HTMLElement) {
    try {
      const style = win.getComputedStyle(element);
      if (style.display === "none" || style.visibility === "hidden") return false;
    } catch {
      // Some test runtimes throw on detached elements; fall through.
    }
  }
  if (options?.requireLayout ?? true) {
    if (!elementHasNonZeroLayout(element)) return false;
  }
  return true;
}

export function isAutofillCandidate(
  control: Element,
  options?: AutofillVisibilityOptions,
): control is AutofillControl {
  if (!(control instanceof HTMLElement)) return false;

  const isFormControl =
    control instanceof HTMLInputElement
    || control instanceof HTMLTextAreaElement
    || control instanceof HTMLSelectElement
    || control instanceof HTMLButtonElement;

  if (control instanceof HTMLButtonElement) {
    if (control.disabled) return false;
    if (!isAutofillButtonTypeAllowed(control.type)) return false;
    if (isUnsafeAutofillActionText(actionText(control))) return false;
  }

  if (!isFormControl) {
    if (!autofillChoiceRole(control.getAttribute("role"))) return false;
    if (control.getAttribute("role")?.toLowerCase() === "button" && isUnsafeAutofillActionText(actionText(control))) {
      return false;
    }
  }

  if (control.getAttribute("aria-disabled") === "true") return false;

  if (
    (control instanceof HTMLInputElement
      || control instanceof HTMLTextAreaElement
      || control instanceof HTMLSelectElement
      || control instanceof HTMLButtonElement)
    && control.disabled
  ) return false;

  if ((control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement) && control.readOnly) {
    return false;
  }

  if (control instanceof HTMLInputElement) {
    const type = control.type.toLowerCase();
    if (["hidden", "file", "password", "submit", "reset", "image"].includes(type)) return false;
    if (isInteractiveButtonInputType(type) && isUnsafeAutofillActionText(actionText(control))) return false;
  }

  return isAutofillElementVisible(control, options);
}

export function autofillInputKind(control: AutofillControl): AutofillInputKind {
  if (control instanceof HTMLSelectElement) return "select";
  if (control instanceof HTMLTextAreaElement) return "textarea";
  if (control instanceof HTMLInputElement) {
    const type = control.type.toLowerCase();
    if (type === "file") return "file";
    if (type === "radio") return "radio";
    if (type === "checkbox") return "checkbox";
    if (isInteractiveButtonInputType(type)) return "button";
    return "text";
  }
  if (control instanceof HTMLButtonElement) return "button";
  const choiceRole = autofillChoiceRole(control.getAttribute("role"));
  if (choiceRole) return choiceRole;
  return "text";
}

export function radioGroupAlreadyChecked(control: HTMLInputElement, doc: Document): boolean {
  if (!control.name) return control.checked;
  return Array.from(doc.querySelectorAll<HTMLInputElement>(`input[type="radio"][name="${CSS.escape(control.name)}"]`))
    .some((radio) => radio.checked);
}

export function autofillControlAlreadySet(control: AutofillControl, doc: Document): boolean {
  if (control instanceof HTMLInputElement) {
    const type = control.type.toLowerCase();
    if (type === "radio") return radioGroupAlreadyChecked(control, doc);
    if (type === "checkbox") return control.checked;
    if (isInteractiveButtonInputType(type)) {
      return control.getAttribute("aria-checked") === "true" || control.getAttribute("aria-pressed") === "true";
    }
    if (type === "file") return (control.files?.length ?? 0) > 0;
    return control.value.trim().length > 0;
  }
  if (control instanceof HTMLTextAreaElement) return control.value.trim().length > 0;
  if (control instanceof HTMLSelectElement) {
    return control.value.trim().length > 0 && control.selectedIndex > 0;
  }
  if (control instanceof HTMLButtonElement) {
    return control.getAttribute("aria-checked") === "true" || control.getAttribute("aria-pressed") === "true";
  }
  return control.getAttribute("aria-checked") === "true" || control.getAttribute("aria-pressed") === "true";
}

function isChoiceLikeControl(control: AutofillControl): boolean {
  if (control instanceof HTMLButtonElement) return true;
  if (control instanceof HTMLInputElement) {
    const type = control.type.toLowerCase();
    return type === "radio" || type === "checkbox" || isInteractiveButtonInputType(type);
  }
  return autofillChoiceRole(control.getAttribute("role")) !== null;
}

export function compactFieldText(element: Element | null): string {
  const text = (element?.textContent ?? "").replace(/\s+/g, " ").trim();
  if (!text || text.length > 180) return "";
  return text;
}

export function textFromIds(idList: string | null, doc: Document): string {
  if (!idList) return "";
  return idList
    .split(/\s+/)
    .map((id) => doc.getElementById(id)?.textContent ?? "")
    .join(" ");
}

const FIELD_CONTAINER_SELECTOR = [
  "[data-field-path]",
  ".ashby-application-form-field-entry",
  ".application-question",
  ".field-row",
  "[data-question]",
  "[data-field]",
  "[role='group']",
].join(", ");

const FIELD_TITLE_SELECTOR = [
  "label",
  "legend",
  ".ashby-application-form-question-title",
  ".application-question-title",
  ".question-title",
  ".field-label",
  ".question",
  "[role='heading']",
].join(", ");

function nextSiblingText(element: Element): string {
  const next = element.nextElementSibling;
  return compactFieldText(next);
}

function controlSiblingTextNode(control: AutofillControl): string {
  let node: Node | null = control.nextSibling;
  while (node) {
    if (node.nodeType === 3) {
      const text = (node.textContent ?? "").replace(/\s+/g, " ").trim();
      if (text) return text;
    } else if (node.nodeType === 1) {
      break;
    }
    node = node.nextSibling;
  }
  return "";
}

export function directControlLabel(control: AutofillControl, doc: Document): string {
  const parts: string[] = [];

  if (control.id) {
    for (const label of Array.from(doc.querySelectorAll("label"))) {
      if (label.htmlFor === control.id) parts.push(label.textContent ?? "");
    }
  }

  parts.push(nearbyFieldLabelText(control));

  const fieldContainer = control.closest(FIELD_CONTAINER_SELECTOR);
  if (fieldContainer) {
    const fieldTitle = fieldContainer.querySelector(FIELD_TITLE_SELECTOR);
    if (fieldTitle) parts.push(fieldTitle.textContent ?? "");
  }

  const wrappingLabel = control.closest("label");
  if (wrappingLabel) parts.push(wrappingLabel.textContent ?? "");

  if (isChoiceLikeControl(control)) {
    parts.push(control.textContent ?? "");
    parts.push(controlSiblingTextNode(control));
    parts.push(nextSiblingText(control));
  }

  parts.push(
    control.getAttribute("aria-label") ?? "",
    control.getAttribute("placeholder") ?? "",
    control.getAttribute("name") ?? "",
    control.id,
    control.getAttribute("autocomplete") ?? "",
    control.getAttribute("title") ?? "",
  );

  return parts.join(" ");
}

export function nearbyFieldLabelText(control: AutofillControl): string {
  const parts: string[] = [];
  const doc = control.ownerDocument;
  if (doc) parts.push(textFromIds(control.getAttribute("aria-labelledby"), doc));
  const fieldset = control.closest("fieldset");
  if (fieldset) parts.push(compactFieldText(fieldset.querySelector("legend")));
  for (let element: Element | null = control; element && parts.length < 6; element = element.parentElement) {
    let sibling = element.previousElementSibling;
    for (let checked = 0; sibling && checked < 2; checked += 1, sibling = sibling.previousElementSibling) {
      const text = compactFieldText(sibling);
      if (text) parts.unshift(text);
    }
    const container = element.parentElement;
    if (!container) continue;
    const labelish = Array.from(container.children)
      .slice(0, 6)
      .find((child) => child !== element
        && /label|question|title|heading|prompt|name|phone|profile|website/i.test(child.getAttribute("class") ?? ""));
    const text = compactFieldText(labelish ?? null);
    if (text) parts.push(text);
  }
  return parts.join(" ");
}

export function hasQuestionLikeText(text: string): boolean {
  const normalized = normalizeAutofillLabel(text);
  return text.includes("?")
    || /\b(are|will|do|did|have|what|how|where|when|can|able|authorized|sponsor|visa|veteran|disability|gender|ethnicity|race|relocate|onsite|on site|start date|hear about)\b/.test(normalized);
}

export function nearbyQuestionText(element: Element): string {
  const parts: string[] = [];
  let sibling = element.previousElementSibling;
  for (let checked = 0; sibling && checked < 3; checked += 1, sibling = sibling.previousElementSibling) {
    const text = (sibling.textContent ?? "").replace(/\s+/g, " ").trim();
    if (text && text.length <= 360 && hasQuestionLikeText(text)) parts.unshift(text);
  }
  return parts.join(" ");
}

export function choiceQuestionLabel(control: AutofillControl, doc: Document): string {
  const parts: string[] = [];
  parts.push(textFromIds(control.getAttribute("aria-labelledby"), doc));
  parts.push(textFromIds(control.getAttribute("aria-describedby"), doc));
  const fieldset = control.closest("fieldset");
  const legend = fieldset?.querySelector("legend");
  if (legend) parts.push(legend.textContent ?? "");
  const fieldContainer = control.closest(FIELD_CONTAINER_SELECTOR);
  if (fieldContainer) {
    const fieldTitle = fieldContainer.querySelector(FIELD_TITLE_SELECTOR);
    if (fieldTitle) parts.push(fieldTitle.textContent ?? "");
  }
  let element: Element | null = control.parentElement;
  for (let depth = 0; element && depth < 6; depth += 1, element = element.parentElement) {
    parts.push(nearbyQuestionText(element));
    const leadingChild = Array.from(element.children)
      .slice(0, 5)
      .map((child) => child.textContent ?? "")
      .find((text) => text.length <= 360 && hasQuestionLikeText(text));
    if (leadingChild) parts.push(leadingChild);
  }
  return parts.join(" ");
}

export function contextControlLabel(control: AutofillControl, doc: Document): string {
  const parts: string[] = [];
  const kind = autofillInputKind(control);
  if (kind === "radio" || kind === "checkbox" || kind === "button") {
    parts.push(choiceQuestionLabel(control, doc));
  }
  const localContainer = control.closest("fieldset, li, p, div, section");
  if (localContainer) parts.push((localContainer.textContent ?? "").slice(0, 240));
  return parts.join(" ");
}

export function controlLabel(control: AutofillControl, doc: Document): string {
  return `${directControlLabel(control, doc)} ${contextControlLabel(control, doc)}`;
}

export function optionTextCandidatesForControl(control: AutofillControl, doc: Document): string[] {
  const rawParts: string[] = [];
  const value = control.getAttribute("value") ?? "";
  if (control instanceof HTMLInputElement && value.trim().length > 0) {
    rawParts.push(value);
  }
  if (control.id) {
    for (const label of Array.from(doc.querySelectorAll("label"))) {
      if (label.htmlFor === control.id) rawParts.push(label.textContent ?? "");
    }
  }
  const wrappingLabel = control.closest("label");
  if (wrappingLabel) rawParts.push(wrappingLabel.textContent ?? "");
  if (isChoiceLikeControl(control)) {
    rawParts.push(control.textContent ?? "");
    rawParts.push(controlSiblingTextNode(control));
    rawParts.push(nextSiblingText(control));
  }
  rawParts.push(
    control.getAttribute("aria-label") ?? "",
    control.getAttribute("title") ?? "",
  );
  return rawParts
    .map((part) => part.replace(/\s+/g, " ").trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim())
    .filter((part, index, parts) => part.length > 0 && parts.indexOf(part) === index);
}
