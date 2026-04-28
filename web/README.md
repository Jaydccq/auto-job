# Auto-Job Dashboard

A local dashboard for browsing reports, tracker, pipeline, and scan history.
It is served by the bridge from this repository so Apply Next actions can
reuse the local Node/Playwright PDF generators.

## Usage

```bash
bun run server          # start the bridge (also serves the dashboard)
```

Then open `http://127.0.0.1:47319/dashboard/`.

The legacy `bun run dashboard` / `bun run dashboard` scripts now just print
this URL — there is no separate dashboard server process anymore.

## What it shows

| Tab           | Source                       | Features                                   |
|---------------|------------------------------|--------------------------------------------|
| Apply Next    | `data/applications.md` + `reports/*.md` | Priority shortlist, selective shortlist, local completion marks |
| Reports       | `reports/*.md`               | Filter, select, render Markdown in panel   |
| Tracker       | `data/applications.md` + `reports/*.md` + `data/gmail-signals.jsonl` | Pipeline cards, active/attention counts, top opportunities, Gmail-only rows, email evidence, full-evaluation queue button |
| Pipeline      | `data/pipeline.md`           | Filter, done/pending toggle                |
| Scan History  | `data/scan-history.tsv`      | Filter, portal dropdown, sortable columns  |
| Keywords      | `data/newgrad-skill-stats.json` | Last-scan and profile matched/missed skill coverage |

## How it works

1. The bridge serves `template.html` (via `apps/server/src/routes/dashboard.ts`)
   with fresh data from the repo at `/dashboard/`.
2. `build-dashboard.mjs` provides the shared parser/renderer for tracker,
   reports, pipeline, scan history, and keyword stats. `dashboard-handlers.mjs`
   exports the helpers (PDF generation, apply-status mutation, full-evaluation
   queue) that the bridge route wires into Fastify.
3. Apply Next PDF buttons call `/dashboard/api/apply-docs/*`, which reuses
   `generate-pdf.mjs` and `generate-cover-letter.mjs`, creates PDFs under
   `output/`, and copies them into `~/Desktop` when the save button is
   clicked.
4. Tracker rows read quick-screen decisions from report metadata such as
   `**Decision:** manual_review`. `manual_review` rows show a **Full Eval**
   button when the bridge is running. The button queues a default bridge
   evaluation, so `bun run server` must be running.
5. Gmail signals are optional derived facts from read-only mailbox review. If
   `data/gmail-signals.jsonl` exists, Tracker matches records by
   `applicationNum` or exact company+role. Unmatched signals render as
   Gmail-only rows so companies discovered from the inbox still appear in the
   pipeline. Expanded rows show short email evidence, not full raw bodies.
6. The Gmail refresh hook that used to run on dashboard startup is not yet
   migrated to the bridge. Run `bun run gmail:scan` (or `bun run gmail:update`)
   manually when you want fresh signals; the script writes
   `data/gmail-refresh-status.json` and `data/gmail-signals.jsonl`.

For a connector-assisted mailbox scan, run `/auto-job gmail-scan` inside
Codex.

For automatic local Gmail API refreshes, create a Google Cloud OAuth client
with Application type `Desktop app`, save it as
`config/gmail-oauth-credentials.json`, and run:

```bash
bun run gmail:auth
bun run gmail:scan
```

Do not use a Google OAuth `Web application` client for this local scanner. The
auth flow uses a random `127.0.0.1` callback port; Web clients commonly fail
with `redirect_uri_mismatch`.

The same Google Cloud project must have Gmail API enabled. If the scan reports
that Gmail API has not been used or is disabled, enable Gmail API in that
project, wait for propagation, then run `bun run gmail:scan` again.

After `gmail:auth`, run a fresh Gmail API scan manually whenever you want to
refresh signals:

```bash
bun run gmail:scan
```

The bridge does not auto-run this on startup yet.

The `Apply Next` tab also stores a local completion marker in browser
`localStorage`. That marker is a dashboard convenience only; canonical tracker
state still lives in `data/applications.md`.

Report Markdown is rendered client-side with [marked](https://marked.js.org/)
and sanitised through [DOMPurify](https://github.com/cure53/DOMPurify).

## Static Export

To write a standalone `web/index.html` snapshot:

```bash
bun run dashboard:build
```

Static export intentionally omits local profile email and Gmail signal data.
Run `bun run server` and open `http://127.0.0.1:47319/dashboard/` for the
private, fully enriched local view.

Run it after:

- new evaluation reports (reports/*.md)
- `node merge-tracker.mjs` runs (applications.md updates)
- scanner runs (scan-history.tsv updates)

The static snapshot can still browse embedded data, but PDF generation and
full-evaluation queueing both require the bridge to be running.
