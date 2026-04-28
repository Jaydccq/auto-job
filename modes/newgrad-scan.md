# Mode: newgrad-scan — newgrad-jobs.com Scanner

Scans newgrad-jobs.com for matching job listings, scores them locally, enriches
high-scoring rows, adds survivors to the pipeline, and queues formal tracker
evaluations for enrich survivors.

## Prerequisites

- Bridge server running in real Codex mode (`bun run server`)
- Playwright browser installed (`bunx playwright install chromium` if missing)
- Google Chrome installed when a manual Jobright login is needed

## Execution

Prefer the autonomous browser runner. It reuses the same DOM extractors as the
Chrome extension and sends results through the existing bridge endpoints.

### Step 1: Verify bridge is running

Check `/v1/health`. If not reachable, tell the user:

> "Start the bridge first: `bun run server`"

The health response should show `execution.mode=real` and
`execution.realExecutor=codex` before queueing evaluations.

### Step 2: Login when Jobright requires it

If Jobright requires login, open the dedicated non-automated Chrome login
window:

```bash
bun run newgrad-scan:login
```

This opens top-level `https://jobright.ai/` with the same persistent profile
used by the scanner. Do not log in from the embedded `newgrad-jobs.com` page or
from a Playwright-controlled scan window; Google may reject those contexts as
insecure. After logging in, close the Chrome window before running the scan so
the profile is not locked.

### Step 3: Run autonomous browser scan

Run:

```bash
bun run newgrad-scan
```

This opens `https://www.newgrad-jobs.com/` in a headless bundled Chromium scan
browser, resolves the embedded Jobright source, extracts list rows, scores them
with the bridge, enriches promoted detail pages, writes qualifying rows to
`data/pipeline.md`, then sends enrich survivors to `/v1/evaluate` using
`newgrad_quick` so reports and tracker rows can be written to
`data/applications.md`.

The runner uses a persistent browser profile at
`data/browser-profiles/newgrad-scan`, so Jobright login cookies can be reused
between scan runs. Close any manually opened scan browser before running a scan.
The autonomous runner closes its scan browser after detail enrichment, before it
waits for direct evaluation jobs.

Useful options:

```bash
bun run newgrad-scan -- --headless
bun run newgrad-scan -- --headed
bun run newgrad-scan -- --chrome
bun run newgrad-scan -- --score-only
bun run newgrad-scan -- --no-evaluate
bun run newgrad-scan -- --evaluate-limit 3
bun run newgrad-scan -- --enrich-limit 10
bun run newgrad-scan -- --list-source api --score-only
bun run newgrad-scan -- --list-source initial-jobs --limit 20 --score-only
bun run newgrad-scan -- --user-data-dir data/browser-profiles/newgrad-scan
```

List source behavior:
- Default `--list-source auto`: when the resolved Jobright page supports the
  paginated `/swan/mini-sites/list` API, the runner reads 50-row pages until it
  reaches listings older than 24 hours. If that API fails, it falls back to
  `initialJobs` and then the DOM scroller.
- `--list-source api`: force Jobright's paginated list API. This is the fastest
  full-coverage source for Jobright minisite scans.
- `--list-source dom`: force the original DOM scrolling extractor for maximum
  compatibility.
- `--list-source initial-jobs`: use only Jobright's server-rendered initial
  payload. This is fastest for quick smoke checks, but it may only include the
  first page of listings.

Evaluation behavior:
- Default: queue formal `newgrad_quick` evaluations for all enrich survivors and
  wait for completion so tracker merges can finish.
- `newgrad_quick` can finish as `deep_eval`, `skip`, or `manual_review`.
  `manual_review` writes a quick-screen report/tracker row and does not spend a
  full evaluation.
- If model quick eval fails, the runner only falls back to full eval for strong
  local-value candidates. Ordinary quick failures are surfaced instead of
  silently spending full-eval budget.
- Use `--no-evaluate` to keep the old enrich-to-pipeline-only behavior.
- Use `--evaluate-limit N` to cap how many survivors are sent to evaluation.
- Use `--no-wait-evaluations` to queue jobs and return immediately.

Run artifacts:
- Every autonomous run writes `data/scan-runs/{scan_run_id}.jsonl` and
  `data/scan-runs/{scan_run_id}-summary.json`.
- The JSONL log records list-filter, detail-gate, queue, completion, failure,
  and timeout events without full JD/page text.
- The CLI prints the summary path before exiting. Use that summary first when
  debugging why a scan found, skipped, queued, or evaluated a role.

If browser automation is unavailable, use the extension fallback:

> "Open https://www.newgrad-jobs.com/ in Chrome.
> The career-ops panel will detect the page and show the scanner UI.
> Click **Scan & Score** to extract and filter listings.
> Then click **Enrich detail pages** to gather full JD data.
> Results will be written to `data/pipeline.md`."

### Step 4: Process results

After the scan completes, offer:

> "Scan complete. Enrich survivors were queued for formal evaluation and tracker
> merge. Any completed `Evaluated` rows at `4.0/5+` will appear in Apply Now;
> `3.5-3.95/5` rows will appear in Selective Apply. If you used
> `--no-evaluate`, run `/career-ops pipeline` or `/career-ops batch` on the
> pipeline entries."

## Scoring Configuration

Scoring is configured in `config/profile.yml → newgrad_scan`. Three dimensions:
1. **Role match** — title keyword matching
2. **Skill keywords** — qualifications text matching
3. **Freshness** — post age

Thresholds:
- `list_threshold` — minimum score to open detail page
- `pipeline_threshold` — minimum score to add to `data/pipeline.md`
- `hard_filters` — root-level blocker rules like "no sponsorship" and
  "active secret clearance required"

Company-level memory:
- Manual company blocklists live in `config/profile.yml -> newgrad_scan -> hard_filters`
- Auto-remembered companies live in `data/newgrad-company-memory.yml`
- Once a company is remembered for `no_sponsorship` or
  `active_clearance_required`, future scans skip it before detail enrichment
- Auto-memory only writes blockers confirmed on the original employer posting;
  newgrad-jobs.com and Jobright signals alone are not enough to persist a company

Scan de-duplication:
- The list scan only promotes rows posted within the last 24 hours.
- Rows already present in `data/scan-history.tsv`, `data/pipeline.md`, or
  `data/applications.md` are skipped before scoring.
- Newly seen rows are appended to `data/scan-history.tsv`, including rows that
  fail score filters, so repeated scans do not resurface the same listing.

To customize: edit `config/profile.yml → newgrad_scan`.
