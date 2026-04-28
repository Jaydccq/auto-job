# Desktop Release Download Target

## Background

The desktop app is packaged from `apps/desktop` with electron-builder. The dashboard document action currently copies generated application PDFs to the user's Downloads folder and labels the action as a download. The existing packaged output under `apps/desktop/release/` is stale and should be replaced before publishing a GitHub release.

## Goal

Make the desktop app package current, route generated application document saves to the user's Desktop by default, document how to start/open the app, and publish a GitHub release artifact.

## Scope

- Update the dashboard document-save target from `~/Downloads` to `~/Desktop`.
- Update user-facing copy and docs that describe the save target.
- Remove stale local package output before rebuilding.
- Build and verify the desktop package.
- Create a GitHub release if network/auth permits.

## Assumptions

- "之前的打包" means the stale `apps/desktop/release/` electron-builder output, not compiled `dist/` trees used by development.
- "默认的下载" refers to the dashboard Apply Next document save action backed by `/dashboard/api/apply-docs/download`.
- If no version is specified, use the repository `VERSION` file (`1.3.0`) as the GitHub release version and align the desktop package artifact name to it.

## Implementation Steps

1. Inspect current package scripts, dashboard handlers, UI copy, and release outputs.
   Verify: relevant files and old release directory are identified.
2. Change the default document save destination to Desktop and update labels/docs.
   Verify: targeted tests pass and grep no longer shows active Downloads copy for this flow.
3. Remove stale package output and rebuild the desktop package.
   Verify: `apps/desktop/release/` is recreated with current app/DMG artifacts.
4. Publish a GitHub release using the rebuilt artifact.
   Verify: `gh release view` or equivalent confirms the release exists with assets.

## Verification Approach

- Run targeted server/dashboard tests for the document save endpoint.
- Run desktop typecheck/build/package scripts.
- Inspect rebuilt release artifacts.
- Confirm GitHub release creation/listing when network is available.

## Progress Log

- 2026-04-28: Created plan. Found old `apps/desktop/release/` output and dashboard save target currently set to `~/Downloads`.
- 2026-04-28: Updated dashboard document save target to `~/Desktop`, changed Apply Next button/status copy to say Desktop, and aligned the desktop package version to `1.3.0`.
- 2026-04-28: Ran `pnpm --dir apps/server test src/routes/dashboard.test.ts`; 21 tests passed, including the new Desktop default assertion.
- 2026-04-28: Ran `pnpm --dir apps/desktop typecheck`; passed.
- 2026-04-28: Removed stale `apps/desktop/release/` output and rebuilt with `pnpm --dir apps/desktop package`. The first sandboxed run failed on `~/Library/Caches/electron-builder`; the escalated rerun succeeded and produced `apps/desktop/release/Auto Job-1.3.0-arm64.dmg`.

## Key Decisions

- Keep the existing route name `apply-docs/download` for API compatibility; change only the default target and user-facing copy.
- Use tag `v1.3.0` for the GitHub release because `VERSION` is the runtime version source read by the server/extension.

## Risks and Blockers

- GitHub release publishing requires network access and valid GitHub authentication.
- Unsigned macOS app remains personal-use only unless signing/notarization is added later.

## Final Outcome

Pending GitHub release publication.
