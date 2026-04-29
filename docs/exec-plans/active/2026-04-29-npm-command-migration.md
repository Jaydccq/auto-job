# npm Command Migration

## Background

The repository previously documented and ran package scripts through old package runner in
README files, mode guides, helper scripts, and workspace package scripts. The
user requested replacing all old package runner usage with npm.

## Goal

Make npm the project command runner everywhere current development surfaces
refer to package commands.

## Scope

- Replace current old package runner command examples with npm equivalents.
- Replace executable old package runner spawns in verification, bridge startup, hourly scans,
  launch agents, and desktop workspace scripts.
- Keep unrelated user data, reports, and generated runtime data untouched.

## Assumptions

- `npm run <script> -- <args>` is the root command equivalent for scanner and
  root scripts.
- `npm --prefix <path> run <script>` is the workspace-local equivalent for
  package scripts under `apps/*` and `packages/*`.
- Historical progress logs may be updated when they are still active execution
  surfaces, but runtime behavior is the priority.

## Implementation Steps

1. Inventory old package runner references.
   Verify: `rg -n "<old-runner-pattern>"` over source/docs excluding dependency trees.
2. Update executable scripts and package scripts.
   Verify: `npm run server -- --dry-run`, targeted npm script checks.
3. Update docs, modes, UI copy, and skill mirrors.
   Verify: no remaining current old package runner references outside archived historical
   records or dependency folders.
4. Run targeted validation.
   Verify: `npm run verify:repo-guard`, `npm run verify:skills`, and selected
   workspace npm commands.

## Verification Approach

Use grep-style structural checks plus npm script dry runs/typechecks. Full
runtime scans are out of scope because they can use browser sessions and live
services.

## Progress Log

- 2026-04-29: Started inventory. old package runner appeared in package scripts, bridge startup,
  verification, hourly automation, launch-agent setup, mode docs, UI recovery
  text, and active execution plans.
- 2026-04-29: Replaced executable old package runner spawns with npm in bridge startup,
  verification, hourly scan automation, package scripts, and workspace test
  helpers.
- 2026-04-29: Replaced user-facing command text in README files, mode docs, UI
  copy, skills, architecture docs, and execution-plan surfaces. Removed the
  ignored local `legacy JS runner lock` artifact.
- 2026-04-29: Synced the canonical `skills/` files to `.claude/skills` and
  `.agents/skills` for the npm command text.
- 2026-04-29: Verification results:
  - `rg -n "<old-runner-pattern>" ...` returned no matches outside ignored
    dependency/user-data/generated folders.
  - `find . -name legacy JS runner lock ...` returned no matches.
  - `npm run server -- --dry-run` passed and prints
    `npm --prefix apps/server run start`.
  - `npm run verify:repo-guard` passed.
  - `npm --prefix apps/server run typecheck` passed.
  - `npm --prefix apps/extension run build` and `npm run ext:build` passed.
  - `npm run newgrad-scan -- --help` passed and prints npm usage.
  - `git diff --check` passed.
  - `npm run verify:skills` is blocked by pre-existing mirror-only
    `.claude/skills/openspec-*` files.
  - `npm run verify` is blocked by the same skill mirror issue plus existing
    command-surface-contract failures for present `.gemini`, `.opencode`, and
    `AGENTS.md` surfaces.

## Key Decisions

- Use `npm --prefix` for subpackage commands. It is explicit and does not depend
  on npm workspace metadata being present at the root.

## Risks and Blockers

- Some old execution-plan logs record past commands. Rewriting those can make
  history less exact; prioritize current instructions and executable surfaces.
- Full `npm run verify` is not green because of pre-existing repo-surface
  guard failures unrelated to the npm migration. The npm command path itself is
  covered by targeted passing checks.

## Final Outcome

Implemented. Current project command surfaces now use npm instead of the former
package runner. Word-level searches for the former runner command/name return
no matches in the scoped source/docs surfaces, and the ignored local legacy
runner lock file was removed.
