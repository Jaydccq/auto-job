# Scan Bun Runner Migration

## Background

The scan commands currently expose user-facing npm examples, and several scanner package scripts invoke bridge-local TypeScript runners through `npm --prefix bridge exec -- tsx`.

## Goal

Make scan workflows use Bun command forms instead of npm command forms for future execution and documentation.

## Scope

- Update scanner package scripts that currently shell through npm.
- Update scanner help text and mode documentation to show `bun run ...` for scan workflows.
- Keep unrelated npm workflows out of scope.
- Keep historical progress logs unchanged when they record commands that were actually run before this migration.

## Assumptions

- "Scan npm" means future scan entry points and operator-facing scan instructions.
- Bridge start instructions inside scan modes should also use `bun run ext:bridge` because they are part of scan execution.
- Bun will be installed in the operator environment before these commands are run.

## Implementation Steps

1. Replace scanner package-script npm bridge invocations with Bun equivalents.
   Verify: package scripts no longer contain `npm --prefix bridge exec -- tsx` for scan scripts.
2. Replace scan help text and active mode examples with `bun run`.
   Verify: search current scan docs/scripts for user-facing `npm run ...scan`.
3. Run targeted command validation if Bun exists locally.
   Verify: `bun run <scan> -- --help` for the scanner entry points, or record the blocker if Bun is unavailable.

## Verification Approach

- Static search for residual future-facing npm scan commands.
- Runtime `bun run` help checks when Bun is available.

## Progress Log

- 2026-04-23: User requested replacing all scan npm usage with Bun.
- 2026-04-23: Initial inspection found scanner package scripts, script usage text, and mode docs still use npm command forms.
- 2026-04-23: Local `bun --version` failed with `command not found`; runtime Bun verification is currently blocked by the environment.
- 2026-04-23: Updated scanner package scripts to call bridge-local TypeScript runners with `bun --cwd bridge run tsx`.
- 2026-04-23: Updated scanner help text, scan modes, `docs/SCRIPTS.md`, and scan design specs to show `bun run` command forms.
- 2026-04-23: Also migrated `newgrad-rerun-history` because it is part of the scanner history toolchain and used the same bridge-local TypeScript runner pattern.
- 2026-04-23: Verification passed: `package.json` parses, targeted `git diff --check` passed, and `rg` found no future-facing `npm run ...scan`, `npm run newgrad-rerun-history`, or `npm --prefix bridge exec -- tsx` references in package scripts, scanner scripts, modes, script docs, or scan specs.
- 2026-04-24: Runtime verification during a live `newgrad-scan` run found the
  package-script command form `bun --cwd bridge run tsx ...` is invalid with
  the installed Bun; it prints Bun help and exits 0 instead of executing the
  scanner. Updated scan package scripts to call the bridge-local
  `./bridge/node_modules/.bin/tsx` binary directly, which remains compatible
  with `bun run <scan-script>` and `npm run <scan-script>`.

## Key Decisions

- Preserve old execution-plan history where it records past commands, instead of rewriting prior verification logs as if they used Bun.
- Do not change non-scan npm scripts unless they are scan-mode prerequisites shown in scanner documentation.
- Keep user-facing scan commands as `bun run <scan-script>`, but do not rely on
  `bun --cwd bridge run tsx ...` internally because Bun treats `tsx` as a
  package script in this environment.

## Risks and Blockers

- Some old progress-log entries still describe the earlier unverified Bun
  bridge invocation; those are historical records, not current instructions.

## Final Outcome

Scan entry points and scanner-facing documentation use `bun run` command forms.
The package scripts execute the checked-in bridge-local `tsx` binary directly,
which avoids the invalid `bun --cwd bridge run tsx ...` assumption while
preserving the user-facing Bun workflow.
