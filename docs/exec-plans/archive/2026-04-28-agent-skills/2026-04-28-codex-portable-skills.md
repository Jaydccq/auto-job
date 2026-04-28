# Codex Portable Repository Skills

**Status:** completed

## Background

The repository had Claude Code skills under `.claude/skills/`, while current
operation also needs a Codex-friendly, runtime-neutral skill location in the
repository. Existing docs treated `.claude/skills/auto-job/SKILL.md` as the
only skill command surface, which would make a direct Codex copy drift.

## Goal

Create repository-local skills that Codex and Claude-compatible agents can use
without treating `.claude/` as the canonical source.

## Scope

In scope:

- Add canonical skills under `skills/`.
- Preserve `.claude/skills/` as a mirror for Claude Code compatibility.
- Add a mechanical sync check so the two copies cannot silently diverge.
- Update active navigation docs to point at the repository skill source.

Out of scope:

- Removing `.claude/skills/`.
- Changing job-evaluation, scan, dashboard, or autofill behavior.
- Rewriting archived historical plans that mention old paths.

## Assumptions

- `skills/` is the safest repository-local, agent-agnostic source path.
- `.claude/skills/` should remain because Claude Code still discovers that
  path today.
- Mirror files can be byte-for-byte identical if they refer to the canonical
  `skills/` path for helper scripts.

## Implementation Steps

1. Add `skills/auto-job` and `skills/exec-plan-consolidator`.
   Verify: required `SKILL.md` files and bundled resources exist.
2. Sync `.claude/skills` to the same content.
   Verify: byte-for-byte comparison passes.
3. Add `scripts/verify-skills-sync.mjs` and `bun run verify:skills`.
   Verify: targeted sync command passes.
4. Wire skill sync into `bun run verify`.
   Verify: full verification includes the new check.
5. Update active docs to describe `skills/` as canonical.
   Verify: `rg` no longer shows live docs treating `.claude/skills` as the
   only skill source.

## Verification Approach

- `bun run verify:skills`
- `python3 skills/exec-plan-consolidator/scripts/plan_inventory.py --json`
- `bun run verify:repo-guard`
- `bun run verify`
- `git diff --check`

## Progress Log

- 2026-04-28: Inspected `.claude/skills`, command-surface docs, repo guard,
  and execution-plan layout.
- 2026-04-28: Added repository-local skills under `skills/` and mirrored them
  into `.claude/skills/`.
- 2026-04-28: Added `verify:skills` and wired it into `bun run verify`.
- 2026-04-28: Updated README, data contract, command-surface docs, origin
  ownership docs, and exec-plan navigation to point at the generic skill path.
- 2026-04-28: Verified with `bun run verify:skills`, the generic
  `plan_inventory.py --json` path, `bun run verify:repo-guard`,
  `git diff --check`, targeted live-doc search for old Claude-only wording,
  and `bun run verify`.

## Key Decisions

- `skills/` is canonical because it is not tied to a specific assistant
  runtime.
- `.claude/skills/` remains as a runtime mirror rather than a second source of
  truth.
- Sync is enforced mechanically instead of documented only in prose.

## Risks and Blockers

- Codex local skill discovery may still require explicit user/model loading
  depending on the runtime. The repository now has a durable generic source
  either way.
- Historical archive docs still mention `.claude/skills`; those were left
  unchanged to avoid rewriting audit history.

## Final Outcome

Completed. The repository now has canonical portable skills under `skills/`,
Claude Code mirrors under `.claude/skills/`, and a verification command that
prevents mirror drift. `bun run verify` passed with 0 errors and 1 existing
duplicate tracker warning for Anduril rows.
