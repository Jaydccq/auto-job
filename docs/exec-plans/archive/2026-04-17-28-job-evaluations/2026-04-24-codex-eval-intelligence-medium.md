# Codex Eval Model and Intelligence Defaults

## Background

Bridge-driven Codex evaluations inherit Codex CLI defaults unless the bridge
passes explicit options. The current user-level Codex config sets
`model_reasoning_effort = "xhigh"`, and evaluation logs show quick/full eval
runs using `reasoning effort: xhigh`.

## Goal

Set Codex bridge evaluations to `gpt-5.4-mini` with medium
intelligence/reasoning effort by default.

## Scope

- Bridge real-mode Codex evaluations.
- Quick `newgrad_quick` and full A-G evaluation subprocesses.
- Bridge docs for the override.
- All scanner-triggered `/v1/evaluate` jobs, including LinkedIn, newgrad,
  Built In, Indeed, and generic Ashby/API scan results.

Out of scope: changing the user's global `~/.codex/config.toml` or Claude/SDK
evaluation paths.

## Assumptions

- "intelligence" maps to the Codex CLI `model_reasoning_effort` setting.
- `medium` should be the repo default, with an environment override for future
  experiments.
- Scanner scripts do not choose the model directly; they call the bridge
  `/v1/evaluate` endpoint, so the bridge default applies to all scan sources.
- The requested "5.4-Mini" model maps to the Codex CLI model id
  `gpt-5.4-mini`.

## Implementation Steps

1. Add bridge config for `CAREER_OPS_CODEX_REASONING_EFFORT`.
   Verify: typecheck catches all config consumers.
2. Pass `-c model_reasoning_effort="medium"` to Codex quick and full evals.
   Verify: focused unit tests inspect command args.
3. Default `CAREER_OPS_CODEX_MODEL` to `gpt-5.4-mini`.
   Verify: focused unit tests inspect command args and docs mention the model.
4. Document the default.
   Verify: docs mention the env var and default.

## Verification Approach

- Focused bridge tests for Codex command construction.
- Bridge typecheck.
- `git diff --check`.

## Progress Log

- 2026-04-24: Created plan after user requested medium intelligence for Codex
  evaluations. Located the current source of `xhigh` as user-level Codex config
  inherited by bridge subprocesses.
- 2026-04-24: Added `codexReasoningEffort` to bridge config, defaulting to
  `medium` with `CAREER_OPS_CODEX_REASONING_EFFORT` as the override. Full and
  quick Codex evaluation plans now pass `-c model_reasoning_effort="medium"`.
- 2026-04-24: Added a focused unit test that inspects both Codex command
  shapes. Documented the default in `docs/BROWSER_EXTENSION.md`.
- 2026-04-25: User requested that all scanner-triggered evaluations
  (LinkedIn, newgrad, Built In, Indeed, and Ashby/API scan) use model
  `5.4-Mini` and intelligence `Medium`. Confirmed scanner scripts build
  `EvaluationInput` only and all model/reasoning selection comes from the bridge
  Codex adapter.
- 2026-04-25: Changed the bridge default Codex model from `gpt-5.4` to
  `gpt-5.4-mini`; kept `CAREER_OPS_CODEX_MODEL` as the override and kept
  `CAREER_OPS_CODEX_REASONING_EFFORT=medium` as the default intelligence.
  Updated focused tests to assert both full and quick Codex evaluation plans
  include `-m gpt-5.4-mini` and `model_reasoning_effort="medium"`.
- 2026-04-25: Verification passed:
  `npm --prefix bridge run test -- src/adapters/claude-pipeline.test.ts
  src/server.test.ts`, `npm --prefix bridge run typecheck`, and
  `git diff --check`.

## Key Decisions

- Use bridge-level CLI config rather than editing global Codex config, so the
  change is repository-local and applies only to career-ops evaluations.

## Risks and Blockers

- If Codex CLI renames `model_reasoning_effort`, the bridge will pass a stale
  config key. This should be visible in evaluation logs and testable with a
  minimal Codex probe.

## Final Outcome

Completed. Codex bridge evaluations now use `gpt-5.4-mini` and medium
reasoning effort by default without modifying user-level Codex config. Because
all scan runners queue evaluation through the bridge `/v1/evaluate` endpoint,
this applies to LinkedIn, newgrad, Built In, Indeed, and Ashby/API scan
evaluations.

Verification passed:

- `npm --prefix bridge test -- src/adapters/claude-pipeline.test.ts src/batch/merge-tracker.test.ts`
- `npm --prefix bridge run typecheck`
- `codex exec -c 'model_reasoning_effort="medium"' --help`
- `git diff --check`
