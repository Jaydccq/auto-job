---
name: newgrad-recommend-scan
description: Scan the authenticated jobright.ai/jobs/recommend personalized feed via bb-browser, extract each posting's structured detail, cross-check against blocked-company memory + hard_filters + No-H1B labels, write survivors to data/pipeline.md, and queue newgrad_quick evaluations. Use when the user says "scan recommend", "scan jobright recommend", "scan my recommended jobs", or "scan jobright" with no other portal qualifier. Distinct from `newgrad-scan`, which targets the public newgrad-jobs.com aggregator.
---

# newgrad-recommend-scan

This is the repository-local, agent-agnostic skill source. The runtime mirror
at `.claude/skills/newgrad-recommend-scan/SKILL.md` must stay byte-for-byte
synced; `npm run verify:skills` enforces that.

## When to invoke

Trigger on any of:

- "Scan recommend", "scan jobright recommend", "scan my recommended jobs"
- "Scan jobright" (with no other portal qualifier)
- Any explicit ask to scan the personalized recommend feed at
  `https://jobright.ai/jobs/recommend`

Do **not** invoke for:

- Generic newgrad scans → use `newgrad-scan` (newgrad-jobs.com aggregator)
- LinkedIn / Indeed / Built In / Greenhouse → their own modes
- Pasted JD / posting URL → `auto-pipeline`

## Required reads at session start

1. `modes/_shared.md` — rubric, report contract, tracker contract.
2. `modes/newgrad-recommend-scan.md` — the full execution procedure for this
   skill. Treat it as authoritative; this SKILL.md is the front door, the mode
   file owns the steps.
3. `config/profile.yml -> newgrad_scan` — list/pipeline thresholds and
   `hard_filters` (no-sponsorship, active-clearance lists).
4. `data/newgrad-company-memory.yml` — auto-remembered blocked companies.

## Workflow (summary; full version lives in `modes/newgrad-recommend-scan.md`)

1. **Verify bridge.** `/v1/health` reachable, `execution.mode=real`,
   `execution.realExecutor=codex`. If not, tell the user to run
   `npm run server`.
2. **Confirm authenticated session.** `bb-browser goto
   https://jobright.ai/jobs/recommend`; verify the URL stays on
   `/jobs/recommend`. If redirected to `/`, run the login flow:
   ```bash
   bb-browser cookie-import-browser chrome --domain jobright.ai
   # If still redirected, fall back to headed login:
   bb-browser connect
   bb-browser goto https://jobright.ai/jobs/recommend
   # User completes Google OAuth in the visible Chromium window.
   ```
3. **Dismiss popups.** `bb-browser eval scripts/extractors/jobright-dismiss-popups.js`
   covers the "Save My Spot" upgrade modal and the "EXIT/TRY IT NOW" resume
   tool overlay. Idempotent.
4. **Enumerate recommend feed.** `bb-browser snapshot -i -d 6`. Each card link
   has accessible name `company-logo …` and a `/jobs/info/<id>` href. Free
   Plan surfaces ~7 cards per visit.
5. **Dedupe.** Drop ids already in `data/scan-history.tsv`,
   `data/pipeline.md`, or `data/applications.md`.
6. **Detail extraction.** For each surviving id:
   ```bash
   bb-browser goto https://jobright.ai/jobs/info/<id>
   bb-browser eval scripts/extractors/jobright-dismiss-popups.js
   bb-browser eval scripts/extractors/jobright-detail.js
   ```
   The extractor returns one JSON line: `title`, `company`, `location`,
   `salary`, `posted`, `workMode`, `seniority`, `match`, `h1b`, `exp`,
   `stage`, `skills[]`. Write to `data/scan-runs/{run_id}/<id>.json`.
7. **Apply blockers.** Drop rows where company matches:
   - `config/profile.yml -> newgrad_scan -> hard_filters`
   - `data/newgrad-company-memory.yml`

   Flag (do not auto-skip) rows where Jobright reports `No H1B` so the user
   can verify on H1Bgrader before applying.
8. **Write pipeline.** Append survivors to `data/pipeline.md` tagged as
   `newgrad-recommend-scan`. Use the `/jobs/info/<id>` URL as the canonical
   pipeline URL when no external ATS posting URL is exposed.
9. **Append history.** Write every newly seen id to `data/scan-history.tsv`,
   including hard-filter rejections, so repeated scans do not resurface them.
10. **Queue evaluations.** POST to `/v1/evaluate` with
    `evaluationMode: newgrad_quick` and wait for completion (skip with
    `--no-evaluate`).

## Hard rules (override everything else)

- **Never** click `Apply with Autofill`, `APPLY NOW`, `Like`,
  `Not Interested`, `ASK ORION`, or any external ATS controls.
- **Never** submit applications, interact with the autofill extension, or
  message recruiters.
- Treat OAuth, account-verification, and CAPTCHA pages as manual recovery
  states (`bb-browser handoff` or `connect`, then `resume`).
- Dismiss popups only via their explicit close controls (`Close`, `EXIT`).
  Do not click outside or spam Escape — those can trigger nav.
- **Never edit `data/applications.md` directly.** Write a TSV under
  `batch/tracker-additions/` and let `npm run merge` apply it.

## Output contract

When reporting results, include:

- Recommend feed URL and active saved-filter label.
- Total cards seen, deduped, newly extracted.
- Per-job: title, company, location, salary, match%, H1B status.
- Skipped rows grouped by reason (blocked-company memory, hard-filter,
  No H1B, duplicate).
- Pipeline rows added.
- Evaluation jobs queued/completed unless `--no-evaluate` was used.
- Popup events dismissed during the run.

## Configuration

Reuses `newgrad_scan` config (see `modes/newgrad-recommend-scan.md` →
Configuration). Thresholds, hard_filters, and company memory are shared with
`newgrad-scan` so a company blocked there is also blocked here.

## Free Plan caveat

Jobright's recommend feed surfaces a limited daily batch (~7 cards) on the
Free Plan. For full coverage, schedule the scan to run periodically and rely
on `data/scan-history.tsv` deduping rather than a single large run.
