# Extension And Bridge Contract

## Purpose

The extension is a local UI/client. The bridge is the local runtime. The
extension must not grow a parallel evaluation, tracker, or report parser.

## Wire Source

The single HTTP wire source is:

- `packages/shared/src/contracts/api.ts`

The extension-facing import is:

- `apps/extension/src/contracts/bridge-wire.ts`

`bridge-wire.ts` re-exports `@auto-job/shared`; it should not define a local
copy of endpoint paths, auth headers, or response shapes. The compatibility
test is `apps/extension/test/bridge-wire-contract.test.ts`. The background
bridge client must derive HTTP paths from the shared `ENDPOINTS` registry.

## Message Boundaries

| Boundary | Allowed | Not allowed |
|---|---|---|
| popup -> background | token setup, health, capture, evaluate, tracker/report reads, user-triggered scan actions | direct DOM mutation |
| background -> content | page capture request only | bridge calls, tracker writes, persistent profile reads |
| popup/background -> bridge | HTTP calls through shared endpoint contracts | ad hoc endpoint strings outside shared contracts |
| content/panel autofill | inspect DOM and fill matched fields after user click | automatic submit, next, continue, apply |

## Application Safety Rules

- The extension never submits an application for the user.
- The extension never clicks `submit`, `next`, `continue`, or `apply` action
  controls as part of autofill.
- Autofill only runs after the user clicks the extension's autofill control.
- File attachment is limited to the configured resume field and still requires
  the user-triggered autofill path.
- Easy Apply and external ATS actions remain read-only unless the user
  explicitly acts in the browser.

## Current Guards

- `apps/extension/src/shared/autofill-dom.ts` filters unsupported and unsafe
  controls before the matcher sees them.
- `apps/extension/src/shared/autofill-matcher.ts` computes a fill plan only; it
  does not click or mutate DOM values.
- `apps/extension/src/panel/inject.ts` owns the explicit user-triggered fill.

## Verification

Run these checks when extension or bridge contracts change:

- `bun run --cwd apps/extension typecheck`
- `bun run ext:build`
- `./node_modules/.bin/vitest run apps/extension/test`
- `bun run --cwd apps/server test`

The extension safety tests must keep rejecting submit/next/continue/apply
controls before any future autofill behavior is expanded.
