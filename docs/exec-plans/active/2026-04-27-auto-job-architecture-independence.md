# Auto-Job Architecture Independence Plan

## Background

This repository started as a fork of `santifer/auto-job`, but the current
working product is Hongxi's local job-search operating system. The retained
workflow is now centered on:

- job scanning from NewGrad/JobRight, LinkedIn, Built In, Indeed, and Gmail
- enrichment, dedupe, scoring, and evaluation through the local bridge
- Chrome extension capture and local application autofill helpers
- tracker/report/dashboard artifacts
- PDF/CV generation, negotiation material, and interview story-bank material

The repo still carries upstream-oriented identity and update surfaces:

- `package.json` still names the original author, homepage, and repository.
- `update-system.mjs` still fetches system files from
  `https://github.com/santifer/auto-job.git`.
- `CLAUDE.md` still opens with upstream origin and onboarding material.
- `DATA_CONTRACT.md` still frames `System Layer` files as safe upstream update
  targets.
- `.gemini/`, `.opencode/`, and some mode/docs references still advertise
  non-core command surfaces.
- `docs/exec-plans/active/` is noisy enough that architecture work should also
  include plan consolidation.

The existing code already contains several owned subsystems that should be
preserved rather than rewritten:

- `bridge/` Fastify local runtime, contracts, scan adapters, worker pool, and
  tests.
- `extension/` MV3 popup/background/content/panel/autofill code.
- `scripts/*scan*.ts|mjs` scanner orchestration.
- `web/` dashboard generation and server.
- `verify-pipeline.mjs` as the default repository health gate.
- `docs/superpowers/specs/*` as recent design context for scanner behavior.

## Goal

Turn this fork into an independently owned personal project while preserving
the core scan -> enrich -> evaluate -> track -> act workflow.

Success means:

- The repo's public/private identity points to Hongxi's project, not the
  upstream author's project.
- No default command fetches, merges, applies, or advertises upstream updates.
- Core behavior remains intact:
  - `npm run verify`
  - `npm run newgrad-scan`
  - `npm run linkedin-scan`
  - `npm run builtin-scan`
  - `npm run indeed-scan`
  - `npm run ext:build`
  - `npm run server`
  - `npm run dashboard:build`
- Scan/evaluate/dashboard/extension modules have explicit boundaries and tests.
- Old upstream surfaces are either removed, archived, or deliberately kept with
  a documented reason.
- Legal attribution is preserved where required by the original license.

## Scope

In scope:

- Reframe project ownership, docs, package metadata, update path, and command
  routing around the current personal workflow.
- Define a target architecture that separates product modules from legacy
  fork/update surfaces.
- Migrate toward owned module boundaries without a big-bang rewrite.
- Consolidate execution-plan noise created by repeated scan/evaluation work.
- Add mechanical checks so upstream references and stale command surfaces do not
  quietly return.
- Preserve all private user data and local artifacts.

Out of scope for this architecture migration:

- Submitting job applications automatically.
- Changing the scoring philosophy or profile targeting unless a test proves an
  existing behavior is broken.
- Rewriting the Chrome extension UI beyond what is needed for contract changes.
- Replacing `bb-browser` or scanner site adapters.
- Rewriting Git history to hide fork origin.
- Deleting private data under `data/`, `reports/`, `output/`, `jds/`,
  `cv.md`, `config/profile.yml`, `modes/_profile.md`, or
  `article-digest.md`.
- Removing license/attribution obligations from the original MIT project.

## Assumptions

- The desired end state is an independent repo that can still acknowledge fork
  origin legally, but no longer behaves as a downstream product.
- Codex/local bridge is the primary runtime; Gemini and OpenCode are optional
  compatibility surfaces, not core product boundaries.
- Browser-backed scans and extension workflows are more important than upstream
  update compatibility.
- The current dirty worktree contains separate bridge/extension work that must
  not be reverted or rewritten by this planning task.
- The safest implementation is incremental: establish tests and ownership
  checks first, then move boundaries one module at a time.

## Uncertainties

- Whether to keep `.gemini/` and `.opencode/` as secondary command frontends.
  Recommendation: remove them after Codex paths cover the same behavior, unless
  the user explicitly still uses them.
- Whether to keep `generate-latex.mjs`. Recommendation: keep until a later
  cleanup confirms PDF/LaTeX exports are not used.
- Whether to keep the `upstream` git remote. Recommendation: keep it temporarily
  as a read-only reference during migration, then remove only after no scripts or
  docs depend on it.
- Whether project renaming should remain `auto-job` or become a new product
  name. Recommendation: defer naming until the architecture boundary is stable;
  metadata can still move from upstream ownership to Hongxi ownership now.

## Current System Map

```text
User / Codex / Extension
        |
        v
+-------------------+       +-----------------------+
| root package.json | ----> | root scripts/*.mjs/ts |
+-------------------+       +-----------------------+
        |                              |
        |                              v
        |                    +-------------------+
        |                    | bb-browser sites  |
        |                    +-------------------+
        |                              |
        v                              v
+-------------------+       +-----------------------+
| extension/        | <-->  | bridge/ Fastify API   |
| popup/background  | token | /health /evaluate     |
| content/panel     |       | /scan /tracker/report |
+-------------------+       +-----------------------+
                                      |
                                      v
                         +--------------------------+
                         | adapters + batch prompt  |
                         | Codex/Claude/SDK runner  |
                         +--------------------------+
                                      |
                                      v
              +------------------------------------------------+
              | repo artifacts                                 |
              | reports/  batch/tracker-additions/  data/      |
              | jds/      output/                  web/index   |
              +------------------------------------------------+
```

Architectural smell: the bridge has become the real core, but root docs and the
update system still treat upstream files as the system source of truth.

## Target Architecture

Target shape should be modular but not framework-heavy:

```text
+--------------------------------------------------------------+
| apps                                                         |
|  - extension: Chrome MV3 UI and page capture/autofill only   |
|  - bridge: local authenticated HTTP runtime                  |
|  - dashboard: local web dashboard/server/static build        |
+-----------------------------+--------------------------------+
                              |
                              v
+--------------------------------------------------------------+
| core modules                                                  |
|  job-sources: list/detail adapters, normalization, dedupe      |
|  evaluation: prompt rendering, runner selection, report parse  |
|  tracker: applications.md, pipeline.md, states, merge/verify   |
|  documents: CV/PDF/cover-letter generation                    |
|  profile: config/profile.yml, modes/_profile.md readers       |
|  shared: contracts, canonical URL, security/clearance helpers  |
+-----------------------------+--------------------------------+
                              |
                              v
+--------------------------------------------------------------+
| artifacts                                                     |
|  data/ reports/ jds/ output/ batch/tracker-additions/         |
+--------------------------------------------------------------+
```

File-system migration should be staged. The first implementation pass can keep
the current `bridge/`, `extension/`, `scripts/`, and `web/` directories while
creating architecture docs and mechanical checks. Physical moves should happen
only after tests lock down the behavior.

## Module Boundary Matrix

| Boundary | Owns | Must not own | Current files | Target direction |
|----------|------|--------------|---------------|------------------|
| Scan sources | source fetch, list normalization, detail capture, source-specific failure reporting | scoring policy, tracker writes, prompt behavior | `scripts/*scan*.ts`, `extension/src/content/extract-*`, `bridge/src/adapters/*normalizer*` | keep scripts as CLIs; extract reusable lifecycle only after tests prove duplication |
| Scan policy | hard filters, sponsorship/clearance rules, value scoring, dedupe identity | browser navigation, report writing | `bridge/src/adapters/newgrad-*`, `bridge/src/lib/canonical-job-url.ts`, `scripts/evaluation-dedupe.ts` | make this the durable `job-sources` core |
| Evaluation runtime | queueing, runner selection, timeout handling, terminal JSON, report/tracker artifact production | DOM extraction, dashboard rendering | `bridge/src/server.ts`, `bridge/src/adapters/*pipeline.ts`, `bridge/src/runtime/*`, `batch/batch-prompt.md` | keep `PipelineAdapter`; add owned contract fixtures before prompt edits |
| Extension app | capture UI, bridge client, page-safe autofill, user-triggered actions | scoring, report parsing, direct tracker mutation | `extension/src/*`, `extension/test/*` | treat bridge contracts as the only wire boundary |
| Dashboard app | read repo artifacts, render action-first tracker and scan state | scan/evaluate side effects except explicit user-triggered server actions | `web/template.html`, `web/dashboard-server.mjs`, `web/build-dashboard.mjs` | keep generated `web/index.html` out of architecture decisions |
| Documents | CV/PDF/cover-letter rendering from source materials | scan policy, tracker status mutation | `generate-pdf.mjs`, `generate-latex.mjs`, `generate-cover-letter.mjs`, `templates/*` | retain until a separate product decision removes it |
| Repo governance | ownership docs, verification, plan hygiene, attribution | user data and generated job artifacts | `CLAUDE.md`, `AGENTS.md`, `DATA_CONTRACT.md`, `verify-pipeline.mjs`, `docs/exec-plans/*` | first migration target because it reduces fork risk without runtime churn |

Design rule: a module may depend downward in the target diagram, but not upward.
For example, `scripts/linkedin-scan-bb-browser.ts` may call scan policy and
bridge evaluation APIs, but `bridge/src/adapters/newgrad-scorer.ts` should not
know about LinkedIn browser operations.

## Phase Dependency Graph

```text
+------------------------------+
| Phase 1: ownership/guards    |
+--------------+---------------+
               |
               v
+------------------------------+
| Phase 2: plan consolidation  |
+--------------+---------------+
               |
               v
+------------------------------+
| Phase 3: scanner boundary    |
+--------------+---------------+
               |
               v
+------------------------------+
| Phase 4: evaluation contract |
+--------------+---------------+
               |
               v
+------------------------------+
| Phase 5: extension contract  |
+--------------+---------------+
               |
               v
+------------------------------+
| Phase 6: command prune       |
+--------------+---------------+
               |
               v
+------------------------------+
| Phase 7: optional file moves |
+------------------------------+
```

Phase 7 is intentionally last. Directory moves before contracts and tests would
spend migration effort on import churn instead of reducing fork coupling.

## What Already Exists

- Scanner orchestration exists in `scripts/newgrad-scan-autonomous.ts`,
  `scripts/linkedin-scan-bb-browser.ts`, and
  `scripts/job-board-scan-bb-browser.ts`.
  Reuse: yes; do not create a parallel scanner.
- Scanner contracts and reusable scoring/dedupe helpers exist under
  `bridge/src/contracts/*`, `bridge/src/adapters/*`, and `bridge/src/lib/*`.
  Reuse: yes; these are the current core.
- Evaluation runtime exists behind `PipelineAdapter` in
  `bridge/src/contracts/pipeline.ts` and real implementations under
  `bridge/src/adapters/*pipeline.ts`.
  Reuse: yes; split responsibilities later, but keep the adapter contract.
- Extension capture/autofill exists under `extension/src/*` and is documented in
  `docs/BROWSER_EXTENSION.md` and `extension/DESIGN.md`.
  Reuse: yes; extension should stay UI/client focused.
- Dashboard exists under `web/` and consumes repo artifacts.
  Reuse: yes; do not confuse it with the already-deleted Go TUI.
- Verification exists in `verify-pipeline.mjs`, bridge Vitest tests, bridge
  typecheck, extension typecheck, and extension build.
  Reuse: yes; expand this instead of adding a second health script.
- Plan hygiene rules exist in `docs/exec-plans/README.md`.
  Reuse: yes; consolidate old active plans before or during the migration.

## Step 0: Scope Challenge

1. Existing solutions:
   - The bridge already provides the main runtime boundary.
   - The scanner scripts already use normalized rows, scoring, enrichment, and
     direct evaluation.
   - The extension already delegates to the bridge rather than writing reports
     itself.
   - `verify-pipeline.mjs` already runs the main test/build checks.

2. Minimum viable independence:
   - Change ownership docs/metadata/update behavior.
   - Add an architecture map and upstream-reference guard.
   - Keep current runtime directories.
   - Do not physically move modules until checks prove behavior is stable.

3. Complexity check:
   - A one-PR full re-layout would touch far more than 8 files and likely more
     than 2 service boundaries. That is a smell.
   - Recommendation: split into 5 implementation PRs:
     1. identity/update/docs/checks
     2. plan consolidation
     3. scanner core boundary
     4. evaluation/tracker boundary
     5. optional command-surface prune and directory moves

4. Completeness check:
   - Shortcut to avoid: only editing README/package metadata. That leaves
     upstream update commands and routing as live footguns.
   - Complete but practical option: include mechanical upstream-reference checks
     and verification before deletion.

5. Distribution check:
   - No new distributable artifact is required for the first migration.
   - If later packaging the extension or bridge as release artifacts, add a
     separate release plan for Chrome extension packaging and bridge binary/npm scripts
     distribution.

Recommendation: proceed with phased ownership migration, not a rewrite.

## Architecture Review

### Issue 1: Upstream updater is now an architectural liability

`update-system.mjs` is designed to fetch and apply files from the upstream repo.
That was useful for a fork, but it contradicts the new source-of-truth rule.

Recommendation: replace default update behavior with a disabled/archive command.

Options:

- 1A. Remove update scripts and archive `update-system.mjs` docs.
  Completeness: 9/10. Human: about 0.5 day. Codex: about 30 minutes.
  Risk: low; clear independence.
- 1B. Keep `update-system.mjs` but make it no-op unless
  `AUTO_JOB_ALLOW_UPSTREAM_UPDATE=1`.
  Completeness: 7/10. Human: about 0.5 day. Codex: about 20 minutes.
  Risk: medium; upstream path remains in product.
- 1C. Leave updater unchanged.
  Completeness: 3/10. Risk: high; one command can re-import upstream state.

Chosen plan: 1A, with license/attribution retained separately.

### Issue 2: Core code is mixed with command/frontend compatibility surfaces

`.claude`, `.opencode`, `.gemini`, root scripts, bridge APIs, and extension code
all advertise workflow behavior. That creates drift when scan/evaluate changes.

Recommendation: make root `package.json` and `skills/auto-job/SKILL.md`
the primary command map, then keep runtime-specific skill mirrors mechanically
synced and remove or clearly mark secondary frontends.

Chosen plan:

- Keep Codex and package scripts as canonical.
- Defer `.gemini/` and `.opencode/` deletion until Codex routes are documented
  and verified.
- Add a doc check that command tables do not advertise removed modes.

### Issue 3: Scanner providers share behavior but not a clear interface

Current scanner scripts already reuse bridge adapters, but the entry scripts own
too much of the scan lifecycle: source fetch, normalization, scoring,
enrichment, bridge evaluation, wait/merge.

Recommendation: introduce a documented scanner lifecycle contract before moving
code.

Target lifecycle:

```text
Source Provider
  |
  | list rows
  v
Normalize + canonical identity
  |
  | NewGradRow[]
  v
Score + filter + blocker rules
  |
  | promoted rows
  v
Detail enrichment + JD cache
  |
  | EvaluationInput[]
  v
Bridge /v1/evaluate queue
  |
  | report + tracker TSV
  v
Merge + dashboard artifacts
```

Chosen plan: first document and test the lifecycle around existing files; only
then extract common orchestration.

### Issue 4: Evaluation still carries upstream prompt/mode shape

The bridge real path reuses `batch/batch-prompt.md` and modes originally shaped
for the fork. This is acceptable as an implementation detail only if ownership
and tests are explicit.

Recommendation: create an owned evaluation contract:

- input schema
- prompt template ownership
- report schema
- tracker-addition schema
- runner selection
- timeout/concurrency behavior

Chosen plan: keep `PipelineAdapter`, split prompt/report parsing into owned
evaluation helpers, and add fixture tests before changing prompts.

## Code Quality Review

### Issue 5: Root-level scripts are becoming orchestration modules

Root scripts make daily commands easy, but long `.mjs/.ts` scripts are not a
good long-term module boundary.

Recommendation: keep the scripts as CLI wrappers and move reusable logic behind
tested modules in `bridge/src` first. A later physical package split can move
the modules without behavior changes.

Chosen plan:

- No immediate `apps/`/`packages/` directory move.
- Add `docs/architecture/target-architecture.md` first.
- For each scanner touched later, extract only duplicated lifecycle code.

### Issue 6: Plan sprawl is now active architecture debt

`docs/exec-plans/active/` contains many completed job-evaluation and scan plans.
This makes active architecture context harder to find.

Recommendation: consolidate completed job-evaluation and scan-operation plans
into summary files before heavy refactors.

Chosen plan:

- Create/update summaries under `docs/exec-plans/summaries/`.
- Move old completed detail to `docs/exec-plans/archive/` or replace with short
  pointers if repository conventions allow.
- Keep this architecture plan active until implementation completes.

### Issue 7: Attribution and ownership need separate documents

Independence does not mean pretending the original source never existed. The
repo should separate legal attribution from active product ownership.

Recommendation:

- Keep license attribution required by upstream license.
- Move fork-origin history into a concise `docs/architecture/origin-and-ownership.md`.
- Remove upstream marketing copy from top-level operational docs.

### Issue 8: Generated artifacts can hide stale upstream references

`web/index.html` is generated and can contain historical report text. A naive
`rg santifer` guard would fail because generated reports or archived plans quote
old evidence, not because the active product still depends on upstream.

Recommendation: make the upstream-reference guard explicit and allowlisted:

- block live code/docs/config references in root docs, package metadata, scripts,
  active modes, `.claude`, `.gemini`, `.opencode`, `bridge`, `extension`, and
  `web/template.html`
- allow legal attribution, archived plans, summaries, generated `web/index.html`,
  and historical report content
- require a comment in the allowlist explaining why each exception exists

Chosen plan: add the guard in Phase 1 with a small allowlist file so future
exceptions are reviewed rather than accidental.

## Phase Gate Matrix

| Phase | Exit criteria | Required verification | Stop condition |
|-------|---------------|-----------------------|----------------|
| 1. Ownership/guards | live upstream updater removed or disabled, metadata owned by Hongxi, attribution preserved | `node --check` for changed scripts, upstream guard, `npm run verify` if guard is wired into verify | any default command can still fetch from `santifer/auto-job` |
| 2. Plan consolidation | active plans reduced to current workstreams, summaries preserve decisions and verification | plan inventory before/after, spot-check summaries, `git diff --check` | uncertain whether a completed plan contains unresolved work |
| 3. Scanner boundary | lifecycle doc exists, provider fixtures cover NewGrad/JobRight/LinkedIn/Built In/Indeed identities | focused bridge adapter tests, score-only smoke for touched scanner when feasible | extraction changes alter default evaluate behavior without tests |
| 4. Evaluation contract | input/report/tracker schemas documented and fixture-tested | bridge tests, malformed-output fixtures, fake bridge evaluation smoke | prompt/template edits happen before parser fixtures exist |
| 5. Extension contract | bridge wire schema drift caught by type/test checks, autofill safety still enforced | extension typecheck/build/tests, bridge typecheck/tests | any path can submit/click next/apply/upload without explicit user action |
| 6. Command prune | retained/removed frontends documented, routing tables consistent | command table grep, `npm run` review, mode file checks | deleting `.gemini`/`.opencode` before confirming the user does not need them |
| 7. Physical moves | only if imports remain painful after earlier phases | full `npm run verify`, extension build, dashboard build, targeted scanner checks | diff becomes mostly import churn with no boundary improvement |

## First Implementation PR: Minimal Diff

The first PR should be small and reversible. It should not move runtime files or
change scanner/evaluator behavior.

1. Add architecture docs:
   - `docs/architecture/current-system-map.md`
   - `docs/architecture/target-architecture.md`
   - `docs/architecture/origin-and-ownership.md`
   Verify: docs include retained commands, attribution boundary, and the module
   dependency diagram.
2. Replace active upstream update instructions:
   - remove the session-start update check from `CLAUDE.md`
   - change `DATA_CONTRACT.md` from "System Layer can be replaced from upstream"
     to "Owned Runtime Layer is changed only by this repo"
   - remove `update`, `update:check`, and `rollback` from default `package.json`
     scripts or replace them with an archive/error command
   Verify: `npm run` no longer advertises upstream update as a normal workflow.
3. Preserve attribution:
   - keep `LICENSE`
   - document original fork/source in `docs/architecture/origin-and-ownership.md`
   - avoid upstream marketing copy in top-level operational docs
   Verify: `rg -n "santifer|cv-santiago|upstream|update-system"` only returns
   allowlisted attribution/archive/generated contexts.
4. Add a guard:
   - `scripts/check-owned-references.mjs` or equivalent
   - optional `config/owned-reference-allowlist.yml` if a plain inline allowlist
     would be too opaque
   - wire it into `verify-pipeline.mjs`
   Verify: adding a fake live `santifer/auto-job` reference to a checked
   runtime/doc path fails locally, then removing it passes.
5. Update this plan's progress log and final outcome.
   Verify: `git diff --check`.

Explicitly do not touch `bridge/src/*`, `extension/src/*`, scanner scripts, or
generated artifacts in the first PR unless a verification guard requires a tiny
change.

## Test Review

Detected test framework:

- Node root scripts.
- Bridge: Vitest + TypeScript (`bridge/vitest.config.ts`,
  `npm --prefix apps/server run test`, `npm --prefix apps/server run typecheck`).
- Extension: TypeScript + esbuild build (`npm --prefix apps/extension run typecheck`,
  `npm run ext:build`).
- No Playwright test config, but Playwright is used by scan/PDF scripts.

### Coverage Diagram For This Migration

```text
CODE PATH COVERAGE
==================
[+] Ownership/update docs
    |
    +-- [GAP] package metadata points to Hongxi repo
    +-- [GAP] update scripts cannot fetch upstream by default
    +-- [GAP] docs no longer tell agents to run upstream update checks
    +-- [GAP] license attribution still present

[+] Command routing
    |
    +-- [GAP] package scripts for retained workflow still exist
    +-- [GAP] auto-job skill routes retained scan/eval/pdf/dashboard modes
    +-- [GAP] removed/deferred frontends are not advertised as active

[+] Scanner lifecycle
    |
    +-- [★★ TESTED] many adapter helpers already have unit tests
    +-- [GAP] shared lifecycle contract test for list -> score -> enrich -> eval
    +-- [GAP] source-provider parity tests for NewGrad/LinkedIn/Built In/Indeed
    +-- [GAP] failure path when bridge is unavailable

[+] Evaluation runtime
    |
    +-- [★★ TESTED] bridge server and adapters have existing tests
    +-- [GAP] prompt/report/tracker schema fixture tests before prompt ownership changes
    +-- [GAP] Codex runner timeout and terminal JSON failure fixture
    +-- [GAP] no-upstream prompt reference guard

[+] Extension and bridge contract
    |
    +-- [★★ TESTED] extension typecheck/build and bridge typecheck
    +-- [GAP] wire-contract compatibility test after contract moves
    +-- [GAP] autofill never-submit safety regression test stays required

[+] Plan hygiene
    |
    +-- [GAP] active plan count decreases after consolidation
    +-- [GAP] archived plans preserve decisions and verification summaries
```

```text
USER FLOW COVERAGE
==================
[+] Daily scan flow
    |
    +-- [GAP] npm run newgrad-scan -- --score-only smoke
    +-- [GAP] npm run linkedin-scan -- --score-only bounded smoke
    +-- [GAP] npm run builtin-scan -- --score-only bounded smoke
    +-- [GAP] npm run indeed-scan -- --score-only bounded smoke

[+] Evaluate from extension
    |
    +-- [GAP] npm run ext:build
    +-- [GAP] bridge /v1/health works in fake mode
    +-- [GAP] fake evaluation returns expected report/tracker shape

[+] Dashboard review flow
    |
    +-- [GAP] npm run dashboard:build
    +-- [GAP] generated web/index.html still includes priority/action surfaces

[+] Document generation
    |
    +-- [GAP] npm run pdf or equivalent targeted PDF smoke when touched
    +-- [GAP] LaTeX retained/removed decision verified by command table
```

Coverage target for implementation:

- Code paths: 100% of changed modules must have unit/fixture tests.
- User flows: every retained daily command gets at least a smoke check.
- E2E: extension/bridge fake-mode smoke is required before deleting upstream
  update/compatibility surfaces.
- Eval: prompt changes require fixture-based report/tracker schema tests.

## Performance Review

Expected performance risks:

- Moving scanner lifecycle code can accidentally serialize detail enrichment or
  evaluation queueing.
- Rebuilding dashboard checks may become slow if every migration step runs live
  scans.
- Plan consolidation can be filesystem-heavy but should not affect runtime.

Recommendations:

- Preserve existing concurrency defaults:
  - scan detail enrichment chunking
  - evaluation queue delay
  - bridge evaluation concurrency
- Use `--score-only`, fake bridge mode, and fixture tests for most migration
  checks.
- Reserve real scans/evaluations for phase acceptance, not every small edit.

## Rollout And Branching Strategy

- Work on a branch such as `codex/architecture-independence-phase-1` rather than
  directly on `main`.
- Before implementation, either commit/stash unrelated bridge/extension work or
  keep phase-1 edits isolated to docs/root verification files.
- Land phases in order. If a later phase finds a missing invariant, add the
  invariant to `verify-pipeline.mjs` or a focused test before moving more files.
- Keep `upstream` remote temporarily as historical reference only. Remove it
  after Phase 1-2 if no active command or doc uses it.
- Do not squash away useful phase boundaries; each phase should be reviewable
  independently.

## Implementation Steps

### Phase 1: Ownership and upstream-severing guardrails

1. Create `docs/architecture/current-system-map.md` and
   `docs/architecture/target-architecture.md`.
   Verify: docs include the diagrams from this plan and list retained commands.
2. Update top-level metadata:
   - `package.json` author/homepage/repository/description
   - `README.md` ownership copy
   - `CLAUDE.md` opening instructions
   - `AGENTS.md` if needed
   Verify: `rg -n "santifer|upstream|cv-santiago|update-system"` only shows
   attribution/archive references.
3. Disable or archive upstream updater:
   - remove `update`, `update:check`, and `rollback` daily scripts, or replace
     with a local explanatory command
   - update `CLAUDE.md` so agents do not run upstream checks on session start
   Verify: `npm run` no longer advertises upstream update commands.
4. Add a mechanical guard:
   - a small Node script or verify step that fails on forbidden live upstream
     references outside allowlisted attribution/archive files
   Verify: `npm run verify` includes or calls the guard.

### Phase 2: Execution-plan consolidation

1. Inventory active plans by workstream:
   - job evaluations
   - scan implementation/debug
   - extension/bridge
   - dashboard/tracker
   - document generation
   Verify: produce counts before moving files.
2. Create canonical summaries under `docs/exec-plans/summaries/`.
   Verify: each summary preserves decisions, verification, and open issues.
3. Archive completed active plans.
   Verify: `docs/exec-plans/active/` contains only current work.
4. Update `docs/exec-plans/README.md` current-state section.
   Verify: navigation is concise and accurate.

### Phase 3: Scanner lifecycle boundary

1. Document scanner lifecycle and current provider mapping.
   Verify: NewGrad/JobRight, LinkedIn, Built In, and Indeed all map to the same
   lifecycle stages.
2. Add fixture tests for normalized candidate identity:
   - canonical URL
   - normalized company/role
   - duplicate report-derived identities
   Verify: bridge adapter tests pass.
3. Extract only repeated orchestration code when duplication is proven.
   Verify: root scanner commands still call the same paths.
4. Add bridge-unavailable and no-evaluate tests around scanner queueing.
   Verify: scanner exits with clear operator message and no partial corruption.

### Phase 4: Owned evaluation/report/tracker contract

1. Write `docs/architecture/evaluation-contract.md`:
   - input
   - prompt template
   - terminal JSON
   - report header
   - tracker TSV
   - merge behavior
   Verify: doc references actual current files.
2. Add fixture tests for report parsing and tracker TSV parsing before prompt
   changes.
   Verify: tests fail on malformed report/tracker output.
3. Move upstream-shaped prompt assumptions into owned docs/templates.
   Verify: no behavior change in fixture output.
4. Keep Codex bridge defaults repo-local.
   Verify: bridge config tests cover model and reasoning effort defaults.

### Phase 5: Extension/bridge contract hardening

1. Treat bridge contracts as the single wire source.
   Verify: extension imports or mirrors generated/checked types without drift.
2. Add contract compatibility checks for extension messages and bridge wire
   responses.
   Verify: typecheck/build/test catch schema drift.
3. Preserve application safety rules:
   - no submit
   - no next/continue/apply clicks
   - autofill only after user click
   Verify: targeted tests around `extension/src/shared/autofill-*`.

### Phase 6: Command surface prune

1. Decide whether `.gemini/` and `.opencode/` stay.
   Recommendation: remove if Codex is the only active frontend.
   Verify: README/CLAUDE/package scripts no longer advertise removed surfaces.
2. Decide whether LaTeX export stays.
   Recommendation: keep until PDF workflow is fully stable and user confirms it
   is unused.
   Verify: retained scripts work or removed scripts have no docs references.
3. Decide whether old career modes stay:
   - `contacto`
   - `deep`
   - `ofertas`
   - `training`
   - `project`
   - `patterns`
   - `followup`
   Recommendation: remove only if no current workflow uses them.
   Verify: routing tables and mode files remain consistent.

### Phase 7: Optional physical re-layout

Only after Phases 1-6 pass:

1. Move bridge to `apps/bridge` or keep as-is if the move creates more churn
   than clarity.
2. Move extension to `apps/extension` or keep as-is.
3. Extract shared scanner/evaluation/tracker modules if duplication remains.
4. Update package workspaces only if the current nested package setup becomes a
   real maintenance problem.

Default recommendation: defer physical moves. Architecture independence comes
from ownership, contracts, docs, and tests first.

## Decision Log For Open Questions

| Question | Default recommendation | Why | When to revisit |
|----------|------------------------|-----|-----------------|
| Keep `.gemini/` and `.opencode/`? | Defer deletion until Phase 6 | They are command surfaces, not runtime blockers; removing early may break fallback workflows | after Codex/npm routes are complete and verified |
| Keep LaTeX export? | Keep for now | It is adjacent document functionality and not a fork-coupling source by itself | after PDF/document workflow is audited |
| Rename project? | Defer product naming | Independence does not require a new name; premature rename creates broad docs/scripts churn | after Phase 1 proves owned metadata and update behavior |
| Remove `upstream` remote? | Keep temporarily, remove later | Useful for provenance checks during migration, dangerous only if commands use it | after guard proves no active upstream update path remains |
| Move to `apps/` / `packages/`? | Defer | Current folders already map to apps; moving now is mostly import churn | after contracts expose real shared-module pressure |
| Keep compatibility command surfaces? | Keep `.gemini/`, `.opencode/`, old modes, and LaTeX for now | The user asked not to delete too early; the surfaces are compatibility shims and optional document paths | revisit only after command usage is measured or user confirms removal |
| Move bridge/extension directories now? | Do not move | `apps/server`, `apps/extension`, `apps/desktop`, and `packages/shared` already provide enough workspace separation; moving now is import churn | revisit when a real packaging or shared-module pressure exists |

## Verification Approach

Run after each phase when touched files justify it:

```bash
git diff --check
npm run verify
npm --prefix apps/server run test
npm --prefix apps/server run typecheck
npm --prefix apps/extension run typecheck
npm run ext:build
npm run dashboard:build
```

Targeted scan checks when scanner code changes:

```bash
npm run newgrad-scan -- --score-only --limit 20
npm run linkedin-scan -- --score-only --limit 10
npm run builtin-scan -- --score-only --limit 10 --pages 1
npm run indeed-scan -- --score-only --limit 10 --pages 1
```

Targeted bridge checks when evaluation code changes:

```bash
AUTO_JOB_BACKEND=fake npm run server
curl -s -H "x-auto-job-token: $(cat bridge/.bridge-token)" \
  http://127.0.0.1:47319/v1/health
```

The fake bridge can validate route shape. Real evaluations should be reserved
for final phase acceptance or when prompt/report behavior changes.

## Failure Modes

| Flow | Realistic failure | Test exists? | Handling exists? | User-visible? | Gap |
|------|-------------------|--------------|------------------|---------------|-----|
| Upstream severing | `npm run update` still fetches upstream | No | Yes, currently live updater | Yes, if run | Critical until disabled |
| Scanner refactor | provider emits duplicate or unstable URL | Partial | Dedupe helpers exist | Maybe silent | Add identity fixture tests |
| Scanner bridge queue | bridge unavailable during evaluate | Partial | script errors exist | Should be visible | Add clear no-partial-write test |
| Evaluation prompt ownership | prompt output no longer parses | Partial | adapter returns bridge error | Visible in bridge | Add report/tracker fixture tests |
| Extension contract | extension sends stale payload | Typecheck only | bridge validation rejects | Visible error | Add compatibility fixture |
| Dashboard build | dashboard expects removed field | No | JS may fail at runtime | Possibly blank UI | Add build/smoke check |
| Plan consolidation | archived plan loses decision | No | manual review only | Future context loss | Summary checklist required |

Critical gaps:

- Upstream updater must be disabled before claiming independence.
- Prompt/report fixture tests must exist before changing evaluation templates.
- Active plan consolidation must preserve decisions before archive moves.

## Key Decisions

- Use strangler-style migration, not a big-bang rewrite.
- Treat `bridge/` as the current core runtime until a later move is proven worth
  the churn.
- Preserve scan/evaluate/extension/dashboard/PDF behavior ahead of repo cleanup.
- Separate legal attribution from product ownership.
- Make upstream-reference prevention mechanical, not only prose.
- Use existing `npm run verify` as the main health gate and extend it where
  needed.

## Risks And Blockers

- Dirty worktree: existing bridge/extension changes must be preserved. Any
  implementation should branch or commit intentionally before large edits.
- Live scan checks depend on browser/site state and may be flaky. Use fixtures
  and score-only checks for most verification.
- Removing Gemini/OpenCode too early may break a fallback user workflow.
- Removing upstream update surfaces without preserving attribution could create
  licensing or provenance confusion.
- Physical directory moves can create massive diffs with little product value.

## NOT In Scope

- Git history rewrite to remove fork ancestry: high risk, low product value.
- Replacing `bb-browser`: current scanner investment depends on it.
- New cloud backend or hosted service: local-first workflow is the product.
- Chrome Web Store packaging: useful later, not needed for architecture
  independence.
- Re-scoring all historical reports: this is product logic, not ownership
  migration.
- Automated application submission: explicitly prohibited by repo rules.

## Proposed TODOs

Add to `docs/exec-plans/tech-debt-tracker.md` during implementation if not
handled in this plan:

1. Upstream-reference guard
   - What: fail verification on live upstream update/reference strings outside
     attribution/archive allowlists.
   - Why: prevents accidental re-coupling.
   - Depends on: Phase 1 allowlist.
2. Scanner lifecycle fixture suite
   - What: fixtures for NewGrad/LinkedIn/Built In/Indeed normalization and
     queue behavior.
   - Why: enables later extraction without silent behavior drift.
   - Depends on: Phase 3 lifecycle doc.
3. Evaluation contract fixtures
   - What: report/tracker/terminal JSON fixture tests.
   - Why: prompt ownership changes need parser safety.
   - Depends on: Phase 4 contract doc.
4. Plan consolidation tracker
   - What: active-plan inventory and workstream summaries.
   - Why: active plans are currently too noisy for architecture work.
   - Depends on: Phase 2 inventory.

## Progress Log

- 2026-04-27: Created architecture independence plan after reviewing current
  repo docs, package scripts, bridge/extension docs, scanner entry points,
  existing prune audit, git remotes, and recent commit history.
- 2026-04-27: Confirmed current branch is `main`; worktree has unrelated
  bridge/extension modifications and this plan does not touch them.
- 2026-04-27: Confirmed `origin` points to `Jaydccq/auto-job` while
  `upstream` still points to `santifer/auto-job`.
- 2026-04-27: Confirmed no gstack design doc exists for this branch; proceeding
  with a repository-grounded standard architecture plan.
- 2026-04-27: Expanded the plan with module boundaries, phase dependency graph,
  phase gates, a minimal first PR, rollout strategy, and decision log after
  reading current scanner specs, bridge/extension package scripts, updater code,
  verification code, and recent git history.
- 2026-04-27: Completed Phase 2 consolidation for the noisy scan/evaluation/debug
  plan surface: archived 107 plans into dated job-evaluation, scan-operation,
  and extension-bridge-debugging archive directories; added three canonical
  summaries under `docs/exec-plans/summaries/`; updated the exec-plan README.
- 2026-04-27: Completed the Phase 3 scanner boundary definition by adding
  `docs/architecture/scanner-lifecycle.md` and scanner identity fixture tests
  covering canonical URLs, normalized company/role keys, and report-derived
  duplicate identities.
- 2026-04-27: Completed the Phase 4 evaluation/report/tracker contract by adding
  `docs/architecture/evaluation-contract.md` plus parser fixtures for terminal
  JSON, report headers, tracker rows, merge summaries, and malformed artifacts.
- 2026-04-27: Completed the Phase 5 extension/bridge contract by adding
  `docs/architecture/extension-bridge-contract.md`, a bridge-wire re-export
  compatibility test, and stricter autofill tests that reject submit, next,
  continue, and apply action controls.
- 2026-04-27: Verified Phase 2-5 with targeted server contract tests,
  extension contract/autofill tests, server typecheck, extension typecheck,
  extension build, `git diff --check`, and exec-plan inventory. Active plan
  count is now 22, down from 129 before consolidation.
- 2026-04-28: Hardened Phase 5 by expanding the shared bridge `ENDPOINTS`
  registry to cover every HTTP path used by the extension bridge client and by
  changing the extension to derive those paths from `@auto-job/shared`.
- 2026-04-28: Completed Phase 6 as a keep-and-constrain decision: retained
  `.gemini/`, `.opencode/`, legacy modes, and LaTeX export as compatibility or
  optional surfaces; added `docs/architecture/command-surface-contract.md` and
  a command-surface fixture test.
- 2026-04-28: Completed Phase 7 as an explicit deferral: no directory moves in
  this phase; added `docs/architecture/physical-layout-decision.md` and locked
  the current workspace layout in the command-surface fixture test.
- 2026-04-28: Verified Phase 5-7 with shared/server/extension typechecks,
  extension build, extension bridge/autofill tests, and targeted server contract
  tests for command surface, scanner lifecycle, and evaluation artifacts.
- 2026-04-28: Full server Vitest also ran; two unrelated tests hit the default
  5s timeout under the full parallel suite, then both passed when rerun directly
  in `src/server.test.ts` and `src/routes/dashboard.test.ts`.
- 2026-04-28: Started Phase 1 ownership unlinking by changing the main Git
  remote from `Jaydccq/auto-job` to `Jaydccq/jobseeker`, removing the
  `santifer/auto-job` upstream remote, pushing `main` to the new origin, and
  updating root `package.json` repository metadata. The nested `bb-browser`
  fork remotes were intentionally left unchanged.
- 2026-04-28: Audited current completion state. Phase 2-7 evidence is present
  and targeted checks still pass, but full migration is not done because Phase 1
  still has live upstream update scripts/docs, missing ownership architecture
  docs, no upstream-reference guard wired into `npm run verify`, and stale
  legacy bridge-launcher guidance after the runtime entrypoint moved to
  `npm run server`.
  Verification run: `npm run verify` passed with 0 errors and 1 existing
  duplicate warning; the extension Vitest suite passed 66 tests; dashboard build
  passed and the generated `web/index.html` output was restored afterward.
- 2026-04-28: Fixed the audit findings by disabling the legacy updater entry
  points, replacing stale bridge launcher guidance with `npm run server`,
  adding `scripts/verify-repo-guard.mjs` to `npm run verify`, creating the Phase
  1 ownership architecture docs, and strengthening the full terminal JSON
  parser/fixture contract.
- 2026-04-28: Verified the fixes with `npm run verify:repo-guard`, targeted
  server contract tests for evaluation/command/scanner boundaries, extension
  Vitest tests, server typecheck, `npm run verify`, and `git diff --check`.
  `npm run verify` passed with 0 errors and 1 existing duplicate warning for
  Anduril tracker rows.
- 2026-04-28: Completed a follow-up command-doc sweep so live operator docs,
  scan recovery instructions, extension launcher text, dashboard deprecation
  text, and the development compatibility alias all point operators to
  `npm run server`. Verification: `npm run verify:repo-guard` passed; `rg` for
  stale server/build launcher strings found only the repo-guard's deliberate
  old-bridge rejection pattern; `git diff --check` passed; `npm run verify`
  passed with 0 errors and the existing Anduril duplicate warning.
- 2026-04-28: Unified active docs and package entry points around npm commands:
  docs now use `npm run ...`, `npx`, and `npm run --cwd ...`; root
  `ext:build`, `server`, `verify`, desktop package scripts, hourly scan
  launchers, doctor/setup hints, and extension offline recovery text no longer
  point operators through stale package-manager commands. Verification: `rg`
  for stale executable command forms returned no matches outside
  generated/archive or nested `bb-browser` surfaces; `npm run ext:build`, the
  server dry-run, `npm run verify`, `npm --prefix apps/desktop run build:server`,
  `npm run verify:repo-guard`, syntax checks, and `git diff --check` passed.
- 2026-04-28: Added repository-local portable skills under `skills/`, kept
  `.claude/skills/` as a byte-for-byte runtime mirror, and wired
  `npm run verify:skills` into the default verification pipeline. This closes
  the remaining command-map coupling to Claude-specific paths while preserving
  Claude Code compatibility.
- 2026-05-03: The "Replacing bb-browser" out-of-scope decision recorded in
  this plan's "NOT In Scope" section is **reversed** by OpenSpec change
  `add-own-browser` (Phase 1 read replacement) on branch `feat/own-browser`.
  The follow-up `remove-bb-browser` change will delete `./bb-browser/` and
  the `*-bb-browser.ts` scripts after a 7-day stability window. See
  `openspec/changes/add-own-browser/` and
  `docs/superpowers/specs/2026-05-03-own-browser-design.md`.

## Current Audit Findings

The 2026-04-28 blockers below have been addressed in the current patch:

- Phase 1 Step 1 was open: `docs/architecture/current-system-map.md`,
  `docs/architecture/target-architecture.md`, and
  `docs/architecture/origin-and-ownership.md` did not exist.
- Phase 1 Step 3 was open: `package.json` still exposed `update:check`,
  `update`, and `rollback`; `update-system.mjs` still fetches from
  `https://github.com/santifer/auto-job.git`; `CLAUDE.md`, `GEMINI.md`,
  `DATA_CONTRACT.md`, and `docs/SCRIPTS.md` still documented upstream update
  behavior.
- Phase 1 Step 4 was open: `verify-pipeline.mjs` had no upstream-reference
  guard, so default verification can pass while live upstream update paths
  remain.
- Command-surface docs had drifted after the server launcher rename: this plan
  and several scan mode files still referenced the old extension bridge launcher.

## Final Outcome

Phase 1-7 implementation is complete and verified across ownership, guardrails,
contract, command-surface, and layout decisions. This plan should stay active
only until the branch is landed or the workstream is summarized.

Definition of done for the full migration:

- Phase 1-6 complete, with Phase 7 either completed or explicitly deferred.
- `npm run verify`, bridge tests/typecheck, extension typecheck/build, and
  dashboard build pass.
- Retained scan commands pass targeted score-only or fake-mode checks.
- `rg` confirms upstream references exist only in attribution/archive contexts.
- `docs/exec-plans/active/` contains only active work.
- The repo no longer behaves as an auto-updatable fork.

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | - | Significant product ownership change; optional before implementation |
| Codex Review | `/codex review` | Independent 2nd opinion | 0 | - | Not run |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | issues_open | 8 issues, 3 critical gaps captured in this plan |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | - | Not needed unless extension/dashboard UI changes are included |

**UNRESOLVED:** Whether to keep Gemini/OpenCode, whether to keep LaTeX, whether to rename the project.

**VERDICT:** ENG PLAN READY WITH OPEN DECISIONS - safe to start Phase 1, but do not claim independence until the upstream updater is disabled and verification guards exist.
