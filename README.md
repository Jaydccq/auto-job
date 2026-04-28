# auto-job

Local-first AI job-search runtime. Scan postings, evaluate them against your
CV, generate tailored documents, track outcomes — all on your machine, with
your data, with no shared cloud state.

This repository is my personal workspace. The `main` branch is what I run.
If you're forking this for your own search, treat the `data/` and `config/`
contents as private and start with your own.

## Components

- **`apps/server`** — Local Fastify bridge on `127.0.0.1:47319`. Hosts the
  evaluation pipeline, scan adapters, dashboard endpoints, Gmail signal
  ingestion. Backends: Codex CLI, Claude CLI, OpenRouter, or a fake adapter
  for tests.
- **`apps/extension`** — Chrome MV3 extension. Captures postings, calls the
  bridge, autofills application forms (never submits).
- **`apps/desktop`** — Electron wrapper. Tray app + dashboard window with
  the bridge embedded in-process.
- **`packages/shared`** — TypeScript contracts shared across server, extension,
  and desktop.
- **Root scripts (`*.mjs`)** — operator CLIs: `verify`, `merge`, `dedup`,
  `normalize`, `pdf`, `liveness`, `scan`, `doctor`.
- **`modes/`** — operator instructions read by the Claude Code skill
  (`.claude/skills/career-ops/SKILL.md`).
- **`batch/`** — system prompt and orchestration files for the batch worker.
- **`web/`** — local dashboard build target.

## Run modes

### Desktop app

```bash
bun run --cwd apps/desktop package
open "apps/desktop/release/mac-arm64/Career Ops.app"
```

Tray icon, dashboard window, settings panel. The extension talks to it on
`127.0.0.1:47319`.

### Headless LaunchAgent (macOS)

```bash
bun run app:install   # one-time
bun run app:status
bun run app:logs
bun run app:restart
```

Server runs at login. No window.

### Manual / development

```bash
bun run server                                       # Codex backend
CAREER_OPS_BACKEND=fake bun run server               # fake adapter
CAREER_OPS_BACKEND=real-openrouter bun run server    # OpenRouter
```

Then visit `http://127.0.0.1:47319/dashboard/`.

## Quick start

```bash
bun install
bun run doctor              # checks Node, Playwright, profile, portals
bun run server              # in another shell
bun run scan -- --no-evaluate   # smoke a discovery scan
bun run verify              # full health gate
```

Onboard a fresh user:

1. Drop your CV markdown at `cv.md`.
2. Copy `config/profile.example.yml` to `config/profile.yml`; fill it in.
3. Copy `templates/portals.example.yml` to `portals.yml`; trim it.
4. Run `bun run doctor` until it's all green.
5. Open Claude Code in this repo and paste a job posting URL. The
   `career-ops` skill takes it from there.

## Data layout

See `DATA_CONTRACT.md` for the full split between **owned-runtime** files
(in this repo) and **user data** (gitignored, never overwritten).

## License

MIT — see `LICENSE`.
