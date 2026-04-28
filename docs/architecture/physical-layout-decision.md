# Physical Layout Decision

## Purpose

This document records the Phase 7 decision for architecture independence.

## Decision

Do not move directories in this phase.

Current layout:

- `apps/server/` is the local bridge/runtime server.
- `apps/extension/` is the Chrome MV3 extension.
- `apps/desktop/` is the Electron desktop wrapper.
- `packages/shared/` is the cross-app contract package.
- root `scripts/` remain command entry points for scanner and automation flows.

This layout is already workspace-based enough for the current product. Moving
`apps/server` to `apps/bridge`, moving extension files again, or splitting more
packages now would mostly create import churn.

## Future Move Gate

Revisit physical moves only when at least one of these is true:

- A shared scanner/evaluation/tracker module has repeated code that cannot be
  kept simple in the current layout.
- Build/package boundaries require a new package to distribute a runtime.
- The bridge name mismatch creates repeated operator confusion in docs or tests.

Any future move must include:

- typecheck and test coverage before and after the move
- no behavior changes in the same patch
- updates to package workspaces, scripts, docs, and import paths
- verification that extension/bridge contracts still pass

## Verification

Run:

```bash
bun run --cwd apps/server vitest run src/adapters/command-surface-contract.test.ts
```

The test locks the current workspace layout as an explicit deferred decision.
