# Merge upstream/main on 2026-04-22

## Background

The local `main` branch is behind `upstream/main`. A fetch moved `upstream/main`
from `10c496c` to `b8a3a12`.

## Goal

Merge the latest original repository changes from `upstream/main` into the
current branch and summarize what upstream changed.

## Scope

- Inspect incoming upstream commits and file changes.
- Merge `upstream/main` into the current `main` branch.
- Preserve user-specific data files unless upstream explicitly touches them.
- Run targeted verification after the merge.

## Assumptions

- The current branch, `main`, is the intended merge target.
- The requested source branch is exactly `upstream/main`.
- The incoming upstream range is `10c496c..b8a3a12`.
- The merge may remove tracked project files because those removals are present
  in upstream.

## Implementation Steps

1. Fetch upstream.
   Verify: `git fetch upstream` exits successfully.
2. Inspect incoming commits and file changes.
   Verify: `git log --oneline HEAD..upstream/main` and
   `git diff --stat HEAD..upstream/main`.
3. Merge `upstream/main`.
   Verify: merge exits successfully and there are no unmerged paths.
4. Run targeted verification.
   Verify: use the repository's available verification command after merge.
5. Record the result and summarize upstream changes.
   Verify: update this plan with final outcome and verification results.

## Verification Approach

- Confirm Git status after merge.
- Run the most relevant available repo verification command.
- If the upstream merge removes prior verification scripts, report that and use
  the remaining applicable checks.

## Progress Log

- 2026-04-22: Confirmed current branch is `main` and the tracked worktree was
  clean before creating this plan.
- 2026-04-22: Ran the project update check; it returned offline with local
  version `1.3.0`.
- 2026-04-22: Confirmed onboarding files exist.
- 2026-04-22: Fetched upstream; `upstream/main` advanced from `10c496c` to
  `b8a3a12`.
- 2026-04-22: Inspected incoming commits and saw 13 upstream commits with broad
  documentation, integration, CI, and code-removal changes.
- 2026-04-22: `git merge upstream/main` reported conflicts in `.gitignore`,
  `README.md`, and `package.json`.
- 2026-04-22: Resolved conflicts by preserving the local fork workflow while
  adding upstream's Gemini evaluator script and concise README references to the
  new Gemini and LaTeX entry points.
- 2026-04-22: Verified no conflict markers remained in the resolved files.
- 2026-04-22: `git diff --cached --check` passed.
- 2026-04-22: `npm run verify` passed with 0 errors and 2 existing duplicate
  warnings in `data/applications.md`.

## Key Decisions

- Create a fresh plan for this merge because the previous upstream merge plan
  documents an older branch and older upstream range.
- Continue with the upstream merge despite large deletions because the user
  explicitly requested merging the original repository's latest `upstream/main`.
- Resolve `README.md` as a local fork map, not the upstream marketing README,
  because top-level files in this workspace are intended to stay concise.
- Preserve local browser-extension and bridge package scripts while adding
  upstream's `gemini:eval` script.

## Risks and Blockers

- `npm run verify` reports two duplicate-warning groups in
  `data/applications.md`; they are warnings, not merge blockers.

## Final Outcome

Merged upstream changes through `upstream/main` commit `b8a3a12` into local
`main`. Conflicts were resolved in `.gitignore`, `README.md`, and
`package.json`. Verification passed with `git diff --cached --check` and
`npm run verify`.
