# Newgrad Scan Run

## Background

The user requested `/career op newgrad scan`, which maps to the repo-native
newgrad scanner. Project instructions require repo-durable execution notes for
nontrivial work and read-only behavior with respect to applications.

## Goal

Run the autonomous newgrad scan from the local checkout, preserve existing
pipeline behavior, and report the resulting scan/evaluation artifacts.

## Scope

- Use the checked-in `npm run newgrad-scan` workflow.
- Keep the default evaluation path unless the runner or bridge blocks it.
- Do not submit applications or click apply controls.
- Do not modify unrelated dirty worktree files.

## Assumptions

- Default scan behavior should include `newgrad_quick` evaluation.
- The local bridge must be healthy in real Codex mode before evaluation writes.
- Existing uncommitted scan artifacts belong to earlier runs and should be left
  intact.

## Implementation Steps

1. Verify setup, update state, command mapping, and bridge health.
   Verify: required profile files exist and `/v1/health` is checked.
2. Start or reuse the real Codex bridge if needed.
   Verify: health shows real execution with Codex executor.
3. Run `npm run newgrad-scan`.
   Verify: CLI exits successfully and prints a scan summary path.
4. Inspect the new scan summary and relevant tracker/report outputs.
   Verify: summarize found/skipped/queued/completed/failed counts.
5. Run targeted verification.
   Verify: `npm run dashboard:build` and/or `npm run verify` result recorded.

## Verification Approach

Use command exit codes and generated repo artifacts as the source of truth:
`data/scan-runs/{scan_run_id}.jsonl`, matching summary JSON, tracker/report
updates, and targeted npm verification.

## Progress Log

- 2026-04-28: Confirmed required profile files exist, update checker returned
  offline for local version 1.3.0, and `npm run newgrad-scan` maps to
  `scripts/newgrad-scan-autonomous.ts`.
- 2026-04-28: Bridge health at `127.0.0.1:47319` was not reachable before the
  run; next step is to start `npm run ext:bridge` locally.
- 2026-04-28: Started `npm run ext:bridge`; bridge booted in real mode with
  `realExecutor=codex`, model `gpt-5.4-mini`, and reasoning effort `medium`.
- 2026-04-28: Ran `npm run newgrad-scan`; summary artifact:
  `data/scan-runs/newgrad-20260428T020927Z-aac2bf38-summary.json`.
- 2026-04-28: Scan completed with 119 discovered rows, 48 list-promoted rows,
  71 list-filtered rows, 48 enriched rows, 0 enrichment failures, 0 detail
  additions, 48 detail skips, and 0 queued evaluations.
- 2026-04-28: Detail skip breakdown from the runner:
  `already_evaluated_report=17`, `site_signal_mixed=8`,
  `site_match_below_bar=13`, `no_sponsorship=5`, `experience_too_high=1`,
  `active_clearance_required=1`, `pipeline_threshold=3`.
- 2026-04-28: Ran `npm run verify`; result was 0 errors and 1 existing warning
  for possible duplicate Anduril rows `#3`, `#8`, `#9`.
- 2026-04-28: Skipped `npm run dashboard:build` because `web/index.html` was
  already dirty before this run and no tracker rows were added by the scan.

## Key Decisions

- Use the autonomous runner rather than a manual browser or parallel scanner.
- Preserve evaluation-by-default behavior because the user did not pass
  `--no-evaluate`.

## Risks and Blockers

- The bridge may fail to start or may run in a non-real mode.
- Jobright/newgrad network access or login state may block enrichment.
- Sandbox restrictions may prevent the bridge or browser from opening local IPC.

## Final Outcome

Completed. The newgrad scan finished successfully and produced:

- `data/scan-runs/newgrad-20260428T020927Z-aac2bf38.jsonl`
- `data/scan-runs/newgrad-20260428T020927Z-aac2bf38-summary.json`

No direct evaluations were queued because all 48 enriched candidates were
skipped by the detail gate. Verification passed via `npm run verify` with 0
errors and the pre-existing Anduril duplicate warning.
