# career-ops Extension — Design System

## Aesthetic Direction

Friendly job assistant UI. The extension should feel close to lightweight
job-search tools like Simplify: approachable, fast to scan, and centered on the
next action. It uses a warm light shell, white task surfaces, green primary
actions, clear status chips, and compact tracker rows.

The reference is product quality, not branding. Do not copy Simplify assets,
logos, names, or proprietary layouts. Borrow the useful qualities: low friction,
obvious primary actions, soft feedback, and a calm workflow.

## Color Tokens

| Token             | Value     | Usage                              |
|-------------------|-----------|------------------------------------|
| `--bg`            | `#f4f8f3` | Popup/page background              |
| `--surface`       | `#ffffff` | Main task surfaces                 |
| `--surface-raised`| `#eef7ef` | Hover and raised controls          |
| `--surface-soft`  | `#f7fbf6` | Status strips and nested controls  |
| `--field`         | `#fbfdf9` | Inputs and code blocks             |
| `--text`          | `#162015` | Primary text                       |
| `--muted`         | `#5f6f5d` | Secondary text and metadata        |
| `--dim`           | `#81907e` | Labels and tertiary text           |
| `--border`        | `#dce7d9` | Section and row dividers           |
| `--border-strong` | `#c2d2bf` | Outer panel and strong controls    |
| `--accent`        | `#16a765` | Primary CTA, active scanner state  |
| `--accent-strong` | `#0f8f56` | Hover/pressed primary action       |
| `--accent-soft`   | `#e3f6ea` | Active chips and subtle highlights |
| `--lime`          | `#79b83f` | Brand kicker and high-signal tags  |
| `--ok`            | `#16a765` | Success, healthy, completed        |
| `--warn`          | `#b7791f` | Warnings, caution                  |
| `--err`           | `#d8463f` | Errors, failures                   |

## Surface Tiers

| Tier       | Background          | Border                         | Usage                         |
|------------|---------------------|--------------------------------|-------------------------------|
| Shell      | `--bg`              | `1px solid var(--border-strong)` | Popup/panel container       |
| Section    | `--surface`         | `1px solid var(--border)`      | Capture, mode, scanner blocks |
| Nested     | `--surface-soft`    | `1px solid var(--border)`      | Status strips, keyword cards  |
| Field      | `--field`           | `1px solid var(--border)`      | Inputs, code, commands        |

## Spacing Scale (4px base)

`--sp-1` (4px), `--sp-2` (8px), `--sp-3` (12px), `--sp-4` (16px), `--sp-5` (20px), `--sp-6` (24px)

## Type Scale

| Token          | Size  | Usage                                |
|----------------|-------|--------------------------------------|
| `--fs-caption` | 10px  | Footer, section labels, source meta |
| `--fs-small`   | 11px  | Metadata, URLs, hints, mono content |
| `--fs-body`    | 13px  | Primary body text, buttons          |
| `--fs-title`   | 14px  | Panel title                         |
| `--fs-score`   | 30px  | Score hero in evaluation result     |

## Font Stacks

- **Sans:** `"Aptos", "Fira Sans", "IBM Plex Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`
- **Mono:** `"Fira Code", "SFMono-Regular", ui-monospace, Menlo, monospace`

## Border Radii

- `--r-sm` (4px): Buttons, inputs, inline code, row hover
- `--r-md` (8px): Panel shell and functional sections
- `999px`: Health and source badges only

## Interaction Patterns

### Bridge Chip
Status indicator in header. Shows health dot + label in a soft green chip when
healthy and red when offline. Click toggles a compact bridge summary that only
states the current mode. Uses `aria-expanded` / `aria-controls`.

### Stepper (Progress)
Vertical list with `::before` icons: `○` pending, `●` active (pulsing),
`✓` completed, `✕` failed. Phase counter below: "Phase X of Y".

### Inline Expiry Warning
Replaces native `confirm()`. Amber-tinted panel inside the capture section
with warning text + "Evaluate anyway" / "Cancel" buttons.

### Contextual Errors
Error classification by keyword matching: connection, timeout, auth, rate limit.
Each category shows a human-readable explanation and structured recovery hint
with optional inline `<code>` snippet. DOM-constructed, never innerHTML.

### Recent Evaluations
Scrollable with `max-height: 240px`. Fade mask at bottom when overflowing
(via `::after` sticky gradient). Each row: `role="button"`, `tabindex="0"`,
Enter/Space keyboard handler.

### Scanner Surface
Scanner pages use one workflow section rather than several unrelated cards:
source title, status strip, optional source search row, primary scan CTA,
results, pending candidates, and evaluation progress. Built In keyword search
uses a nested source card with a source badge, all-location meta label, keyword
input, shortcut chips, and concise helper text.

### Simplify-Inspired Qualities

- Make the next action obvious with one green primary button.
- Keep secondary actions quiet and readable.
- Use friendly empty states instead of blank utility text.
- Use status chips and rows instead of heavy boxed dashboards.
- Avoid purple gradients, generic feature grids, and decorative icons.

### Application Autofill

The injected panel may show an "Application autofill" section on ordinary job
application pages. It reads safe profile fields from the authenticated local
bridge, previews matched empty fields, and fills only after the user clicks
"Autofill current page".

Autofill is intentionally conservative:
- It never clicks submit, next, continue, apply, upload, or save controls.
- It may attach the configured resume PDF to a matched resume/CV file input
  after the user clicks "Autofill current page"; the actual application upload
  still requires the user to continue or submit.
- It never stores profile values in extension state.
- It fills common visible text, textarea, select, radio/checkbox/button option,
  and resume/CV file fields only.
- It reports filled/skipped counts and expects the user to review before
  submitting.

## Accessibility

- `aria-live="polite"` on health status and phase list
- `aria-live="assertive"` on evaluation result score
- `.sr-only` class for screen-reader-only text
- `:focus-visible` outlines on all interactive elements
- Button padding targets compact desktop use while preserving visible focus and
  cursor affordance
- `role="alert"` on offline banner and error section

## Score Color Thresholds

Defined in `src/shared/utils.ts` — `scoreColor()`:
- >= 4.0: `#4ecb71` (green)
- >= 2.5: `#e5b93c` (amber)
- < 2.5:  `#ef5f5f` (red)
