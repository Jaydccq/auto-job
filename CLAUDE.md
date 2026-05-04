# auto-job — agent operating instructions

Personal local-first job-search runtime. The repo is the system of record;
runtime behavior lives in `apps/server`, `apps/extension`, `apps/desktop`,
`packages/shared`, and the modes under `modes/`. Everything user-specific
lives in gitignored files (`cv.md`, `config/profile.yml`, `modes/_profile.md`,
`portals.yml`, `data/*`, `reports/*`, `output/*`, `interview-prep/*`).

## Data contract (critical)

There are two layers. `DATA_CONTRACT.md` has the full table.

**User layer — never auto-updated, personalization goes here:**
- `cv.md`, `config/profile.yml`, `modes/_profile.md`, `article-digest.md`,
  `portals.yml`
- `data/*`, `reports/*`, `output/*`, `interview-prep/*`,
  `batch/tracker-additions/*`

**Owned-runtime layer — managed by this repo:**
- `apps/*`, `packages/*`, `modes/_shared.md`, `modes/oferta.md`,
  `modes/auto-pipeline.md`, `modes/scan.md`, `modes/*-scan.md`,
  `modes/contacto.md`, `modes/cover-letter.md`, `modes/followup.md`
- `batch/batch-prompt.md`, `templates/*`, root `*.mjs`, `scripts/*`,
  `web/*`, `skills/*`, `.claude/skills/*`
- `CLAUDE.md`, `README.md`, `DATA_CONTRACT.md`, `LEGAL_DISCLAIMER.md`

**The rule:** when the user asks to customize anything (archetypes, narrative,
negotiation scripts, proof points, blocked companies, comp targets), write to
`modes/_profile.md` or `config/profile.yml`. Never edit `modes/_shared.md` or
the runtime layer for user-specific content.

## Active skill modes

| Trigger | Mode |
|---------|------|
| User pastes JD or URL with no subcommand | `auto-pipeline` |
| "Evaluate", "score this offer" | `oferta` |
| "Tailor my CV", "make a PDF" | continue from `auto-pipeline` step 3 |
| "Cover letter for {company}" | `cover-letter` |
| "Scan portals" / "scan {source}" | `scan`, `builtin-scan`, `linkedin-scan`, `indeed-scan`, `newgrad-scan`, `gmail-scan` |
| "Tracker", "what's in flight" | read `data/applications.md` and the dashboard |
| "Follow up" | `followup` |
| "LinkedIn outreach" | `contacto` |
| "Interview prep for {company}" | append to `interview-prep/{company}-{role}.md` |

## Hot file map

| Path | Purpose |
|------|---------|
| `apps/server/` | Local Fastify bridge + dashboard server |
| `apps/extension/` | Chrome MV3 extension |
| `apps/desktop/` | Electron wrapper |
| `packages/shared/` | TS contracts shared across server, extension, desktop |
| `packages/browser/` | In-process CDP browser library (`@auto-job/browser`); replaces bb-browser. Phase 1 = read path. Profile: `~/.auto-job/chrome-profile/` (user home). See `docs/architecture/own-browser.md`. |
| `modes/_shared.md` | Rubric, report contract, tracker contract |
| `modes/oferta.md` | Block A–G evaluation prompt |
| `batch/batch-prompt.md` | System prompt for the batch worker |
| `data/applications.md` | Application tracker |
| `data/pipeline.md` | Inbox of pending URLs |
| `data/scan-history.tsv` | Scanner dedup ledger |
| `templates/cv-template.html` | CV layout |
| `templates/states.yml` | Canonical statuses |
| `templates/portals.example.yml` | Starter portal config |
| `generate-pdf.mjs` | Playwright HTML → PDF |
| `merge-tracker.mjs` | Apply pending TSVs to the tracker |
| `verify-pipeline.mjs` | Full health gate (`npm run verify`) |
| `scripts/verify-repo-guard.mjs` | Ownership guard (no upstream surfaces) |
| `scripts/backfill-unknown-company.mjs` | Re-derive `company` for stored Gmail signals (idempotent; see `modes/gmail-scan.md`) |

## Run flow

Three valid setups:

**Desktop app** (visual):
```bash
npm --prefix apps/desktop run package
open "apps/desktop/release/mac-arm64/Auto Job.app"
```

**LaunchAgent** (headless, macOS, runs at login):
```bash
npm run app:install
npm run app:logs
npm run app:restart
```

**Manual** (development):
```bash
npm run server                                       # Codex
AUTO_JOB_BACKEND=fake npm run server               # tests
AUTO_JOB_BACKEND=real-openrouter npm run server    # OpenRouter
```

Dashboard at `http://127.0.0.1:47319/dashboard/`.

**First-time own-browser setup** (Phase 1 only, one-off):
```bash
npm run own-browser:login-helper   # walks through LinkedIn / Indeed / BuiltIn / JobRight logins
                                   # in the dedicated Chrome profile (~/.auto-job/chrome-profile)
```
After this, `npm run linkedin-scan / builtin-scan / indeed-scan / newgrad-scan`
all use `@auto-job/browser` (no `bb-browser` PATH binary needed).
The old `*-bb-browser.ts` scripts remain on disk as a fallback during the
7-day stability window — invoke directly via `npx tsx scripts/linkedin-scan-bb-browser.ts ...`.

## Onboarding (first session)

Before any evaluation or scan, silently check:

1. `cv.md` exists.
2. `config/profile.yml` exists (not just `profile.example.yml`).
3. `modes/_profile.md` exists.
4. `portals.yml` exists when a scan is requested.

If any is missing, walk the user through the matching onboarding step before
proceeding. If `modes/_profile.md` is missing, ask the user — do not silently
copy a template (template files were removed during the fork-severance
rewrite).

## Ethical use — non-negotiable

- **Never submit, click Apply, click Next, or click Submit** on the user's
  behalf. Fill forms, draft answers, generate PDFs — but always stop before
  the irreversible click.
- **Recommend SKIP for sub-3.5 scores.** Do not generate PDFs for sub-4.5
  scores unless the user explicitly overrides.
- **Quality > quantity.** Five well-targeted applications beat fifty generic
  blasts.

## Verification rules

- **Posting still active** → Playwright (`browser_navigate` +
  `browser_snapshot`). Never WebFetch alone.
- **Comp / market data** → WebSearch with cited sources.
- **One Playwright session at a time per process.** Adapters serialize at the
  worker pool level; respect that.
- **Batch mode (`claude -p`):** Playwright is not available. Fall back to
  WebFetch and stamp `**Verification:** unconfirmed (batch mode)` in the
  report header.

## Quality gates

- `npm run verify` — runs ownership guard + tracker integrity + workspace
  test/typecheck/build.
- `npm run verify:repo-guard` — ownership-only, fast.
- Branch protection: `main` rejects direct pushes; status checks must pass.

## Stack

- npm for package commands inside `apps/*` and `packages/*`.
- Node 20 for root `*.mjs` scripts.
- Playwright for live posting verification, PDF rendering, and scrape
  fallbacks.
- TypeScript inside workspaces; Markdown for prompts and trackers; YAML for
  config.

## Tracker conventions

- **Never edit `data/applications.md` to add a new row.** Write a TSV at
  `batch/tracker-additions/{NNN}-{slug}.tsv` (9 columns, status before score)
  and run `npm run merge`.
- Status promotions / note edits **on existing rows** can edit
  `data/applications.md` directly.
- Reports: `reports/{NNN}-{slug}-{YYYY-MM-DD}.md`. Header must include
  `**URL:**` and `**Legitimacy:**`.
- Verify after batches: `npm run verify`.
- Normalize statuses: `npm run normalize`.
- Dedup: `npm run dedup`.

## Canonical statuses

Source of truth: `templates/states.yml`.

| State | When |
|-------|------|
| Evaluated | Report produced; user has not decided |
| Applied | Application submitted |
| Responded | Company replied (no interview yet) |
| Interview | Active interview process |
| Offer | Offer received |
| Rejected | Rejected by company |
| Discarded | Withdrawn or posting closed |
| SKIP | Evaluated and intentionally not applied |

No markdown bold (`**`) in the status field. No dates (use the date column).
No extra text (use the notes column).
