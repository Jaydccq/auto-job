# Mode: scan — Portal scanner (discovery + auto-evaluation)

Hits configured Greenhouse / Ashby / Lever / A16Z / Amazon / Built In APIs,
filters by `portals.yml`, queues new postings through the local bridge for
evaluation, and writes the run summary to `data/scan-runs/`.

The discovery phase is zero-token (public ATS APIs only). The evaluation
phase uses the bridge's selected backend (Codex / Claude / OpenRouter / fake).

## Default flow

```bash
# Start the bridge first.
npm run server

# In a second shell:
npm run scan
```

`npm run scan` discovers via APIs, dedupes against `data/scan-history.tsv`,
appends new rows to `data/pipeline.md`, queues current-run jobs through
`/v1/evaluate` with `evaluationMode: newgrad_quick`, and waits for tracker
and report completion before exiting.

## Variants

| Command | Behavior |
|---------|----------|
| `npm run scan -- --no-evaluate` | Discovery only; do not evaluate |
| `npm run scan -- --evaluate-limit 5` | Cap the evaluation batch |
| `npm run scan -- --builtin-only` | Restrict to Built In adapters |
| `npm run scan -- --evaluate-only` | Re-evaluate already-pending Built In rows |
| `npm run scan -- --dry-run` | Discover and log, queue nothing |

`--evaluate` is accepted for compatibility but redundant — direct evaluation
is the default.

## Agent fallback (when an ATS isn't supported)

If a target company does not expose a Greenhouse / Ashby / Lever / A16Z /
Amazon API, `scan.mjs` ignores it. The agent must complete the discovery
manually:

1. **Playwright** — `browser_navigate` to the careers page, snapshot,
   extract postings. Respect the project rule: never run two Playwright
   sessions in parallel.
2. **WebSearch** — fall back when Playwright is hostile (CAPTCHA, login
   wall). Use site-scoped queries first.

Append discovered rows to `data/pipeline.md` with the same shape the API
adapters use, then run `npm run scan -- --evaluate-only` to push them
through the bridge.

## Run artifacts

Every scan writes to `data/scan-runs/`:

- `{source}-{ISO-timestamp}-{shortid}.jsonl` — raw row stream.
- `{source}-{ISO-timestamp}-{shortid}-summary.json` — counts, latencies,
  errors.

The dashboard reads these to show the most recent scan health.

## Liveness verification (post-evaluate)

Reports with score ≥ 4.5 should also pass `npm run liveness <url>` before
the user invests time on a tailored CV. The liveness check uses Playwright
and the rules in `liveness-core.mjs` to decide active / expired /
uncertain.
