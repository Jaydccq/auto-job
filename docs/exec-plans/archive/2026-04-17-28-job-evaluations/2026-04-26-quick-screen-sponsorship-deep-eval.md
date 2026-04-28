# Quick Screen Sponsorship Deep Eval

## Background

`newgrad_quick` can currently finish as `deep_eval`, `skip`, or
`manual_review`. Recent LinkedIn evaluations produced `manual_review` mainly
because sponsorship was not explicitly confirmed. The user wants unknown
sponsorship to proceed to deep evaluation instead of stopping at manual review.

## Goal

Update the repo-native quick-screen behavior so unknown or unconfirmed
sponsorship alone does not produce `manual_review`; otherwise-strong roles
should continue into `deep_eval`.

## Scope

- Update quick-screen decision logic and prompt rules.
- Add focused tests for the sponsorship-unknown path.
- Keep explicit no-sponsorship and restricted-work-authorization language as
  blockers.
- Do not redesign evaluation scoring or unrelated scan behavior.

## Assumptions

- The user wants a durable rule change for future evaluations, not only manual
  edits to the six generated reports.
- `manual_review` may still be valid for other ambiguity such as questionable
  posting legitimacy, unclear seniority, or duplicated/aggregator listings.
- Explicit no-sponsorship remains a hard blocker.

## Implementation Steps

1. Locate quick-screen decision and report generation.
   Verify: identify the code and tests that mention `manual_review`,
   `deep_eval`, and sponsorship unknown.
2. Add a code-level guard so sponsorship-unknown wording does not keep a strong
   role in `manual_review`.
   Verify: targeted unit test fails before the change and passes after.
3. Update prompt/documentation strings to match the guard.
   Verify: search output no longer instructs manual review solely for missing
   sponsorship.
4. Run focused verification.
   Verify: targeted bridge tests and typecheck pass.

## Verification Approach

- `npm --prefix bridge run test -- src/adapters/claude-pipeline.test.ts`
- `npm --prefix bridge run typecheck`
- Optional full pipeline verification if generated artifacts are touched.

## Progress Log

- 2026-04-26: User requested: "取消这个 manual_review，只要sponsorship 未确认 你也直接进入深评".
- 2026-04-26: Goal, scope, assumptions, and verification criteria recorded.
- 2026-04-26: Located quick-screen decision flow in
  `bridge/src/adapters/claude-pipeline.ts`. `manual_review` was prompt-driven
  after the local blocker precheck; sponsorship unknown was already excluded
  from hard blockers but the prompt still allowed manual review for missing or
  ambiguous signals before full evaluation.
- 2026-04-26: Added `applyQuickEvaluationPolicy` as a code-level guard. If the
  quick evaluator returns `manual_review` and the only manual-review reason is
  unknown/unconfirmed sponsorship, the bridge changes the decision to
  `deep_eval`, removes sponsorship-unknown blocker tokens, and logs the policy
  override. Non-sponsorship ambiguity such as source quality, duplicated
  aggregator listings, unclear seniority, suspicious posting, or missing JD
  evidence can still remain `manual_review`.
- 2026-04-26: Updated the quick-screen prompt to state that unknown or
  unconfirmed sponsorship must not be the sole reason for `manual_review`; an
  otherwise strong role should choose `deep_eval` and carry sponsorship as a
  risk note for the full evaluation.
- 2026-04-26: Added targeted tests for the new policy guard and prompt text.
- 2026-04-26: Verification passed:
  `npm --prefix bridge run test -- src/adapters/claude-pipeline.test.ts`
  completed 32/32 tests, including the new policy tests. `npm --prefix bridge
  run typecheck` passed.
- 2026-04-26: Restarted the live bridge so the updated policy is loaded. The
  first restart attempt failed with `EADDRINUSE` because a child `tsx` process
  still held port 47319; after stopping the remaining child process, `npm run
  ext:bridge` started successfully in real Codex mode.
- 2026-04-26: Re-ran the six LinkedIn candidates from
  `data/scan-runs/linkedin-20260426T041403Z-65bdfc3d.jsonl` with
  `--evaluation-mode default` to force full deep evaluation instead of
  quick-screen terminal reports. Queue summary:
  `data/scan-runs/linkedin-eval-20260426T060459Z-4bf87e8e-summary.json`.
  Result: 6 queued, 6 completed, 0 failed, 0 timed out.
- 2026-04-26: Full deep-eval reports produced:
  `reports/394-general-motors-2026-04-26.md` (4.4/5),
  `reports/395-prestige-staffing-2026-04-26.md` (4.2/5),
  `reports/396-google-2026-04-26.md` (4.1/5),
  `reports/397-jobs-via-dice-2026-04-26.md` (4.10/5),
  `reports/398-jobs-via-dice-2026-04-26.md` (3.8/5), and
  `reports/399-jpmorganchase-2026-04-26.md` (4.4/5).
- 2026-04-26: `node verify-pipeline.mjs` initially passed with 0 errors and 3
  warnings. The new warning was a duplicate tracker row for Prestige Staffing
  caused by keeping both the earlier quick-screen report and the new full
  deep-eval report.
- 2026-04-26: Removed only the superseded Prestige Staffing quick-screen row
  from `data/applications.md`; did not run global dedup because that would touch
  unrelated historical RemoteHunter and Anduril duplicate warnings.
- 2026-04-26: Final `node verify-pipeline.mjs` passed with 0 errors and 2
  pre-existing duplicate warnings for RemoteHunter and Anduril only.
- 2026-04-26: Investigated the apparent deep-eval latency for the second Dice
  posting and JPMorganChase. The reported durations were end-to-end queue
  latency, not pure execution time. At the time of the run, the bridge default
  evaluation concurrency was 2 (`CAREER_OPS_BRIDGE_EVAL_CONCURRENCY`, default
  2), so the fifth and sixth queued jobs waited for earlier worker slots. Dice 2
  queued at 06:05:08.809Z, started at 06:09:04.875Z, and completed at
  06:11:00.299Z; JPMorganChase queued at 06:05:10.925Z, started at
  06:09:30.841Z, and completed at 06:11:35.345Z.
- 2026-04-26: User requested raising the default bridge evaluation concurrency
  to 3. Updated `DEFAULT_EVAL_CONCURRENCY` in
  `bridge/src/runtime/config.ts`; `CAREER_OPS_BRIDGE_EVAL_CONCURRENCY` can still
  override this default when explicitly set.
- 2026-04-26: Verified the concurrency change with `npm --prefix bridge run
  typecheck`, `npm --prefix bridge run test --
  src/runtime/__tests__/evaluation-worker-pool.test.ts`, and a local
  `loadConfig().evaluationConcurrency` check returning `3`. Restarted the
  bridge with `npm run ext:bridge`; `/v1/health` passed in real Codex mode.

## Key Decisions

- Treat unknown sponsorship as a risk note, not a quick-screen terminal state.
- Preserve hard skips for explicit no-sponsorship or restricted authorization
  language.
- Keep `manual_review` available for ambiguity unrelated to sponsorship.
- Re-run the current six affected LinkedIn candidates through full evaluation
  rather than editing quick-screen report text by hand.
- Treat batch duration reports as queue latency unless the per-job bridge log
  start time has been subtracted.
- Use bridge evaluation concurrency 3 by default to reduce third-wave queue
  latency for six-job evaluation batches.

## Risks and Blockers

- Existing quick-screen reports remain in the repository for audit history. The
  new deep-eval reports supersede them but do not delete them.
- The bridge prompt still relies on the evaluator for nuanced legitimacy and
  seniority judgment; this change only removes sponsorship-unknown as a sole
  manual-review reason.
- Existing RemoteHunter and Anduril duplicate warnings remain unrelated to this
  change.

## Final Outcome

Unknown/unconfirmed sponsorship no longer stops an otherwise strong
`newgrad_quick` candidate at `manual_review`. The bridge prompt and code-level
policy guard now promote sponsorship-only manual review decisions to
`deep_eval`, while preserving manual review for unrelated ambiguity. The six
affected LinkedIn candidates were re-run through full deep evaluation and all
completed successfully. The superseded Prestige Staffing quick-screen tracker
row was removed, leaving pipeline verification at 0 errors with only the two
pre-existing duplicate warnings.
