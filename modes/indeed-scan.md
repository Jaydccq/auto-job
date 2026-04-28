# Mode: indeed-scan -- Indeed Jobs Scanner

Scans an Indeed search URL through the read-only `bb-browser site indeed/jobs`
adapter, scores jobs with the existing newgrad scanner, enriches promoted rows,
and queues `newgrad_quick` evaluations by default.

## Prerequisites

- `bb-browser` installed and on `PATH`
- Bridge server running for write/evaluate paths (`bun run server`)
- Indeed accessible in the managed browser

If Indeed requires login, verification, or a security check, run:

```bash
bb-browser open https://www.indeed.com
```

Complete the manual verification in that browser, then rerun the scan. Do not
try to bypass verification.

## Execution

Use the supplied 7-day entry-level Indeed URL shape:

```text
https://www.indeed.com/jobs?q=software%20engineer%2C%20AI%20engineer&l=&fromage=7&sc=0kf%3Aattr%28CF3CP%29explvl%28ENTRY_LEVEL%29%3B&from=searchOnDesktopSerp
```

Preview without writes:

```bash
bun run indeed-scan -- --url "<Indeed URL>" --score-only --limit 20
```

`--score-only` extracts and scores rows without calling bridge write endpoints.
The full URL is preserved, including `fromage=7`, empty `l=`, and `sc=...`.

Write pipeline candidates without evaluations only when you intentionally want
the old list-only path:

```bash
bun run indeed-scan -- --url "<Indeed URL>" --no-evaluate --enrich-limit 5
```

Scan and queue capped evaluations:

```bash
bun run indeed-scan -- --url "<Indeed URL>" --evaluate-limit 3
```

Useful options:

```bash
bun run indeed-scan -- --url "<Indeed URL>" --score-only --pages 3 --limit 60
bun run indeed-scan -- --query "software engineer, AI engineer" --location "" --score-only
bun run indeed-scan -- --bridge-host 127.0.0.1 --bridge-port 47319
```

## Safety Boundaries

- Never submit applications.
- Never click Apply, Save, job alerts, login, or resume upload controls.
- Treat Indeed verification as a manual recovery state.
- Keep Indeed job URLs as pipeline URLs; do not click through external apply
  flows automatically.

## Output Summary

When reporting results, include:

- Search URL used.
- Rows extracted.
- Promoted and filtered counts.
- Detail enrichment successes or verification blockers.
- Pipeline entries added or skipped.
- Evaluation jobs queued/completed unless `--no-evaluate` was used.
