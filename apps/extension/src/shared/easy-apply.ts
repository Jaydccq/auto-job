/**
 * easy-apply.ts — pure DOM helpers for the LinkedIn Easy Apply modal.
 *
 * Lives in `shared/` so it can be unit-tested with happy-dom fixtures
 * without pulling in inject.ts (a UI module). inject.ts re-exports these
 * for use in the panel.
 *
 * Safety boundary: these helpers only INSPECT the DOM. They never click,
 * submit, or mutate values. The auto-advance loop in inject.ts is the only
 * thing that calls .click(), and only via assertSafeClick().
 */

const PROGRESS_LABEL = /^\s*(continue|next|review)/i;
const SUBMIT_LABEL = /(submit application|^\s*submit\s*$)/i;
const UNSAFE_LABEL = /\b(submit|withdraw|save|discard|delete)\b/i;
const STRICT_UNSAFE_CLICK = /\b(submit|withdraw)\b/i;

function normalizeLabel(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

/**
 * Best-effort accessible label for a button.
 *
 * For SAFETY decisions (assertSafeClick, findEasyApplySubmitButton) we read
 * ALL plausible label sources and concatenate them — a button whose visible
 * text says "Review" but whose `title` attribute says "Submit application"
 * must trip the unsafe guard.
 *
 * Sources (concatenated):
 *   • aria-label
 *   • aria-labelledby → resolve referenced element textContent
 *   • textContent
 *   • value
 *   • title
 *   • first nested element with [aria-label]
 *
 * Order does not matter for the unsafe-label regex; we just join everything.
 */
export function buttonAccessibleLabel(button: HTMLButtonElement): string {
  const doc = button.ownerDocument ?? document;
  const aria = button.getAttribute("aria-label") ?? "";
  const labelledBy = (button.getAttribute("aria-labelledby") ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .map((id) => doc.getElementById(id)?.textContent ?? "")
    .join(" ");
  const text = button.textContent ?? "";
  const value = button.getAttribute("value") ?? "";
  const title = button.getAttribute("title") ?? "";
  const nestedAria = Array.from(button.querySelectorAll<HTMLElement>("[aria-label]"))
    .map((el) => el.getAttribute("aria-label") ?? "")
    .join(" ");
  return normalizeLabel(
    [aria, labelledBy, text, value, title, nestedAria].filter(Boolean).join(" "),
  );
}

/**
 * Locate the outermost LinkedIn Easy Apply modal in the document, if any.
 * Tries selectors in priority order and returns the first hit.
 */
export function findEasyApplyModal(doc: Document): HTMLElement | null {
  const direct = doc.querySelector<HTMLElement>(".jobs-easy-apply-modal");
  if (direct) return direct;

  const labelled = Array.from(
    doc.querySelectorAll<HTMLElement>('div[role="dialog"][aria-labelledby]'),
  ).find((dialog) => {
    const id = dialog.getAttribute("aria-labelledby") ?? "";
    return /easy/i.test(id);
  });
  if (labelled) return labelled;

  // `:has()` is unsupported on older Chromium — wrap in try/catch.
  try {
    const hasForm = doc.querySelector<HTMLElement>(
      'div[role="dialog"]:has(form[aria-label*="apply" i])',
    );
    if (hasForm) return hasForm;
  } catch {
    // selector not supported — fall through
  }

  // Fallback: any role=dialog whose visible text mentions Easy Apply or that
  // contains a "Submit application" button.
  const dialogs = Array.from(doc.querySelectorAll<HTMLElement>('div[role="dialog"]'));
  for (const dialog of dialogs) {
    const text = (dialog.textContent ?? "").toLowerCase();
    if (text.includes("easy apply")) return dialog;
    const buttons = Array.from(dialog.querySelectorAll<HTMLButtonElement>("button"));
    if (buttons.some((button) => /submit application/i.test(buttonAccessibleLabel(button)))) {
      return dialog;
    }
  }
  return null;
}

/**
 * Find the "Continue / Next / Review" button inside the modal.
 * Rejects any button whose accessible label hits an unsafe pattern.
 * Returns null when there is no progress button (e.g. the final review step).
 */
export function findEasyApplyProgressButton(modal: HTMLElement): HTMLButtonElement | null {
  const buttons = Array.from(modal.querySelectorAll<HTMLButtonElement>("button"));
  for (const button of buttons) {
    if (button.disabled) continue;
    const label = buttonAccessibleLabel(button);
    if (!label) continue;
    if (UNSAFE_LABEL.test(label)) continue;
    if (PROGRESS_LABEL.test(label)) return button;
  }
  return null;
}

/**
 * Find the final "Submit application" button. Used as a STOP signal — never
 * a click target.
 */
export function findEasyApplySubmitButton(modal: HTMLElement): HTMLButtonElement | null {
  const buttons = Array.from(modal.querySelectorAll<HTMLButtonElement>("button"));
  for (const button of buttons) {
    const label = buttonAccessibleLabel(button);
    if (SUBMIT_LABEL.test(label)) return button;
  }
  return null;
}

/**
 * Hard guard: throws if the button's accessible label contains "submit" or
 * "withdraw". Apply this to EVERY programmatic click in the Easy Apply flow.
 */
export function assertSafeClick(button: HTMLButtonElement): void {
  const label = buttonAccessibleLabel(button);
  if (STRICT_UNSAFE_CLICK.test(label)) {
    throw new Error(`Refusing to click button with unsafe label: ${label}`);
  }
}
