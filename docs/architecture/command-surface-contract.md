# Command Surface Contract

## Owned surfaces

The auto-job runtime exposes exactly two command surfaces:

1. **`.claude/skills/career-ops/SKILL.md`** — the in-process Claude Code skill that routes user intent to a mode file under `modes/`.
2. **Root `package.json` scripts** — Bun-runnable entry points that drive the local Fastify server, the Chrome extension build, the Electron desktop app, scanners, and the verification gate.

Everything else is out of scope. The runtime no longer ships, advertises, or supports alternative command surfaces.

## Removed surfaces (do not reintroduce)

The following compatibility shims and legacy modes were removed during the fork-severance rewrite. The repo guard (`scripts/verify-repo-guard.mjs`) and the command-surface contract test (`apps/server/src/adapters/command-surface-contract.test.ts`) fail the build if any of them return:

| Removed | Reason |
|---------|--------|
| `.opencode/commands/*` | OpenCode is not the active runtime; every command duplicated `.claude/skills/career-ops/SKILL.md` and drifted on every change. |
| `.gemini/commands/*` and `GEMINI.md` | Same as above for Gemini CLI. |
| `modes/{apply,batch,deep,interview-prep,latex,ofertas,patterns,pdf,pipeline,project,tracker,training}.md` | Either replaced by direct skill behavior or unused; see `docs/architecture/origin-and-ownership.md`. |
| `gemini-eval.mjs`, `generate-latex.mjs`, `update-system.mjs` | Provider-specific or fork-update tooling that does not match the owned runtime. |
| `templates/cv-template.tex`, `templates/README.md` | Paired with the removed LaTeX path. |

## Surviving modes

Active modes live under `modes/` and are limited to behaviors the local server and extension actually invoke:

- `_shared.md` — shared scoring rubric and output contract.
- `_profile.md` — user-specific tuning (gitignored).
- `oferta.md` — single-job evaluation (the bridge `pipeline` adapter calls it).
- `auto-pipeline.md` — pipeline.md → evaluate → tracker flow.
- `scan.md`, `newgrad-scan.md`, `linkedin-scan.md`, `builtin-scan.md`, `indeed-scan.md`, `gmail-scan.md` — scan adapters.
- `contacto.md` — LinkedIn outreach helper.

Adding a new mode requires:

1. A skill route in `.claude/skills/career-ops/SKILL.md`.
2. A consumer in `apps/server/src/` (or a documented manual flow).
3. An entry in this contract.

If a mode does not satisfy all three, it does not belong in `modes/`.

## Safety boundary

No command surface may submit an application, click Apply, click Next, or click final Submit on behalf of the user. The runtime assists with drafting, evaluation, autofill, and document generation only.

## Verification

```bash
bun run --cwd apps/server vitest run src/adapters/command-surface-contract.test.ts
bun run verify:repo-guard
```
