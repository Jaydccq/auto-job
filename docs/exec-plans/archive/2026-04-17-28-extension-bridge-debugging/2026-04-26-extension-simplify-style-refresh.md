# Extension Simplify-Style Refresh

## Background

The extension currently uses the checked-in "Signal Desk" dark control-surface
design from `extension/DESIGN.md`. The user asked to optimize the frontend
extension style, make it more user-friendly, and mimic Simplify's style.

Simplify is treated as a directional reference, not a brand to copy: light,
approachable, low-friction job-search tooling with clear primary actions,
soft status surfaces, and compact progress/tracker affordances.

## Goal

Refresh the extension frontend so the popup, injected panel, permission page,
and unsupported page feel lighter, clearer, and friendlier while preserving the
existing career-ops behavior.

## Scope

In scope:
- Update the extension design system documentation.
- Restyle extension CSS and injected-panel styles toward a light, friendly
  Simplify-inspired control surface.
- Improve scan/evaluation surfaces with clearer hierarchy, softer status rows,
  stronger primary CTAs, and more readable empty/recent states.
- Verify extension type safety and build output.

Out of scope:
- Changing capture, scan, liveness, evaluation, tracker, or bridge logic.
- Copying Simplify branding, logos, protected assets, or proprietary UI.
- Adding new settings or application submission automation.
- Refactoring unrelated extension code.

## Assumptions

- "Mimic Simplify" means borrowing product qualities: clean light UI, friendly
  green action language, compact job-search workflow affordances, and low
  cognitive load.
- The injected in-page panel is the most important extension surface, but the
  toolbar popup and static permission/unsupported pages should remain visually
  aligned.
- Existing 4px spacing, 8px section radius, DOM safety, and keyboard/focus
  behavior should remain.

## Success Criteria

- The extension no longer reads as a dark industrial control desk.
- The primary action is visually obvious without using purple gradients,
  decorative blobs, or generic SaaS card grids.
- Status, recent evaluations, scanner, and permission states remain readable
  in compact extension dimensions.
- `npm --prefix extension run typecheck` passes.
- `npm --prefix extension run build` passes.
- A visual smoke check renders the key extension surfaces without blanking.

## Implementation Steps

1. Update `extension/DESIGN.md` with the new Simplify-inspired direction.
   Verify: document records tokens, surface rules, and accessibility constraints.
2. Restyle popup and static extension pages.
   Verify: CSS keeps controls usable and coherent across setup, capture, result,
   error, recent, permission, and unsupported states.
3. Restyle the injected in-page panel.
   Verify: TypeScript string-template CSS remains valid and behavior hooks are
   untouched.
4. Run targeted verification.
   Verify: typecheck, build, and visual smoke checks.
5. Update this plan with decisions, verification results, and final outcome.

## Verification Approach

- `npm --prefix extension run typecheck`
- `npm --prefix extension run build`
- Static smoke rendering for popup, permission, unsupported, and injected panel
  where feasible in this session.

## Progress Log

- 2026-04-26: Created the plan after reading `CLAUDE.md`,
  `extension/DESIGN.md`, extension public pages, popup controller, injected
  panel, and prior extension design plan.
- 2026-04-26: Updated `extension/DESIGN.md` from the dark Signal Desk direction
  to a light, friendly job-assistant direction inspired by Simplify qualities
  without copying Simplify branding or assets.
- 2026-04-26: Restyled popup, permission, and unsupported CSS with warm light
  surfaces, green primary actions, softer status areas, clearer focus states,
  and reduced dark industrial visual weight.
- 2026-04-26: Restyled the injected panel's shadow-DOM CSS and changed the
  panel title from "Signal desk" to "Job assistant"; scanner, keyword, pending,
  recent, and result surfaces now use the same light token system.
- 2026-04-26: Ran typecheck, build, whitespace diff check, and static Playwright
  smoke screenshots for popup, permission, unsupported, and injected panel.

## Key Decisions

- Treat Simplify as a product-style reference, not a source to clone.
- Keep changes CSS/documentation-first unless a small markup change directly
  improves hierarchy or accessibility.
- Keep the existing Aptos/Fira/IBM Plex font stack because it is already
  documented in the extension design system and avoids adding a new dependency.
- Keep 8px section radii and 4px spacing scale so the extension remains compact
  and consistent with prior constraints.

## Risks And Blockers

- The injected panel lives in a TypeScript string template; visual mistakes may
  typecheck but still need smoke rendering.
- Light extension surfaces can clash with arbitrary host pages unless the panel
  keeps a strong border and shadow.
- Static smoke checks verify rendering and layout state, not a live installed
  Chrome extension against real job sites.

## Final Outcome

Implemented.

Verification:
- `npm --prefix extension run typecheck`: passed.
- `npm --prefix extension run build`: passed.
- `git diff --check`: passed.
- `node /tmp/career-ops-extension-simplify-smoke.mjs`: passed after running
  headless Chromium with approval; generated screenshots:
  - `/tmp/career-ops-extension-popup-simplify.png`
  - `/tmp/career-ops-extension-permission-simplify.png`
  - `/tmp/career-ops-extension-unsupported-simplify.png`
  - `/tmp/career-ops-extension-panel-simplify.png`

Remaining notes:
- No scan/evaluation behavior was changed.
- No Simplify assets, logos, names, or proprietary UI were copied.
