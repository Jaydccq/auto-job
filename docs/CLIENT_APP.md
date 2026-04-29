# Auto-Job Client App

The auto-job bridge + dashboard runs as a single local process. To make
it start automatically at login (so you never need to open a terminal),
install the macOS LaunchAgent:

## One-time install

```bash
npm run app:install
```

This creates `~/Library/LaunchAgents/io.hongxi.auto-job.plist` and loads
it via `launchctl`. The server starts immediately and re-launches at login.

## Day-to-day commands

```bash
npm run app:status       # Is it running? Show PID
npm run app:logs         # Tail stdout + stderr
npm run app:logs:err     # Tail stderr only
npm run app:restart      # Restart the running server
npm run app:uninstall    # Remove the LaunchAgent (stops it now + at next login)
```

## Where things live

- LaunchAgent plist: `~/Library/LaunchAgents/io.hongxi.auto-job.plist`
- Logs: `~/Library/Logs/CareerOps/server.out.log` (stdout), `server.err.log` (stderr)
- Auth token: `apps/server/.bridge-token` (random per-machine)
- Default port: `127.0.0.1:47319`
- Dashboard URL: `http://127.0.0.1:47319/dashboard/`

## Default backend

The LaunchAgent runs with `AUTO_JOB_BACKEND=real-codex` (Codex CLI).
Switch to OpenRouter or Claude CLI by editing the plist's
`EnvironmentVariables` block, then `npm run app:restart`.

## Crash recovery

The plist sets `KeepAlive: { Crashed: true, SuccessfulExit: false }`,
so the server is auto-restarted only after a crash, never after a clean
exit (so `npm run app:uninstall` actually stops it).

## Verifying the install

```bash
npm run app:status
# Status: RUNNING (pid 12345)

curl -s http://127.0.0.1:47319/dashboard/ | head -5
# (should print HTML)
```

If `app:status` says NOT INSTALLED, run `npm run app:install`. If it
says LOADED but not running, check logs with `npm run app:logs:err`.

## Building the .app bundle (Electron desktop app)

Stage 5 added an Electron-based desktop app at `apps/desktop/` that
embeds the bridge server in-process and surfaces a menu-bar tray plus a
settings window. For personal use (no codesigning), build it with:

```bash
npm --prefix apps/desktop run package
```

This produces:
- `apps/desktop/release/mac-arm64/Auto Job.app` (the bundle)
- `apps/desktop/release/Auto Job-1.3.0-arm64.dmg` (drag installer)

For a faster iteration loop (skip DMG, just the .app):

```bash
npm --prefix apps/desktop run package:dir
```

Drag `Auto Job.app` to `/Applications/`. The bundle is unsigned, so
macOS Gatekeeper will warn the first time — right-click the .app and
choose **Open** to bypass. To run on other Macs, you'd need an Apple
Developer ID and signing/notarization (out of scope here).

Apply Next document save buttons write generated PDFs to `~/Desktop` by
default. The generated originals remain under `output/`.

### GitHub release

Use the repo `VERSION` file as the release tag source. After rebuilding:

```bash
gh release create "v$(cat VERSION)" \
  "apps/desktop/release/Auto Job-$(cat VERSION)-arm64.dmg" \
  --title "Auto Job v$(cat VERSION)" \
  --notes "Unsigned macOS arm64 desktop build. Generated application documents save to ~/Desktop by default."
```

### Updating the bundled app

The bundle includes a snapshot of the workspace's bundled `dist/main.js`
and the resolved node_modules. After landing changes on `main`, rebuild
with the same command and replace the .app in `/Applications/`.

### Configuring the repo root

The packaged app needs to know where your auto-job checkout lives so
the in-process server can read `cv.md`, `data/applications.md`, etc.
The launcher first checks `AUTO_JOB_REPO_ROOT`, then falls back to
`~/Desktop/auto-job`. If your checkout is elsewhere, launch with:

```bash
AUTO_JOB_REPO_ROOT=$HOME/path/to/auto-job open "/Applications/Auto Job.app"
```

You can also set this once at the user level via `launchctl setenv` so
double-clicking the .app from Finder picks it up.

### Logs

The packaged app mirrors `console.log` / `console.error` to
`~/Library/Logs/Auto Job/main.log`. The tray menu's "View Logs" item
opens the same directory. Use this when debugging launch failures —
Electron's stdout is otherwise captured by macOS's window-server and
hard to read.

### Desktop dev mode

The packaged app path is the supported desktop path right now:
`npm --prefix apps/desktop run package` and `package:dir` build
compiled server/shared output and launch without relying on runtime
`tsx` transforms.

For local desktop iteration, run:

```bash
npm --prefix apps/desktop run dev
```

The command now compiles server/shared/desktop output first, then runs
Electron from `apps/desktop/dist/main.js`. It intentionally avoids the
old `NODE_OPTIONS="--import tsx"` Electron loader path, which failed in
parent desktop commit `b691a3f` with a `tsx` `ERR_INTERNAL_ASSERTION`.

### Desktop icons

The app and tray icons live in `apps/desktop/icons/`:

- `icon.png` is the generated source artwork.
- `icon.icns` is the app bundle icon used by electron-builder.
- `tray.png` is the color tray icon loaded by the running app.
- `trayTemplate.png` is a fallback only.
