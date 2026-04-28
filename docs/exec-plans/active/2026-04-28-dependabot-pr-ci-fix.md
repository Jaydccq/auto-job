# Dependabot PR CI Fix

## Background

Five Dependabot PRs are open against `main`:

- #1 `zod` 3.25.76 -> 4.3.6
- #2 `typescript` 5.x -> 6.0.3
- #3 `electron` 33.4.11 -> 41.3.0
- #4 `esbuild` 0.24.2 -> 0.28.0
- #5 `dotenv` 16.6.1 -> 17.4.2

The GitHub `Tests` check fails on all five before package-specific checks can
complete because the runner does not install Bun. The `Welcome` check also
fails on PRs that opened against the older base workflow because
`actions/first-interaction@v3` expects underscore input names.

## Goal

Unblock the Dependabot PRs by fixing shared GitHub Actions setup in the base
branch, then re-run or rebase the dependency PR checks.

## Scope

- Fix `.github/workflows/test.yml` so `node test-all.mjs --quick` can run Bun
  workspace commands on GitHub-hosted runners using the same Bun version tested
  locally.
- Use the workspace lockfile install path in CI so app/package dependencies are
  present before Bun runs workspace scripts.
- Fix `.github/workflows/welcome.yml` input names for
  `actions/first-interaction@v3`.
- Verify the same quick test entrypoint locally.
- Inspect PR check status after pushing the CI fix.

Out of scope: rewriting Dependabot dependency updates or making unrelated test
suite changes unless a package-specific failure appears after the CI setup is
fixed.

## Assumptions

- The observed `spawnSync bun ENOENT` failures are shared CI setup failures,
  not dependency upgrade failures.
- A base-branch CI fix is the simplest durable fix for all five PRs.
- If individual package failures remain after CI setup is corrected, each PR
  should be handled separately with targeted changes.

## Implementation Steps

1. Update test workflow to install Bun and workspace dependencies before
   `node test-all.mjs --quick`.
   Verify: workflow file is syntactically valid YAML and local quick tests use
   the same command.
2. Update welcome workflow input names from dashed to underscored names.
   Verify: compare against the failure log fields and action input names.
3. Run targeted local verification.
   Verify: `node test-all.mjs --quick` exits successfully locally.
4. Push the CI fix branch and open a PR.
   Verify: GitHub checks start on the CI-fix PR.
5. After the CI fix is merged, re-run or update the five Dependabot PR checks.
   Verify: #1-#5 no longer fail for missing Bun or invalid welcome inputs.

## Verification Approach

- Local: `node test-all.mjs --quick`.
- Remote: GitHub PR checks for the CI-fix PR.
- Follow-up: GitHub PR checks for #1-#5 after base CI fix is available.

## Progress Log

- 2026-04-28: Inspected #1-#5. All failing `Tests` logs show
  `spawnSync bun ENOENT` in workspace checks.
- 2026-04-28: Inspected `Welcome` failure for #1. The log reports unexpected
  dashed inputs and missing `issue_message`.
- 2026-04-28: Updated `test.yml` to install Bun 1.3.5, install dependencies
  through `pnpm install --frozen-lockfile`, and `welcome.yml` to use
  underscored action inputs.
- 2026-04-28: `pnpm install --frozen-lockfile` initially exposed stale
  `@google/generative-ai` entries in `pnpm-lock.yaml`; regenerated the lockfile
  to match current `package.json`.
- 2026-04-28: Local workflow YAML parse check passed. Local
  `node test-all.mjs --quick` reached workspace tests but failed because this
  working tree contains an untracked `AGENTS.md`, which the fork-era command
  surface contract intentionally rejects. The file is not tracked and will not
  be removed by this task.
- 2026-04-28: `CI=true pnpm install --frozen-lockfile` passed after lockfile
  alignment. The first attempt required network access to the npm registry.
- 2026-04-28: Created clean detached worktree at
  `/private/tmp/auto-job-ci-verify-7ddd264`, installed dependencies with
  `CI=true pnpm install --frozen-lockfile`, then ran
  `node test-all.mjs --quick`: 33 passed, 0 failed.

## Key Decisions

- Fix the common CI setup at the base workflow level instead of duplicating the
  same workflow fix into each Dependabot branch.

## Risks And Blockers

- The dependency upgrades may still expose package-specific failures after the
  CI setup is repaired.
- Dependabot branches may need manual rebase or check re-run after the base
  workflow PR merges.

## Final Outcome

Base CI fix is implemented and clean-worktree verified. The next required step
is to merge the CI-fix PR, then re-run or update Dependabot PRs #1-#5 so their
checks execute with Bun and pnpm workspace dependencies installed.
