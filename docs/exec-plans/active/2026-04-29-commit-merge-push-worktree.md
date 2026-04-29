# Commit, Merge, Push Worktree

## Background

The current `main` checkout has a broad dirty worktree spanning runtime code,
docs, agent skill mirrors, and new OpenSpec/agent integration files. The user
asked to commit all changes, merge all, and push.

## Goal

Save the current repository state into Git, incorporate current remote changes
for the target branch, and push the result to `origin/main`.

## Scope

- Include all tracked and untracked repository changes.
- Keep the workflow on the current `main` branch unless Git state shows a
  required target change.
- Use the repo's existing smart commit workflow for staging, commit, and push.

## Assumptions

- "All" means the current worktree changes in this checkout.
- "Merge" means bring `origin/main` into local `main` before the final push if
  remote has advanced.
- Existing unrelated edits are intentional because the user explicitly asked to
  commit all.

## Implementation Steps

1. Inspect git status, remotes, and branch tracking.
   Verify: `git status --short --branch`, `git branch -vv`, `git remote -v`.
2. Run the most relevant available verification.
   Verify: `npm run verify` if dependencies and environment permit it.
3. Commit and push all changes using the smart commit workflow.
   Verify: command completes and `git status --short --branch` is clean.
4. Fetch and merge remote `main` if needed, then push the final `main`.
   Verify: local `main` and `origin/main` point to the same commit.

## Verification Approach

Prefer `npm run verify` as the repo health gate. If it fails for an
environmental reason, record the failure and continue only if the git operation
itself is still safe.

## Progress Log

- 2026-04-29: Created plan after confirming current branch is `main`, tracking
  `origin/main`, with broad tracked and untracked changes.
- 2026-04-29: `git diff --check` passed.
- 2026-04-29: First `npm run verify` failed because OpenSpec skill mirrors
  lacked canonical `skills/` sources and the command-surface contract still
  treated new agent surfaces as removed.
- 2026-04-29: Added canonical OpenSpec skill files, extended skill-sync checks,
  and updated the command-surface contract for versioned agent surfaces.
- 2026-04-29: Targeted verification passed:
  `npm run verify:skills`, `npm --prefix apps/server test --
  src/adapters/command-surface-contract.test.ts`, `npm --prefix apps/server
  test -- src/routes/dashboard.test.ts`, and `npm --prefix apps/server test --
  src/batch/batch-runner.e2e.test.ts`.
- 2026-04-29: Full `npm run verify` passed repo guard, skill mirrors,
  typecheck, and extension build, but the full parallel server test run timed
  out three tests that passed in targeted reruns.
- 2026-04-29: Committed and pushed local worktree as `134fa9f chore: sync
  auto-job worktree`.
- 2026-04-29: Merged open PRs #1, #2, #3, #4, and #5. PR #4 required a local
  conflict resolution in `apps/extension/package.json` to keep both `esbuild`
  `^0.28.0` and `typescript` `^6.0.3`; extension typecheck and build passed
  before pushing the resolved branch.
- 2026-04-29: Fast-forwarded local `main` to `origin/main` after all merges.
  Final `npm run verify` passed with `0` errors and the known duplicate
  Anduril tracker warning.

## Key Decisions

- Use the current checkout directly because the user asked to commit all local
  work.
- Treat the newly added OpenSpec/agent command surfaces as owned repository
  artifacts and encode that in tests instead of relying on prose.

## Risks and Blockers

- The dirty tree is broad; this workflow does not review each feature change.
- Network or SSH configuration can block fetch/push.

## Final Outcome

Local changes were committed and pushed, all open PRs were merged, local
`main` matches `origin/main`, and final repo verification passed.
