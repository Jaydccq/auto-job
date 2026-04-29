# Browser Extension + Local Bridge

This workflow lets you evaluate a job posting directly from Chrome without duplicating the existing auto-job pipeline. The extension captures the active tab, sends the page to a local bridge on `127.0.0.1`, and the bridge writes the same report and tracker artifacts used by the CLI flow.

## What It Includes

- `apps/extension/`: Chrome Manifest V3 popup, background worker, and page extraction logic
- `apps/server/`: local Fastify companion with health, liveness, evaluate, jobs, stream, tracker, reports, dashboard, and merge endpoints
- Shared contracts in `packages/shared/src/contracts/*` (re-exported by both server and extension)

## Prerequisites

- Workspace dependencies installed: `npm install` (root)
- Playwright Chromium installed if you want live liveness checks: `npx playwright install chromium`
- For `AUTO_JOB_BACKEND=real-codex` (default) or `real-claude`: the matching CLI on `PATH`
- For `AUTO_JOB_BACKEND=real-openrouter`: `OPENROUTER_API_KEY` in the environment

## Verify Everything

From the repo root:

```bash
npm run verify
```

That now runs the existing tracker integrity checks plus:

- `apps/server`: tests + typecheck
- `apps/extension`: typecheck + build

## Start the Bridge

The repo root now exposes short aliases so you do not have to type env vars by hand.

Typical Codex flow:

```bash
npm run ext:build
npm run server
```

That does two things from the repo root:

- builds `apps/extension/dist`
- starts the bridge in `real-codex` mode

Other common shortcuts:

```bash
npm run ext:build
npm run server                                  # real / codex (default)
AUTO_JOB_BACKEND=real-claude npm run server   # real / claude
AUTO_JOB_BACKEND=fake npm run server          # fake (UI smoke)
```

If you want a simple macOS picker instead of remembering commands:

```bash
npm run ext:launcher
```

That opens a native dialog where you can choose build/start actions.

The default command flow is:

- run `npm run ext:build`
- start `npm run server` in Terminal
- reveal `apps/extension/dist` in Finder
- open `chrome://extensions` in Chrome

The first screen is now intentionally short:

- `Desktop launchpad (Codex)`
- `Desktop launchpad (Claude)`
- `Advanced tools…`

Less common maintenance actions live under `Advanced tools…` so the main launcher stays clean.

Default mode is `fake`, which is safe for UI and integration testing.

```bash
npm run server
```

Optional modes (set `AUTO_JOB_BACKEND` to pick the adapter):

```bash
AUTO_JOB_BACKEND=real-codex npm run server
AUTO_JOB_BACKEND=real-claude npm run server
AUTO_JOB_BACKEND=real-openrouter OPENROUTER_API_KEY=... npm run server
AUTO_JOB_BACKEND=fake npm run server
```

The raw commands above still work; the root aliases are just shorter wrappers around them.

Bridge notes:

- Binds to `127.0.0.1:47319` by default
- Generates or reuses `apps/server/.bridge-token`
- Rejects requests without `x-auto-job-token`
- Refuses to boot `real-openrouter` mode unless `OPENROUTER_API_KEY` is present
- Default backend is `real-codex`; set `AUTO_JOB_BACKEND=real-claude` to run the same bridge flow through `claude -p`
- Codex bridge evaluations default to `AUTO_JOB_CODEX_MODEL=gpt-5.4-mini` and `AUTO_JOB_CODEX_REASONING_EFFORT=medium`, overriding user-level Codex defaults for stable cost/latency.

Quick health check:

```bash
curl -s -H "x-auto-job-token: $(cat apps/server/.bridge-token)" http://127.0.0.1:47319/v1/health
```

## Build and Load the Extension

```bash
npm run ext:build
```

Then in Chrome:

1. Open `chrome://extensions`
2. Enable Developer Mode
3. Click `Load unpacked`
4. Select `apps/extension/dist`

`chrome://extensions` is only for loading or reloading the unpacked extension.
The toolbar action cannot open the in-page panel on Chrome's own pages. After
loading, switch to a regular `http` or `https` job posting tab, then click the
auto-job toolbar icon or press `Alt+Shift+C`.

The popup will ask for the bridge token on first use. Paste the contents of `apps/server/.bridge-token`.

## Typical Flow

1. Start the bridge locally
2. Open a job posting in Chrome
3. Open the extension popup
4. Confirm the bridge is healthy
5. Run liveness or evaluation
6. Open the generated report or tracker output from the popup

Artifacts still land in the normal auto-job locations:

- reports: `reports/*.md`
- tracker additions: `batch/tracker-additions/*.tsv`
- merged tracker: `data/applications.md` after running merge

## Mode Guidance

- `fake`: best for UI work, popup QA, and contract-level smoke tests
- `real-codex` (default): uses `codex exec` as a CLI wrapper around the batch prompt and artifact flow
- `real-claude`: uses `claude -p` as the alternate CLI path
- `real-openrouter`: direct OpenRouter HTTP API call using `OPENROUTER_API_KEY` (no CLI auth needed)

## Current Limits

- The extension does not submit applications
- The bridge writes tracker TSV additions, not direct tracker merges
- `real-codex` is the fastest integration path; it reuses the existing prompt/output contract but has not been hardened to the same degree as the long-standing Claude path

## Troubleshooting

- Toolbar icon does nothing on `chrome://extensions`: switch to a normal web page or job posting first. Chrome blocks panel injection on browser-owned pages.
- `UNAUTHORIZED`: token in the popup does not match `apps/server/.bridge-token`
- `BRIDGE_NOT_READY`: required local files like `cv.md` or `config/profile.yml` are missing
- `RATE_LIMITED`: the bridge allows 3 evaluations per minute
- Health works but evaluation fails in `real-openrouter` mode: verify `OPENROUTER_API_KEY`
- Health works but default `real-codex` mode fails: verify the `codex` CLI is installed, authenticated, and on `PATH`
- Health works but `real-claude` fails: verify the `claude` CLI is installed and on `PATH`
