# Extension Signal Desk Design

## Background

The browser extension's in-page panel is the primary user-facing extension UI.
It currently follows a compact dark industrial style and has fresh uncommitted
work adding Built In scanner controls. The user asked to update the extension
design and explicitly allowed choosing a new direction rather than preserving
the existing industrial-utilitarian dark UI.

## Goal

Refresh the extension UI with a distinctive, compact "Signal Desk" design:
a focused task-control surface for scanning, triaging, and evaluating jobs
inside arbitrary web pages.

## Scope

In scope:
- Update the checked-in extension design system documentation.
- Restyle the injected in-page panel, especially the scanner and Built In
  keyword controls.
- Bring permission and unsupported extension pages into the same visual family.
- Simplify bridge mode presentation to state only the current bridge mode.
- Preserve the current scanner, bridge, permission, and evaluation behavior.

Out of scope:
- Changing scan, score, enrichment, pending, or evaluation logic.
- Adding new settings or configuration surfaces.
- Submitting applications or automating apply flows.
- Refactoring unrelated extension code.

## Assumptions

- The injected panel is more important than `popup.html` because the manifest
  toggles an in-page panel from the toolbar.
- A dark base is still appropriate for an overlay on arbitrary job pages, but
  the style does not need to be purely industrial.
- Existing user work in the dirty worktree should be preserved and edited
  around, not reverted.

## Implementation Steps

1. Update the design system document.
   Verify: the document states the new direction, tokens, and interaction rules.
2. Restyle the in-page panel with CSS variables and source-aware scanner layout.
   Verify: extension typecheck accepts the modified TypeScript string templates.
3. Align permission and unsupported pages with the new visual system.
   Verify: static pages still render their primary text and controls.
4. Run targeted extension verification.
   Verify: `npm --prefix extension run typecheck` and `npm --prefix extension run build`.
5. Smoke test rendered extension pages where feasible.
   Verify: popup, permission, and unsupported pages load without visual blanking.

## Verification Approach

- `npm --prefix extension run typecheck`
- `npm --prefix extension run build`
- Static browser smoke checks for built extension pages if local tooling is
  available in this session.

## Progress Log

- 2026-04-19: Created plan after the user requested an extension design refresh
  and clarified that the existing dark industrial direction is optional.
- 2026-04-19: Updated `extension/DESIGN.md` with the Signal Desk direction,
  color tokens, surface rules, type stacks, scanner surface pattern, and
  accessibility notes.
- 2026-04-19: Restyled the injected panel with explicit shadow-DOM font
  inheritance, CSS variables, Signal Desk color tokens, stronger source/status
  structure, source badge, keyword card, compact chips, tokenized metrics, and
  tokenized focus/hover states.
- 2026-04-19: Restyled popup tokens, permission page, and unsupported page so
  extension surfaces share the same visual system.
- 2026-04-19: Ran extension typecheck/build and Playwright static smoke tests
  for popup, permission, unsupported, and injected panel screenshots.
- 2026-04-19: Simplified the bridge mode panel in both popup and injected
  panel. Removed preferred mode selection, startup command copy, and match
  messaging so the surface only reports the currently active mode.

## Key Decisions

- Choose a "Signal Desk" direction: charcoal/ink base, zinc panels, crisp white
  type, electric cyan action, green success, amber caution, and coral errors.
- Keep a dark overlay base for readability on arbitrary host pages, but make the
  layout feel like a compact control desk rather than stacked generic cards.
- Treat scanner controls as a workflow surface with source badges, search row,
  chips, and status strips.
- Bridge mode is status, not configuration, in the extension UI. The local
  bridge startup command belongs in setup/debug docs rather than this compact
  control surface.

## Risks And Blockers

- The worktree already has unrelated uncommitted changes, including extension
  scanner changes. This task must not revert or reformat those changes.
- The injected panel is generated from string templates, so visual smoke testing
  may be limited without loading the extension into Chrome.

## Final Outcome

Implemented.

Verification:
- `npm --prefix extension run typecheck`: passed.
- `npm --prefix extension run build`: passed.
- `node /tmp/career-ops-extension-smoke.mjs`: passed after running with
  localhost permission; generated screenshots:
  - `/tmp/career-ops-extension-popup-signal.png`
  - `/tmp/career-ops-extension-permission-signal.png`
  - `/tmp/career-ops-extension-unsupported-signal.png`
  - `/tmp/career-ops-extension-panel-signal.png`
- `git diff --check`: passed.
- Follow-up bridge simplification was rechecked with the same typecheck, build,
  smoke, and diff whitespace checks.

Remaining notes:
- The worktree still contains pre-existing uncommitted Built In scanner and
  bridge changes outside this design task.
- The panel smoke test forces the scanner visual state after injecting
  `panel.js`; it verifies rendering and styling, not a live Chrome extension
  install against a real Built In tab.
