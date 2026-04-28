# Origin and Ownership

`auto-job` is a personal, single-owner project. The repository is the system
of record for behavior; this document records the ownership and update
policy.

## Ownership

- One maintainer: Hongxi Chen.
- The repository is authoritative. If knowledge is not committed here, it
  does not exist for the system.
- User-specific data (`cv.md`, `config/profile.yml`, `modes/_profile.md`,
  `data/*`, `reports/*`, `output/*`, `interview-prep/*`) lives in gitignored
  files and is not part of the shared runtime contract.

## Update policy

Updates happen through ordinary reviewed repository edits. There is no
system updater, no fetch from a "parent" repository, no auto-applied file
sync. The runtime is not a downstream product of any other project.

## Layered structure

Two layers are kept distinct (see `DATA_CONTRACT.md` for the full table):

- **Owned-runtime layer** — `apps/*`, `packages/*`, modes, templates, root
  CLI scripts, `.claude/skills/career-ops/SKILL.md`, docs. This is the layer
  that this document governs.
- **User-data layer** — gitignored files the user owns and the runtime never
  overwrites.

## Verification

`scripts/verify-repo-guard.mjs` (wired into `bun run verify`) fails the
build if a removed compatibility surface, deleted legacy mode, or external
update mechanism reappears. The matching test
(`apps/server/src/adapters/command-surface-contract.test.ts`) asserts the
positive shape: only the owned surfaces exist.
