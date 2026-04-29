# Desktop AI Icon And Tray Fix

## Background

The packaged Auto Job desktop app shows an oversized menu-bar icon on macOS. The current desktop app assets live under `apps/desktop/icons/`, and `apps/desktop/src/tray.ts` loads `tray.png` directly.

The requested working directory `/Users/hongxichen/Desktop/career-ops` currently contains only `data/automation` and is not a Git checkout. The active app repository with Electron desktop code is `/Users/hongxichen/Desktop/auto-job`; this plan records that assumption.

## Goal

Regenerate the desktop app icon so it reads more like a high-tech AI company, and fix the macOS top-bar/tray icon so it renders at menu-bar scale.

## Scope

- Update desktop icon assets under `apps/desktop/icons/`.
- Update tray icon loading if needed to force a correct menu-bar size.
- Do not alter unrelated desktop packaging/server-resolution changes already present in the worktree.

## Assumptions

- The screenshot refers to the Auto Job Electron desktop app in `/Users/hongxichen/Desktop/auto-job`.
- The large top-bar icon is caused by Electron receiving a 64x64 color tray asset without resizing.
- A 18x18 tray image is the safest macOS menu-bar target while keeping the 1024x1024 app icon for packaging.

## Implementation Steps

1. Inspect current desktop assets and tray loading.
   Verify: confirm current icon dimensions and code path.
2. Generate or synthesize a new high-tech AI-style app icon.
   Verify: output `apps/desktop/icons/icon.png` at 1024x1024.
3. Derive tray icons from the new icon at explicit menu-bar dimensions.
   Verify: `tray.png` and `trayTemplate.png` are small assets.
4. Update `tray.ts` to resize native images defensively before constructing `Tray`.
   Verify: desktop typecheck/build.

## Verification Approach

- `file apps/desktop/icons/*`
- `sips -g pixelWidth -g pixelHeight apps/desktop/icons/*.png`
- `bun run --cwd apps/desktop typecheck`
- `bun run --cwd apps/desktop build`

## Progress Log

- 2026-04-29: Confirmed `/Users/hongxichen/Desktop/career-ops` is not a Git checkout; using `/Users/hongxichen/Desktop/auto-job` as the active app repo.
- 2026-04-29: Current `icon.png` is 1024x1024, `tray.png` is 64x64, and `trayTemplate.png` is 32x32.
- 2026-04-29: Gemini image generation was unavailable because `GEMINI_API_KEY` is not set in the shell, so generated a deterministic local high-tech AI icon instead.
- 2026-04-29: Rebuilt `icon.png`, `icon.icns`, `tray.png`, and `trayTemplate.png`; tray assets are now 18x18.
- 2026-04-29: Updated `apps/desktop/src/tray.ts` to resize tray native images to 18x18 before creating the `Tray`.
- 2026-04-29: Verification passed: asset dimension check, `bun run --cwd apps/desktop typecheck`, `bun run --cwd apps/desktop build`, and `bun run --cwd apps/desktop package:dir`.

## Key Decisions

- Keep the fix surgical: assets plus tray image normalization only.
- Use 18x18 as both the generated tray asset size and the defensive Electron resize target.
- Rebuild only the packaged `.app` directory with `package:dir`; do not rebuild the DMG in this task.

## Risks And Blockers

- Gemini image generation requires `GEMINI_API_KEY` and network access. If unavailable, use a deterministic local vector/raster icon generator as a fallback and record that path.

## Final Outcome

Completed. The desktop app now has a regenerated AI-themed icon, explicit small tray assets, and defensive tray image resizing. `apps/desktop/release/mac-arm64/Auto Job.app` was rebuilt with the new assets and code.
