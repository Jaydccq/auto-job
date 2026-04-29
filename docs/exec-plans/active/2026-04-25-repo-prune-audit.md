# Repository Prune Audit

## Background

The user primarily uses auto-job for job scans, enrich/pipeline writeback,
PDF generation, negotiation scripts, interview story-bank material, and the
browser extension. The repository still includes broader upstream product
surfaces such as dashboards, multi-language modes, multiple CLI frontends,
general career modes, historical execution records, and generated runtime data.

## Goal

Identify repository features and files that are likely outside the user's
current workflow and can be considered for removal or cleanup. After user
approval, remove the explicitly selected unused surfaces and update repository
maps so there are no stale entry points for deleted features.

## Scope

- Audit the repository for surfaces outside the user's retained workflow.
- Delete only the user-approved unused surfaces and the stale entry documents
  that directly pointed at those deleted surfaces.
- Preserve the stated keep paths:
  - scanner entry points and their bridge/enrich path
  - `generate-pdf.mjs`, PDF templates, fonts, and PDF mode
  - negotiation/user profile content
  - `interview-prep/story-bank.md` and interview-prep mode
  - Chrome extension, bridge server, and related launch scripts
- Separate safe ignored-cache cleanup from versioned feature deletion.

## Assumptions

- The user targets United States roles and does not need non-US localized
  country/market modes.
- The user uses Codex rather than Gemini, OpenCode, or Claude slash-command
  surfaces.
- The user does not need the Go TUI dashboard.
- The user may still need `web/` if dashboard-based PDF/doc generation remains
  part of the workflow.

## Implementation Steps

1. Read repository instructions and file maps.
   Verify: `CLAUDE.md`, `DATA_CONTRACT.md`, `docs/SCRIPTS.md`, and
   `package.json` reviewed.
2. Map the retained workflow to files and package scripts.
   Verify: scan, enrich, PDF, interview-prep, and extension paths identified.
3. Inventory large or likely-unused areas.
   Verify: tracked file list, ignored file list, and size checks reviewed.
4. Produce deletion-candidate buckets.
   Verify: classify as keep, likely removable, optional cleanup, or risky.
5. Report findings to the user and wait for explicit deletion approval.
   Verify: no destructive filesystem action taken.
6. Delete the user-approved unused surfaces:
   `dashboard/`, non-US localized mode directories, selected governance/support
   docs, `examples/`, and selected promotional images.
   Verify: requested paths no longer exist.
7. Remove stale references from repository maps, update scripts, and CI helpers.
   Verify: `rg` no longer finds live references to deleted paths outside
   historical plans or the prune plan itself.
8. Run targeted verification.
   Verify: syntax/check commands complete or failures are documented.

## Verification Approach

For this prune:
- `git status --short`
- `git ls-files`
- `git ls-files --others --exclude-standard`
- targeted `sed`/`rg` reads of routing, package scripts, bridge, scans, and
  profile configuration
- `du -sh` size checks for major directories
- run `npm run verify`
- run targeted `node --check` checks for touched JavaScript entry points
- run `node test-all.mjs --quick` and document unrelated historical failures

## Progress Log

- 2026-04-25: Started audit after user requested a prune review focused on
  scan/enrich/PDF/negotiation/interview/extension workflows.
- 2026-04-25: Confirmed profile targets United States, USD compensation, and
  new-grad/early-career SWE, AI, backend, and full-stack roles.
- 2026-04-25: Confirmed scan scripts rely on `bridge/`, `extension/`,
  `bb-browser`, `config/profile.yml`, `portals.yml`, `data/pipeline.md`,
  `data/scan-history.tsv`, and `jds/`.
- 2026-04-25: Confirmed `dashboard/` is a separate Go TUI surface; `web/` is a
  separate static/dynamic dashboard surface and may overlap with PDF doc
  generation.
- 2026-04-25: Found large ignored cleanup candidates: `data/browser-profiles`
  around 1.2G, `batch/logs` around 61M, `bridge/node_modules` around 100M,
  `extension/node_modules` around 33M, and `bb-browser/node_modules` around
  125M.
- 2026-04-25: Ran non-destructive verification. `git diff --check` passed.
  `node test-all.mjs --quick` failed on pre-existing absolute-path checks in
  older plan files and personal-data warnings in localized README/dashboard
  files; this audit did not introduce those paths.
- 2026-04-25: User approved deleting the Go TUI dashboard, non-US localized
  modes, selected governance/support docs, examples, and promotional image
  assets.
- 2026-04-25: Removed `dashboard/`, `modes/de/`, `modes/fr/`, `modes/ja/`,
  `modes/pt/`, `modes/ru/`, selected root governance/support docs,
  `examples/`, and selected promotional image assets.
- 2026-04-25: Removed localized top-level README translations because they
  primarily referenced the deleted localized modes, examples, promotional
  assets, and Go TUI surface.
- 2026-04-25: Cleaned live references in repository maps, setup docs, CI/review
  configs, issue templates, and helper scripts.
- 2026-04-25: Verification after cleanup: `git diff --check`, targeted
  `node --check` runs, and `npm run verify` passed. `node test-all.mjs --quick`
  still fails only on pre-existing absolute paths in older plan/history docs.

## Key Decisions

- The retained path is the US/default scan, enrich, PDF, interview, negotiation,
  and extension workflow.
- Treat user-layer files from `DATA_CONTRACT.md` as protected unless the user
  explicitly asks to prune generated history or cache data.
- Do not remove `bridge/`, `extension/`, or `bb-browser` while scan/enrich and
  extension remain in scope.
- Do not remove `web/` in this prune because it is separate from the deleted Go
  TUI and still contains PDF/document generation affordances.

## Audit Findings

### Keep For Current Workflow

- Scanner commands and shared scan logic:
  - `scan.mjs`
  - `scripts/newgrad-scan-autonomous.ts`
  - `scripts/linkedin-scan-bb-browser.ts`
  - `scripts/job-board-scan-bb-browser.ts`
  - `scripts/rerun-newgrad-history.ts`
  - `scripts/warm-legacy-pending-cache.mjs`
  - `bridge/src/adapters/newgrad-*`
  - `bridge/src/adapters/linkedin-*`
  - `bridge/src/adapters/job-board-*`
  - `bridge/src/lib/*`
- Enrich and evaluation bridge:
  - `bridge/`
  - `scripts/bridge-start.mjs`
  - `batch/batch-prompt.md`
  - `batch/tracker-additions/.gitkeep`
  - `merge-tracker.mjs`
  - `verify-pipeline.mjs`
- Browser extension:
  - `extension/`
  - `scripts/extension-launcher.mjs`
  - `docs/BROWSER_EXTENSION.md`
- PDF generation:
  - `generate-pdf.mjs`
  - `templates/cv-template.html`
  - `fonts/`
  - `modes/pdf.md`
- User-specific context:
  - `cv.md`
  - `config/profile.yml`
  - `modes/_profile.md`
  - `article-digest.md`
  - `interview-prep/story-bank.md`
  - `modes/interview-prep.md`
  - `portals.yml`
  - `data/applications.md`, `data/pipeline.md`, `data/scan-history.tsv`
  - `reports/`, `output/`, `jds/`

### Likely Removable Features After Confirmation

- Go TUI dashboard:
  - `dashboard/`
  - package/test/doc references in `test-all.mjs`, `CLAUDE.md`,
    `DATA_CONTRACT.md`, `docs/CODEX.md`, and localized READMEs
  - Rationale: it is separate from the retained scan/enrich/PDF/extension path.
- Non-US / localized market modes:
  - `modes/de/`
  - `modes/fr/`
  - `modes/ja/`
  - `modes/pt/`
  - `modes/ru/`
  - Rationale: `config/profile.yml` targets the United States and default
    English modes cover English-language US postings.
- Non-Codex CLI surfaces, if Codex is the only frontend:
  - `.gemini/`
  - `GEMINI.md`
  - `.opencode/`
  - `gemini-eval.mjs`
  - package script `gemini:eval`
  - dependency `@google/generative-ai`
- Unused career modes, if the user does not invoke them:
  - `modes/contacto.md`
  - `modes/deep.md`
  - `modes/ofertas.md`
  - `modes/training.md`
  - `modes/project.md`
  - `modes/patterns.md`
  - `modes/followup.md`
  - `analyze-patterns.mjs`
  - `followup-cadence.mjs`
- Cover-letter and LaTeX export surfaces, if not used:
  - `modes/cover-letter.md`
  - `generate-cover-letter.mjs`
  - `templates/cover-letter-template.html`
  - `examples/sample-cover-letter.json`
  - `modes/latex.md`
  - `generate-latex.mjs`
  - `templates/cv-template.tex`
  - package scripts `cover-letter` and `latex`
- Public/open-source maintenance surface, if this is now strictly personal:
  - `.github/`
  - `.coderabbit.yaml`
  - `renovate.json`
  - `release`/SBOM/dependency workflow docs
  - `CODE_OF_CONDUCT.md`, `CONTRIBUTING.md`, `CONTRIBUTORS.md`,
    `GOVERNANCE.md`, `SECURITY.md`, `SUPPORT.md`, `CITATION.cff`
- Example and marketing assets:
  - `examples/`
  - `docs/demo.gif`
  - `docs/hero-banner.jpg`
  - `docs/og-image.jpg`
  - `docs/roadmap-phases.jpg`
  - `docs/vision-banner.jpg`
  - most old `docs/plans/`, `docs/prds/`, and `docs/superpowers/` if not used
    as active engineering context
- Execution-plan/history noise:
  - `docs/exec-plans/active/` currently contains 91 active plan files.
  - Several old active plans and `docs/plans/` files trigger existing
    `test-all.mjs --quick` absolute-path failures.
  - Preferred action is consolidation/archive, not blind deletion, because
    plan files can contain decisions and verification history.

### Optional Cleanup Of Ignored Runtime Data

These are not core versioned source files. Deleting them reclaims space but may
remove local convenience state.

- `data/browser-profiles/` around 1.2G
  - Tradeoff: likely loses the Playwright/scan browser login/session state.
- `batch/logs/` around 61M
  - Tradeoff: loses historical bridge/batch debugging logs.
- `batch/.report-number-reservations/` around 476K
  - Tradeoff: should only be removed after confirming no evaluations are
    running.
- `bridge/node_modules/` around 100M
- `extension/node_modules/` around 33M
- `bb-browser/node_modules/` around 125M
- root `node_modules/` around 14M
  - Tradeoff: dependencies must be reinstalled before running affected tools.
- `batch/tracker-additions/merged/` around 468K
  - Tradeoff: loses merged TSV audit trail, but current tracker state remains in
    `data/applications.md`.
- `data/scan-runs/` around 1M
  - Tradeoff: loses scan-run summaries but keeps `data/scan-history.tsv`.

### Do Not Remove Without Refactor

- `batch/batch-prompt.md`: the bridge real-evaluation path renders this prompt.
- `batch/` as a whole: bridge writes logs and tracker additions there.
- `web/`: the local dashboard server is not the Go TUI. It can generate
  Apply Next PDFs using `generate-pdf.mjs` and `generate-cover-letter.mjs`.
  Remove only if the user never uses `npm run dashboard` or dashboard PDF
  buttons.
- `bb-browser/`: browser-backed Built In, Indeed, and LinkedIn scans call the
  `bb-browser` CLI/site adapters.
- `templates/states.yml`: tracker validation and dashboard/status logic depend
  on canonical state IDs.
- `DATA_CONTRACT.md`, `CLAUDE.md`, `AGENTS.md`, and `docs/CODEX.md`: if files
  are removed, these must be updated so the repo remains the system of record.

## Risks And Blockers

- Removing `web/` may remove dashboard-based CV/PDF generation paths even if the
  Go TUI is unused.
- Removing `batch/` entirely is risky because the bridge evaluation path still
  writes logs and tracker additions under `batch/`.
- Removing scan history or browser profile data can cause re-scans, lost login
  state, or duplicate discovery work.
- Removing docs or command surfaces requires updating `CLAUDE.md`,
  `DATA_CONTRACT.md`, `docs/CODEX.md`, `docs/SCRIPTS.md`, and package scripts
  so the repository remains internally consistent.

## Final Outcome

Removed the user-approved unused surfaces and updated live repository entry
points so deleted files are no longer advertised as active workflow paths.

Verification status:
- `git diff --check` passed.
- `node --check test-all.mjs update-system.mjs doctor.mjs
  generate-cover-letter.mjs` passed.
- `npm run verify` passed with two existing duplicate warnings in
  `data/applications.md`.
- `node test-all.mjs --quick` failed on pre-existing absolute paths in older
  execution-plan/history docs. No remaining failures point to the deleted
  dashboard, examples, localized modes, or promotional assets.
