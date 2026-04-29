# Desktop Packaged Server Resolution

## Background

Double-clicking the installed macOS desktop app shows an Electron main-process
crash: `ERR_MODULE_NOT_FOUND: Cannot find package '@auto-job/server' imported
from .../app.asar/dist/main.js`. The desktop main bundle currently leaves
workspace packages external, but the packaged app does not contain a runtime
`node_modules/@auto-job/server` package for Node to resolve.

## Goal

Make the packaged `Auto Job.app` launch without requiring runtime resolution of
workspace packages from `app.asar`.

## Scope

- Fix the desktop main build so `@auto-job/server` is bundled into
  `apps/desktop/dist/main.js`.
- Preserve Electron as an external runtime import.
- Preserve the in-process server architecture and existing app behavior.
- Verify the rebuilt desktop artifact no longer contains a bare
  `@auto-job/server` import.

## Assumptions

- The screenshot is from the stale installed `/Applications/Auto Job.app`, not
  a source checkout run.
- The correct fix is to make the desktop package self-contained for runtime
  server code, not to require manual `node_modules` installation inside the app.
- The user's repo checkout remains at the conventional
  `~/Desktop/auto-job` path unless `AUTO_JOB_REPO_ROOT` is set.

## Implementation Steps

1. Inspect desktop package scripts, Electron builder config, and server package
   exports.
   Verify: identify the bare runtime import in `apps/desktop/dist/main.js`.
2. Change the desktop main build to bundle workspace/server code while keeping
   Electron external.
   Verify: rebuilt `dist/main.js` has no `import ... "@auto-job/server"`.
3. Ensure bundled-server bootstrap still has a repo-root override in dev and
   packaged runs.
   Verify: desktop typecheck/build pass.
4. Rebuild the macOS app package.
   Verify: packaged `app.asar/dist/main.js` has no bare `@auto-job/server`
   import.

## Verification Approach

- `pnpm --dir apps/desktop typecheck`
- `pnpm --dir apps/desktop build`
- Static grep against `apps/desktop/dist/main.js`
- `pnpm --dir apps/desktop package:dir`
- Static grep against unpacked `apps/desktop/release/mac-arm64/Auto Job.app`
  asar contents when available.

## Progress Log

- 2026-04-28: Created plan after reproducing the build artifact issue:
  `apps/desktop/dist/main.js` contains `import { createServer } from
  "@auto-job/server";`.
- 2026-04-28: Changed `apps/desktop` main build to bundle workspace/server
  code while leaving Electron external. Rebuilt `dist/main.js`; `node --check`
  passed and grep found no bare `@auto-job/server` or `@auto-job/shared`
  imports.
- 2026-04-28: Rebuilt `apps/desktop/release/mac-arm64/Auto Job.app` and
  verified the release-dir app starts and listens on `127.0.0.1:47319`.
- 2026-04-28: Installed the rebuilt app to `/Applications/Auto Job.app`.
  First install exposed a second packaged-only failure: bundled
  `/Applications/.../Resources/web/dashboard-handlers.mjs` could not resolve
  `js-yaml`. Changed the desktop app to use checkout `web/` when available and
  only set bundled `AUTO_JOB_WEB_DIR` as a fallback.
- 2026-04-28: Rebuilt and reinstalled the final app. Verified
  `/Applications/Auto Job.app` logs `server listening on
  http://127.0.0.1:47319` and `GET /dashboard/` returns HTML.
- 2026-04-28: Ran `pnpm --dir apps/desktop typecheck`; passed.

## Key Decisions

- Keep the server embedded in the Electron main process; this only changes the
  bundle boundary.
- Prefer the user's checkout `web/` implementation when present because its
  dependencies resolve from the repo. Keep bundled `web/` only as a fallback for
  older checkouts that lack the split dashboard modules.

## Risks and Blockers

- Electron-builder may require access to the local Electron cache when
  rebuilding package output.
- The macOS app remains unsigned/personal-use only, matching the existing
  electron-builder config.

## Final Outcome

Completed. The installed `/Applications/Auto Job.app` has been replaced with a
rebuilt app that no longer depends on runtime resolution of
`@auto-job/server` from `app.asar`, starts the embedded server, and serves the
dashboard from `127.0.0.1:47319`.
