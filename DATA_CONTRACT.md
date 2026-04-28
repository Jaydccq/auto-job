# Data Contract

`auto-job` separates **owned-runtime files** from **user data**. They have
different update rules and different gitignore rules.

## User data — never auto-updated, gitignored

These files are personal and stay personal. Nothing in the runtime overwrites
them; nothing in CI ships them. The user is the only writer.

| Path | Purpose |
|------|---------|
| `cv.md` | Canonical CV (Markdown) |
| `article-digest.md` | Detailed proof points (optional) |
| `config/profile.yml` | Identity, contact info, comp targets |
| `modes/_profile.md` | User-specific archetypes, narrative, blocked companies |
| `portals.yml` | User's portal scanner config |
| `data/applications.md` | Application tracker |
| `data/pipeline.md` | Inbox of pending URLs |
| `data/scan-history.tsv` | Scanner dedup ledger |
| `data/scan-runs/*` | Per-run scan summaries |
| `data/automation/*` | Automation log artifacts |
| `data/gmail-signals.jsonl` | Cached Gmail-derived application signals |
| `reports/*.md` | Per-evaluation reports |
| `output/*` | Generated PDFs, cover letters, HTML drafts |
| `jds/*` | Pasted JD captures |
| `interview-prep/{company}-{role}.md` | Per-company interview intel |
| `batch/tracker-additions/*.tsv` | Pending tracker rows (merged by `bun run merge`) |

If the user asks the runtime to "remember", "tune", "personalize", or
"customize" anything, the change goes into one of `cv.md`,
`config/profile.yml`, `modes/_profile.md`, `article-digest.md`, or
`portals.yml`. Never into the owned-runtime layer below.

## Owned-runtime layer — managed by the repo

These files express system behavior. They are versioned, reviewed, and
overwritten by the runtime as it evolves. **Do not** put user data here.

| Path | Purpose |
|------|---------|
| `apps/server/**` | Local Fastify bridge, adapters, routes, contracts |
| `apps/extension/**` | Chrome MV3 extension source |
| `apps/desktop/**` | Electron wrapper |
| `packages/shared/**` | Shared TypeScript contracts |
| `modes/_shared.md` | Shared rubric and report contract |
| `modes/oferta.md`, `auto-pipeline.md`, `scan.md`, `*-scan.md`, `contacto.md`, `cover-letter.md`, `followup.md` | Mode operator instructions |
| `batch/batch-prompt.md` | System prompt for the batch worker |
| `templates/cv-template.html` | CV layout |
| `templates/states.yml` | Canonical statuses |
| `templates/portals.example.yml` | Starter portal config |
| Root `*.mjs` | CLI utilities (`verify`, `merge`, `dedup`, `normalize`, `pdf`, `liveness`, `scan`, `doctor`) |
| `scripts/**` | Launchers and automation helpers |
| `web/**` | Dashboard build / template |
| `.claude/skills/career-ops/SKILL.md` | Claude Code routing |
| `docs/**` | Architecture docs, exec plans, ADRs |

## Wire-level contracts (do not break silently)

These shapes are read by more than one component. Changing them requires a
matched change in every reader.

### Tracker row (`data/applications.md`)

```
| {num} | {date} | {company} | {role} | {score} | {status} | {pdf} | {report-link} | {notes} |
```

Score format: `X.X/5` (or `N/A`, `DUP`). Status: one of
`templates/states.yml`. PDF: `✅` or `❌`.

### Tracker addition (`batch/tracker-additions/{NNN}-{slug}.tsv`)

Tab-separated, 9 columns, status **before** score:

```
{num}\t{date}\t{company}\t{role}\t{status}\t{score}/5\t{pdf}\t{report-link}\t{notes}
```

`bun run merge` reads these, swaps the column order to match the tracker,
deduplicates by report number → company+role, and moves the file to
`batch/tracker-additions/merged/`.

### Report header (`reports/{NNN}-{slug}-{YYYY-MM-DD}.md`)

```
**Date:** YYYY-MM-DD
**Score:** X.X/5
**URL:** {posting URL}
**Legitimacy:** High Confidence | Proceed with Caution | Suspicious
**Archetype:** {primary} (+ {secondary} if hybrid)
**PDF:** {path or —}
**Cover letter:** {path or —}
```

The dashboard parses these fields. Renaming or dropping a field breaks the
dashboard.

### Bridge wire schema

`packages/shared` exports the canonical `EvaluationInput`,
`EvaluationResult`, and `BridgeResponse` types. The Chrome extension imports
them at build time. The bridge tests assert that `apps/extension`'s wire
shape matches `packages/shared`. If you change a field, change all three.

## Verification

`bun run verify` runs the integrity gate over the user-data layer (canonical
statuses, score format, no duplicates, report links resolve), the
ownership-guard over the owned-runtime layer, and the workspace
test/typecheck/build steps.
