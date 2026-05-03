# Mode: newgrad-recommend-scan — Jobright Personalized Recommend Scanner

Scans the authenticated `https://jobright.ai/jobs/recommend` feed (the user's
personalized, resume-matched daily batch) through `bb-browser`, extracts each
listing's structured detail page, cross-checks against blocked-company memory
and `hard_filters`, writes survivors to `data/pipeline.md`, and queues
`newgrad_quick` evaluations by default.

This is distinct from `newgrad-scan` (which targets the public
`newgrad-jobs.com` aggregator). This mode reads the **personalized** Jobright
recommend feed, which carries Jobright's match score, H1B-sponsor label, and
saved-filter context for the logged-in account.

## Prerequisites

- Bridge server running in real Codex mode (`npm run server`)
- `bb-browser` installed and on `PATH`
- Jobright account logged in inside the `bb-browser` managed browser

If Jobright requires login or the recommend page redirects to `https://jobright.ai/`,
authenticate manually:

```bash
# Try cookie import from local Chrome first (fast, no UI needed)
bb-browser cookie-import-browser chrome --domain jobright.ai

# If still redirected to /, fall back to headed login
bb-browser connect
bb-browser goto https://jobright.ai/jobs/recommend
# Sign in via Google OAuth in the visible Chromium window, then resume
```

After logging in, the persistent profile keeps the session valid across runs.
Close the headed browser before launching the autonomous scan so the profile is
not locked.

## Execution

### Step 1: Verify bridge

Check `/v1/health`. If it is not reachable, tell the user:

> "Start the bridge first: `npm run server`"

The health response should show `execution.mode=real` and
`execution.realExecutor=codex` before queueing evaluations.

### Step 2: Confirm authenticated recommend page

Navigate and verify the URL stays on `/jobs/recommend` (a redirect to `/` means
the session is missing).

```bash
bb-browser goto https://jobright.ai/jobs/recommend
bb-browser url
# Expected: https://jobright.ai/jobs/recommend
```

If redirected, run the login flow in **Prerequisites** and re-try.

### Step 3: Dismiss known popups

Jobright periodically overlays modals on the recommend page. Dismiss them
before snapshotting:

| Popup | Trigger | Dismiss |
|-------|---------|---------|
| "Save My Spot Now" upgrade modal | First visit per session | Click button "Close" |
| "EXIT / TRY IT NOW" resume-tool overlay | Detail pages | Click button "EXIT" |
| "Complete to Win 1v1 Coaching" sidebar | Free Plan | Informational, no action |

Generic JS dismisser (idempotent, safe to call before every step):

```bash
bb-browser eval scripts/extractors/jobright-dismiss-popups.js
```

### Step 4: Run the scan

Preferred autonomous form (when `scripts/newgrad-recommend-scan-bb-browser.ts`
exists):

```bash
npm run newgrad-recommend-scan
```

Until that script lands, run the agent-driven fallback below. Each step is
idempotent and read-only on Jobright; only local files are written.

#### Agent-driven fallback (no script yet)

1. **List snapshot.** Capture interactive refs and collect every `/jobs/info/<id>`
   href from the recommend feed.

   ```bash
   bb-browser snapshot -i -d 6
   # For each @e* link whose accessible name starts with "company-logo":
   bb-browser attrs @<ref>   # extract href -> /jobs/info/<job_id>
   ```

   Free Plan typically surfaces ~7 cards per visit; paid plans surface more.
   Stop when the list scroll hits bottom or `--limit` is reached.

2. **Dedupe.** Drop any `<job_id>` already present in `data/scan-history.tsv`,
   `data/pipeline.md`, or `data/applications.md` before opening detail pages.

3. **Detail extraction.** For each surviving id:

   ```bash
   bb-browser goto https://jobright.ai/jobs/info/<id>
   # dismiss EXIT popup if present
   bb-browser eval scripts/extractors/jobright-detail.js
   ```

   Capture: `title`, `company`, `location`, `salary`, `posted`, `workMode`,
   `seniority`, `match` (NN% STRONG/GOOD/FAIR/WEAK MATCH), `h1b`
   (`H1B Likely` / `No H1B` / `Unknown`), `exp`, `stage`, `skills[]`. Persist
   each row as JSON under `data/scan-runs/{run_id}/<id>.json`.

4. **Apply blockers.** Drop rows whose company matches any of:
   - `config/profile.yml -> newgrad_scan -> hard_filters` (no-sponsorship,
     active-clearance lists)
   - `data/newgrad-company-memory.yml` (auto-remembered blockers)
   - `~/.claude/projects/-Users-hongxichen-Desktop-career-ops/memory/user_blocked_companies.md`
     (user-level memory: Veeva, Klaviyo, Boeing, …)

   Additionally flag — but do not auto-skip — rows where Jobright reports
   `No H1B` so the user can verify on H1Bgrader before applying.

5. **Write pipeline.** Append survivors to `data/pipeline.md` tagged as
   `newgrad-recommend-scan`. Use the `/jobs/info/<id>` URL as the canonical URL
   when no external ATS posting URL is exposed on the detail page.

6. **Append history.** Write every newly seen id to `data/scan-history.tsv`,
   including ones that failed score or hard-filter gates, so repeated scans do
   not resurface them.

7. **Queue evaluations.** Send pipeline survivors to `/v1/evaluate` with
   `evaluationMode: newgrad_quick` and wait for completion (skip with
   `--no-evaluate`).

### Step 5: Run artifacts

Every autonomous run writes:

- `data/scan-runs/{scan_run_id}.jsonl` — per-row events (list-filter,
  detail-gate, queue, completion, failure, timeout) without full JD/page text.
- `data/scan-runs/{scan_run_id}-summary.json` — aggregate counts plus the
  recommend feed URL, total cards seen, skipped (blocked / no-sponsorship), and
  pipeline / evaluation tallies.

The CLI prints the summary path before exiting. Use that summary first when
debugging why the scan found, skipped, queued, or evaluated a role.

## Useful options

```bash
npm run newgrad-recommend-scan -- --score-only
npm run newgrad-recommend-scan -- --no-evaluate
npm run newgrad-recommend-scan -- --enrich-limit 10
npm run newgrad-recommend-scan -- --evaluate-limit 3
npm run newgrad-recommend-scan -- --limit 20
npm run newgrad-recommend-scan -- --headed
npm run newgrad-recommend-scan -- --user-data-dir data/browser-profiles/jobright
```

## Safety Boundaries

- **Never** click `Apply with Autofill`, `APPLY NOW`, `Like`, `Not Interested`,
  `ASK ORION`, or any external ATS controls reached from the detail page.
- **Never** submit applications, message recruiters, or interact with the
  Jobright autofill extension.
- Treat OAuth login, account-verification, and CAPTCHA pages as manual
  recovery states — `bb-browser handoff` or `connect`, then `resume`.
- Dismiss popups only via their explicit close controls (`Close`, `EXIT`).
  Do not use Escape-spam or click outside, which can trigger nav.
- Keep the `/jobs/info/<id>` URL as the canonical pipeline URL when the
  detail page does not expose an external ATS link.

## Output Summary

When reporting results, include:

- Recommend feed URL and the active saved-filter label (e.g. "Backend Engineer
  +6 roles, US, Onsite, New Grad").
- Total cards seen, deduped (already in history/pipeline/applications), and
  newly extracted.
- Per-job: title, company, location, salary, match%, H1B status.
- Skipped rows grouped by reason (blocked-company memory, hard-filter, No H1B,
  duplicate).
- Pipeline rows added.
- Evaluation jobs queued / completed unless `--no-evaluate` was used.
- Popup events dismissed during the run.

## Configuration

Scoring thresholds and blockers reuse `newgrad_scan`:

- `config/profile.yml -> newgrad_scan -> list_threshold` — minimum Jobright
  match% to open a detail page
- `config/profile.yml -> newgrad_scan -> pipeline_threshold` — minimum match%
  to add to `data/pipeline.md`
- `config/profile.yml -> newgrad_scan -> hard_filters` — no-sponsorship and
  clearance blockers
- `data/newgrad-company-memory.yml` — auto-remembered company blockers
  (shared with `newgrad-scan`)

Free Plan note: Jobright's recommend feed surfaces a limited daily batch
(~7 cards). For full coverage, schedule the scan to run periodically and rely
on cumulative `data/scan-history.tsv` deduping rather than a single large run.
