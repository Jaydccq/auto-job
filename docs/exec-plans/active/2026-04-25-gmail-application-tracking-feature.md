# Gmail Application Tracking Feature Plan

## Background

The user wants a Gmail-backed application tracking feature: track companies applied to, detect application status changes, surface interviews/OA/follow-ups, and keep the Auto-Job tracker current.

Current Auto-Job is a local, repository-first job search system. The canonical tracker is `data/applications.md`; follow-up cadence is computed by `followup-cadence.mjs`; dashboard data is built from repository files by `web/build-dashboard.mjs`; status writes must use existing tracker rules from `CLAUDE.md`.

The design question is whether to:

- use the Codex Gmail skill/connector directly, or
- build a first-party Gmail OAuth integration and scan Gmail through the Gmail API.

## Goal

Choose the safest and simplest implementation path for Gmail-driven application tracking, then define an execution plan that can be implemented without creating a parallel tracker or overbuilding product infrastructure too early.

## Success Criteria

- Gmail-derived application signals become durable local repository artifacts before they affect tracker decisions.
- `data/applications.md` remains the only canonical application tracker.
- The first implementation can run locally for the current user without Google OAuth app verification or production backend infrastructure.
- The design leaves a clear upgrade path to first-party Gmail OAuth if Auto-Job becomes a multi-user product.
- Every status-changing path has tests or a reproducible dry-run check before it mutates tracker state.

## Assumptions

- The immediate target is this repository's local/personal Auto-Job workflow, not a hosted multi-user SaaS.
- The user wants recommendations and tracking, not automatic application submission.
- Gmail read access is needed only to detect hiring/application events; sending, deleting, archiving, and labeling are not part of this feature.
- Codex Gmail skill access is acceptable for local/manual runs, but its results must be written into repo files before they are treated as system state.
- If the feature later becomes a product for external users, first-party Gmail OAuth becomes mandatory.

## Uncertainties

- Whether the user needs fully automatic background sync, or whether an explicit local command is enough.
- Whether Gmail metadata is enough for useful triage, or whether body snippets/full bodies are required for OA deadlines and interview scheduling.
- Whether the project should store raw email snippets, derived event facts only, or both.

## Recommendation

Use a two-stage path.

Stage 1 for this repository: use Codex Gmail skill as the Gmail read adapter, but never as the product state store. Write derived signals into versioned repo artifacts and merge them into existing tracker/follow-up flows through scripts with dry-run and tests.

Stage 2 for a real product: build first-party Gmail OAuth, token storage, background sync, Pub/Sub/history-based incremental sync, privacy controls, and Google verification/security review readiness.

Do not start by building Gmail OAuth inside this repo unless the actual goal is a hosted multi-user product. That would introduce auth, token storage, Pub/Sub, background workers, cloud deployment, privacy policy, user deletion, and Google restricted-scope review before the local tracker model is proven.

## Scope

In scope for the first implementation:

- Define a repository-owned email signal artifact.
- Add a parser/importer that converts Gmail search/read results into normalized application events.
- Reuse canonical tracker statuses from `templates/states.yml`.
- Reuse `data/applications.md`, `data/follow-ups.md`, `followup-cadence.mjs`, and dashboard parsing.
- Add tests for classification, deduplication, exact/ambiguous matching, and dry-run mutation behavior.
- Add dashboard visibility for application attention items if the existing dashboard is the chosen UI surface.

Not in scope for the first implementation:

- Hosted multi-user OAuth.
- Google Cloud Pub/Sub.
- Persistent token storage.
- Gmail write operations.
- Automatic sending of follow-up emails.
- Raw mailbox archival inside the repository.

## What Already Exists

- `data/applications.md`: canonical application tracker; statuses must remain canonical.
- `templates/states.yml`: canonical status source.
- `merge-tracker.mjs`: merge path for new application rows.
- `verify-pipeline.mjs`: structural tracker health check.
- `followup-cadence.mjs`: existing follow-up urgency calculation for active applications.
- `data/follow-ups.md`: follow-up history once a user confirms an action was sent.
- `web/build-dashboard.mjs`: dashboard data builder from repository files.
- `web/dashboard-server.mjs`: local server that already mutates tracker status for dashboard actions.
- Gmail skill: existing interactive mailbox search/read/triage capability, explicitly designed around Gmail-native search and read-only-first workflows.

The plan should reuse these. A new Gmail feature should not create a second application database, a second status model, or a separate follow-up engine.

## Step 0 Scope Challenge

1. Existing code already solves tracker state, follow-up cadence, dashboard rendering, status validation, and merge/dedup concerns. The missing piece is an email-signal ingestion layer, not a new tracker.
2. Minimum viable change: create a derived signal artifact plus an importer/classifier and wire its output into existing tracker/follow-up/dashboard flows.
3. Complexity smell: first-party OAuth would likely add more than 8 files and more than 2 services/classes before a single application event is useful. For the current repo, that is overbuilt.
4. Search check:
   - [Layer 1] Gmail API has built-in full sync, partial sync via `history.list`, and push notifications via `users.watch`; use those if/when building product sync.
   - [Layer 1] Gmail scopes should be as narrow as possible; `gmail.readonly` and `gmail.metadata` are restricted scopes.
   - [Layer 1] Gmail push watches expire and must be renewed at least every 7 days; Google recommends daily renewal.
   - [Layer 1] Gmail history records can expire; clients must fall back to full sync on out-of-range history.
5. `TODOS.md` has no existing item that blocks this feature.
6. Completeness check: the complete local version is not OAuth. The complete local version is a durable, tested signal pipeline that can later swap the Gmail source adapter.
7. Distribution check: no new artifact type is required for Stage 1. If Stage 2 becomes a hosted service, deployment, OAuth verification, and data deletion workflows become required scope.

## Architecture Review

Recommended Stage 1 architecture:

```text
Codex Gmail skill / Gmail connector
        |
        | read-only search + selected message/thread reads
        v
operator-reviewed Gmail signal JSON/Markdown
        |
        v
scripts/import-gmail-signals.mjs --dry-run
        |
        +--> normalized email events
        |       - company
        |       - role
        |       - event type
        |       - event date
        |       - confidence
        |       - source message id/thread id
        |       - recommended tracker action
        |
        +--> exact matches update existing tracker rows
        |
        +--> ambiguous/new rows go to review queue
        |
        v
data/applications.md + data/follow-ups.md + dashboard
```

Recommended Stage 2 architecture if this becomes a product:

```text
User browser
   |
   v
OAuth consent
   |
   v
Backend API ------ encrypted token store
   |
   v
Gmail Sync Worker
   |
   +--> initial scan: messages.list / threads.list + messages.get
   |
   +--> incremental sync: users.watch -> Pub/Sub -> history.list
   |
   +--> fallback resync: recent-window scan / full sync on 404 history
   |
   v
Parser / classifier
   |
   v
Applications / events / attention items DB
   |
   v
Application tracker UI
```

Architecture decision: Stage 1 should define a Gmail source boundary so the Gmail skill can be replaced later by OAuth without rewriting tracker logic.

Production failure scenario for Stage 1: Gmail search returns only a sampled/narrowed set and misses a rejection. Mitigation: record query scope and confidence in the signal artifact, and do not claim comprehensive mailbox state unless the scan scope supports it.

Production failure scenario for Stage 2: Pub/Sub notification is delayed/dropped or `historyId` expires. Mitigation: store last known `historyId`, process `history.list`, and run periodic fallback sync; on Gmail 404, perform a bounded full sync.

## Code Quality Review

Keep the implementation boring and explicit:

- Add one importer script first; avoid a service framework.
- Keep matching logic as pure functions that can be unit tested.
- Keep Gmail-specific parsing separate from tracker mutation.
- Require `--dry-run` output before any tracker write.
- Preserve existing status normalization and tracker rules instead of reimplementing them.
- Store only derived facts by default; avoid raw email bodies unless a later requirement proves they are needed.

Likely files for Stage 1:

- `scripts/import-gmail-signals.mjs` or root-level `import-gmail-signals.mjs`, following existing script style.
- `data/gmail-signals.jsonl` for local derived, reviewed events, with `docs/GMAIL_SIGNALS.md` as the versioned schema.
- `data/gmail-review-queue.md` for ambiguous matches.
- targeted tests in the existing `test-all.mjs` pattern, or a focused Node test if the repo adds one.
- optional dashboard changes in `web/build-dashboard.mjs` and `web/template.html`.

If the first implementation touches more than the importer, one data artifact, tests, and optional dashboard rendering, reassess scope.

## Test Review

Detected test infrastructure:

- `package.json` exposes `bun run verify`, `bun run dashboard:build`, and `test-all.mjs`.
- `CLAUDE.md` says GitHub Actions run `test-all.mjs`.
- Existing scripts are plain Node `.mjs` modules.

Coverage diagram for Stage 1:

```text
CODE PATH COVERAGE TO ADD
=========================
[+] Gmail signal loader
    |
    +-- [GAP] valid signal file -> parsed events
    +-- [GAP] missing/empty signal file -> no-op with clear output
    +-- [GAP] malformed event -> validation error, no tracker write

[+] Event classifier
    |
    +-- [GAP] application confirmation -> Applied candidate
    +-- [GAP] recruiter response -> Responded candidate
    +-- [GAP] interview/OA scheduled -> Interview or attention item
    +-- [GAP] rejection/closed role -> Rejected/Discarded candidate
    +-- [GAP] ambiguous subject/body -> review queue, no mutation

[+] Tracker matcher
    |
    +-- [GAP] exact company + role match -> update existing row only
    +-- [GAP] company match + role mismatch -> review queue
    +-- [GAP] no existing row -> review queue or TSV addition, not direct append
    +-- [GAP] terminal status already set -> do not downgrade

[+] Tracker writer
    |
    +-- [GAP] --dry-run -> proposed diff only
    +-- [GAP] write mode -> surgical row update
    +-- [GAP] write failure -> no partial corrupt tracker

USER FLOW COVERAGE TO ADD
=========================
[+] Local scan/review/import flow
    |
    +-- [GAP] user runs Gmail search through skill -> saves derived signals
    +-- [GAP] user previews importer dry-run -> sees exact vs ambiguous actions
    +-- [GAP] user applies exact updates -> verify-pipeline passes
    +-- [GAP] user opens dashboard -> attention items/status changes visible

[+] Error and recovery states
    |
    +-- [GAP] Gmail unavailable -> explain reconnect/manual export path
    +-- [GAP] duplicate email signal -> idempotent no-op
    +-- [GAP] stale signal from old scan -> skipped or marked stale
    +-- [GAP] conflicting signals -> review queue

─────────────────────────────────
COVERAGE TARGET: 0/22 paths currently covered by feature-specific tests
QUALITY TARGET: all matcher/classifier branches get behavior tests before write mode lands
E2E TARGET: one dry-run-to-verify flow using fixture data
─────────────────────────────────
```

Test requirements:

- Add fixtures for common hiring email types: applied, OA, interview, rejection, action required, newsletter/noise, ambiguous company.
- Test idempotency by importing the same signal twice.
- Test status monotonicity so `Rejected`/`Offer`/`Discarded` are not overwritten by later generic confirmations.
- Test exact-vs-ambiguous matching.
- Test that no new rows are appended directly to `data/applications.md`.
- Run `node verify-pipeline.mjs` after any tracker mutation.
- Run `bun run dashboard:build` if dashboard rendering changes.

## Performance Review

Stage 1 performance risks are low because the Gmail skill search is user-triggered and bounded. The importer should still:

- process signal files linearly,
- avoid loading unnecessary raw email bodies,
- avoid repeated full tracker parsing inside loops,
- keep dry-run output compact,
- deduplicate by Gmail message/thread id plus event type.

Stage 2 performance risks are material:

- Gmail full sync can be expensive; use bounded historical windows for this product's purpose.
- Pub/Sub can redeliver notifications; worker must be idempotent.
- Gmail notification rate is limited per watched user; avoid feedback loops.
- History records can expire; fallback sync must avoid unbounded mailbox scans.

## Failure Modes

| Codepath | Failure | Test? | Handling? | User-visible? | Critical Gap |
|---|---|---:|---:|---:|---:|
| Signal loader | malformed signal artifact | planned | planned | clear error | no |
| Event classifier | false positive newsletter as application | planned | review queue under low confidence | yes | no |
| Tracker matcher | wrong role matched at same company | planned | require exact role or review queue | yes | no |
| Tracker writer | partial write corrupts markdown | planned | write temp/validate before replace | yes | no |
| Gmail scan scope | missed important email | planned via scope logging | partial; cannot guarantee | yes, confidence note | no |
| OAuth sync Stage 2 | expired historyId | future | full/resync fallback required | yes | yes if Stage 2 skips fallback |
| OAuth sync Stage 2 | token revoked | future | reconnect state required | yes | yes if Stage 2 skips reconnect UX |

## NOT In Scope

- First-party Gmail OAuth in the first local implementation: too much infrastructure before the signal model is proven.
- Multi-user hosted product backend: different architecture and compliance burden.
- Gmail write actions: not needed for tracking and increases risk.
- Auto-sending recruiter follow-ups: violates review-before-send expectations.
- Full mailbox archival: unnecessary and privacy-heavy.
- Automatic tracker row creation from email alone: use existing TSV merge flow or review queue.

## Implementation Steps

1. Define the Gmail signal artifact.
   Verify: sample fixture file validates and records query scope, account, timestamp, and source message/thread ids.
2. Build pure classifier/matcher functions.
   Verify: fixture tests cover all event types, ambiguity, duplicate signals, and terminal-status protection.
3. Build importer dry-run.
   Verify: dry-run shows exact updates, review queue entries, and no file mutation.
4. Add write mode for exact existing-row updates only.
   Verify: `node verify-pipeline.mjs` passes after a fixture-backed mutation.
5. Wire follow-up/attention output.
   Verify: `node followup-cadence.mjs --summary` still works and attention items are visible in the chosen artifact or dashboard.
6. Optional dashboard display.
   Verify: `bun run dashboard:build` succeeds and the dashboard renders the new derived data.

## Verification Approach

- Use fixture-driven tests for all classifier and matcher branches.
- Use dry-run snapshots for proposed tracker changes.
- Use `node verify-pipeline.mjs` after any tracker write.
- Use `bun run dashboard:build` for dashboard changes.
- Record Gmail query scope and scan limitations in every run artifact.

## Key Decisions

- Decision: For this repo, use Gmail skill/connector as the Stage 1 read adapter instead of building OAuth first.
  Rationale: Auto-Job is currently local and repository-first; OAuth adds production infrastructure and Google verification concerns before the local model is validated.
- Decision: Make derived email signals durable in repo artifacts before they drive tracker updates.
  Rationale: The repository is the only durable system of record.
- Decision: Only exact existing tracker matches can mutate `data/applications.md` automatically.
  Rationale: Existing project rules prohibit direct new row creation and require careful duplicate handling.
- Decision: Keep Gmail writes out of scope.
  Rationale: Tracking only needs read access; write scopes increase risk and review burden.
- Decision: Connect the first Gmail signal UI to the existing dashboard Tracker tab instead of creating a separate product UI.
  Rationale: The dashboard already owns tracker browsing, status context, and local actions; adding Gmail signals there keeps the first implementation small and avoids a parallel application surface.
- Decision: Replace the Tracker table surface with a pipeline-oriented card flow, while keeping the existing dashboard data builder and filters.
  Rationale: The requested experience is an application pipeline view with active counts, attention counts, top opportunities, recent contact, and action state; this can be done as a view-layer change without creating a new tracker backend.
- Decision: Render unmatched Gmail signals as display-only Gmail-derived pipeline rows.
  Rationale: Gmail can contain active applications that are not yet represented by an exact tracker row. Showing them in the dashboard is useful, but mutating the canonical tracker still requires the existing review/merge path.
- Decision: Keep private Gmail/profile data out of tracked static dashboard exports.
  Rationale: `data/gmail-signals.jsonl` and `config/profile.yml` are user-specific local data. `bun run dashboard` can include them for the private local view, but `bun run dashboard:build` must not embed them into tracked `web/index.html`.
- Decision: Run a dashboard-start Gmail refresh hook, not the Codex Gmail connector itself.
  Rationale: `bun run dashboard` runs in a normal Node/Bun process and cannot call Codex MCP app tools. The startup hook gives the dashboard a reliable refresh boundary and can execute a future OAuth/CLI scanner without pretending the Codex-only connector is available to package scripts.
- Decision: Expose connector-assisted Gmail scanning as `/auto-job gmail-scan`.
  Rationale: This matches the existing `newgrad-scan` project pattern: the checked-in `auto-job` skill routes to a mode file that defines prerequisites, execution, output artifacts, and verification. It keeps the Codex-only Gmail connector workflow explicit while preserving the future path for a standalone OAuth scanner.
- Decision: Implement the standalone scanner with Google's Desktop OAuth loopback flow, PKCE, and `gmail.readonly`.
  Rationale: Google documents loopback redirect as the recommended desktop mechanism and `gmail.readonly` is the narrowest scope that can read bodies/snippets needed to classify OA, interview, offer, and rejection messages. The scanner stores tokens in gitignored local config and writes only derived signal JSONL.

## Risks and Blockers

- Gmail skill access may not be available in non-Codex environments.
- Dashboard startup can only run standalone local commands; it cannot directly invoke Codex Gmail app tools.
- `/auto-job gmail-scan` requires a Codex session with the Gmail connector; non-Codex clients need the future OAuth scanner instead.
- OAuth authorization creates persistent Gmail read access; the user must run `bun run gmail:auth` and approve the consent screen directly.
- Gmail search scope can miss messages; every run must report coverage.
- Parsing hiring emails is noisy; low-confidence signals must go to review queue.
- If hosted productization is required immediately, this plan must be superseded by an OAuth/backend plan.
- Google Gmail restricted scopes can require verification and, if restricted data is stored/transmitted server-side, security assessment.

## Productization Notes

If this becomes a product feature for external users, switch to first-party Gmail OAuth and design for:

- narrowest possible scopes,
- OAuth verification,
- restricted-scope security assessment if storing/transmitting Gmail data,
- encrypted refresh token storage,
- user data deletion,
- reconnect UX for revoked tokens,
- background sync workers,
- `users.watch` renewal,
- Pub/Sub acknowledgement/retry behavior,
- `history.list` fallback and full sync recovery.

Relevant primary sources:

- Gmail API scope guidance: https://developers.google.com/workspace/gmail/api/auth/scopes
- Gmail sync guidance: https://developers.google.com/workspace/gmail/api/guides/sync
- Gmail push notifications: https://developers.google.com/workspace/gmail/api/guides/push
- Gmail watch method: https://developers.google.com/workspace/gmail/api/reference/rest/v1/users/watch
- Google API Services User Data Policy: https://developers.google.com/terms/api-services-user-data-policy
- Workspace API user data/developer policy: https://developers.google.com/gmail/api/policy

## Progress Log

- 2026-04-25: Read `CLAUDE.md`, `docs/exec-plans/README.md`, `TODOS.md`, existing Gmail tracker review plan, Gmail skill instructions, `package.json`, `followup-cadence.mjs`, `web/build-dashboard.mjs`, and tracker/dashboard references.
- 2026-04-25: Checked gstack `/plan-eng-review` preamble; repo mode is collaborative, branch is `main`.
- 2026-04-25: Confirmed no design doc exists for this branch.
- 2026-04-25: Checked recent git history; recent work heavily touches scan/dashboard workflows, so this plan recommends reusing dashboard/tracker paths rather than adding parallel UI/data stores.
- 2026-04-25: Reviewed current Gmail API docs for scopes, sync, push notifications, watch renewal, and user data policy.
- 2026-04-25: Wrote Stage 1 recommendation: use Gmail skill as read adapter for local MVP, make repo-owned derived signals durable, defer OAuth to productization.
- 2026-04-25: User chose the existing dashboard as the first UI surface.
- 2026-04-25: Added dashboard parsing for optional `data/gmail-signals.jsonl`, Tracker tab Gmail signal filter/column/summary, schema docs, parser coverage in `test-all.mjs`, and `.gitignore` protection for the personal signal file.
- 2026-04-25: Verified `node --check web/build-dashboard.mjs`, `node --check test-all.mjs`, `bun run dashboard:build`, `node verify-pipeline.mjs`, and `git diff --check`.
- 2026-04-25: Ran `node test-all.mjs --quick`; new Gmail parser test passed, but the full suite failed on pre-existing absolute-path findings in automation logs and older plan docs unrelated to this dashboard change.
- 2026-04-25: User requested a pipeline/application-tracker dashboard matching the shared target copy and behavior.
- 2026-04-25: Reworked the existing Tracker tab into a pipeline view with hero counts, Gmail account display, top opportunities, grouped application cards, recent contact, attention state, updated recency, search, stage filter, Gmail signal filter, and sort controls.
- 2026-04-25: Added profile email parsing from `config/profile.yml` so the dashboard can show the configured mailbox without hard-coding user data.
- 2026-04-25: Browser-tested the local dashboard at `http://127.0.0.1:47329/`; verified the Tracker view renders the new pipeline UI, removes the broken `Showing 1-0 of 0 opportunities`/`Loading recommended jobs` state, shows the configured email account, and has no console errors.
- 2026-04-25: Fixed a responsive layout bug found in browser testing where the Updated column could wrap below the row; changed the flow-card grid to a stable six-column layout and constrained updated date text to one line.
- 2026-04-25: Re-verified `node --check web/build-dashboard.mjs`, `node --check test-all.mjs`, `bun run dashboard:build`, and `git diff --check`. Re-ran `node test-all.mjs --quick`; the Gmail parser/profile test passes and the suite still fails only on existing absolute-path findings outside this change.
- 2026-04-25: User clarified the dashboard must be populated by scanning Gmail application/interview/OA/offer/rejection emails, not just by showing empty Gmail fields for existing tracker rows.
- 2026-04-25: Used the Gmail connector with read-only Gmail search over the last 12 months for ATS/recruiting senders and company-specific searches, then read selected high-signal threads for Arista, Formant, Rokt, Rubrik, Verkada, xAI, and Loop.
- 2026-04-25: Wrote derived mailbox facts to local, gitignored `data/gmail-signals.jsonl`; recorded message/thread ids, company, role, event type, date, sender/recent contact, short snippet/summary, email counts, confidence, and recommended action where relevant.
- 2026-04-25: Updated Tracker rendering to merge canonical tracker rows with unmatched Gmail-only rows, so inbox-discovered applications such as Arista Networks, Formant, Rokt, Rubrik, xAI, and Loop appear even without exact rows in `data/applications.md`.
- 2026-04-25: Added expandable per-row email evidence showing sender, relative time, subject, and short snippet/summary while avoiding full raw body storage.
- 2026-04-25: Added `data/gmail-signals.jsonl` to the test suite's gitignored user-file checks.
- 2026-04-25: Browser-tested the updated Tracker tab at `http://127.0.0.1:47329/`; verified 63 synced signals, Gmail-only rows for Arista/Formant/Rokt, expandable Arista email evidence, and no browser console errors.
- 2026-04-25: Re-verified `node --check web/build-dashboard.mjs`, `node --check test-all.mjs`, `bun run dashboard:build`, and `git diff --check`. Re-ran `node test-all.mjs --quick`; 67 checks pass including Gmail parser/profile and gitignore checks, and the suite still fails only on pre-existing absolute-path findings outside this change.
- 2026-04-25: Found and fixed a privacy leak path where static `web/index.html` could embed local profile/Gmail signal data after `bun run dashboard:build`; static export now omits profile email and Gmail signals, while `web/dashboard-server.mjs` explicitly enables both for the private local server.
- 2026-04-25: Rebuilt the static dashboard and verified `web/index.html` no longer contains the Gmail account, Arista/Richard evidence, or Gmail message ids. Restarted the local server and re-verified the enriched private dashboard still shows the configured Gmail account, 63 synced signals, Gmail-only rows, and no browser console errors.
- 2026-04-25: User requested that every `bun run dashboard` perform one Gmail update before showing the dashboard.
- 2026-04-25: Added `scripts/refresh-gmail-signals.mjs` as the dashboard-start refresh boundary, wired `web/dashboard-server.mjs` to call it once before listening, added `bun run gmail:update`, and added a typo-compatible `dashborad` script for the user's command spelling.
- 2026-04-25: Documented the refresh command contract: `AUTO_JOB_GMAIL_REFRESH_COMMAND` must be a JSON array for a standalone OAuth/CLI scanner that writes `data/gmail-signals.jsonl`; without that command, dashboard startup records a skipped refresh because Codex Gmail connector access is not callable from Node/Bun.
- 2026-04-25: Verified `node --check scripts/refresh-gmail-signals.mjs`, `node --check web/dashboard-server.mjs`, `node --check web/build-dashboard.mjs`, `node --check test-all.mjs`, `node scripts/refresh-gmail-signals.mjs`, `bun run dashboard:build`, `git diff --check`, and static privacy grep for Gmail account/Arista/Richard/message-id text.
- 2026-04-25: Ran `node test-all.mjs --quick`; the new Gmail refresh parser/gitignore checks pass, and the suite still fails only on pre-existing absolute-path findings in older automation logs/plans outside this change.
- 2026-04-25: Started the dashboard through `bun run dashboard`; the startup log shows one Gmail refresh hook attempt before the server listens. Browser-tested `http://127.0.0.1:47329/`; verified the Tracker tab shows the Gmail account, skipped refresh status, 63 synced signals, Arista rows, and no console errors.
- 2026-04-25: User requested a Auto-Job skill entry point like `newgrad-scan` for the Gmail workflow.
- 2026-04-25: Added `modes/gmail-scan.md`, routed `gmail-scan`/`gmail` through `.claude/skills/auto-job/SKILL.md`, added an OpenCode command wrapper, and updated `CLAUDE.md`, `docs/CODEX.md`, `docs/GMAIL_SIGNALS.md`, `web/README.md`, and `test-all.mjs`.
- 2026-04-25: Updated the dashboard refresh skipped message to point users to `/auto-job gmail-scan` when no standalone refresh command is configured.
- 2026-04-25: Verified the Gmail-scan skill wiring with `node --check scripts/refresh-gmail-signals.mjs`, `node --check web/build-dashboard.mjs`, `node --check web/dashboard-server.mjs`, `node --check test-all.mjs`, `bun run gmail:update`, `bun run dashboard:build`, and `git diff --check`.
- 2026-04-25: Re-ran `node test-all.mjs --quick`; the new `gmail-scan` mode existence and auto-job router checks pass. The suite still fails only on pre-existing absolute-path findings in older logs/plans.
- 2026-04-25: Restarted `bun run dashboard` and browser-tested the Tracker tab; verified the updated refresh message points to `/auto-job gmail-scan`, synced signals remain 63, and console errors are empty.
- 2026-04-25: User requested `/superpowers` planning plus `/plan-eng-review` for the missing OAuth/CLI scanner so `bun run dashboard` can really pull Gmail on startup.
- 2026-04-25: Ran the gstack plan-eng-review preamble; it reported branch `main`, repo mode `collaborative`, telemetry `community`, and an available gstack upgrade. Auto-upgrade is disabled, so implementation continued with the current skill version.
- 2026-04-25: Checked current official Google docs for Gmail `users.messages.list`, `users.messages.get`, and OAuth 2.0 desktop/native loopback flow before implementing the scanner.
- 2026-04-25: Added `scripts/gmail-oauth-refresh.mjs` with `auth` and `scan` modes, Desktop OAuth PKCE loopback support, refresh-token reuse, Gmail API message list/get calls, hiring-event classification, signal merge/dedupe, and JSONL output.
- 2026-04-25: Updated `scripts/refresh-gmail-signals.mjs` so dashboard startup defaults to the OAuth scanner when no explicit `AUTO_JOB_GMAIL_REFRESH_COMMAND` is set, and reports `setup_required` instead of failing hard when OAuth credentials/tokens are not configured.
- 2026-04-25: Added `bun run gmail:auth` and `bun run gmail:scan`, gitignored `config/gmail-oauth-credentials.json` and `config/gmail-oauth-token.json`, and documented the setup in `docs/GMAIL_SIGNALS.md`, `web/README.md`, and `modes/gmail-scan.md`.
- 2026-04-25: Verified the OAuth scanner path with syntax checks, the dashboard refresh wrapper, static privacy grep, `bun run dashboard:build`, `git diff --check`, and `node test-all.mjs --quick`; the new Gmail OAuth parser/merge and gitignore checks pass, while the quick suite still fails only on pre-existing absolute-path findings in older logs/plans.
- 2026-04-25: Restarted `bun run dashboard`; startup now attempts the OAuth scanner first and reports `setup_required` until `config/gmail-oauth-credentials.json` and `config/gmail-oauth-token.json` exist. Browser-tested the Tracker tab and verified the private dashboard still shows the Gmail account, 63 signals, Arista/Formant/Rokt action rows, and no JavaScript console errors.
- 2026-04-25: User hit `OAuth state mismatch` during `bun run gmail:auth` after the browser landed on a bare `/oauth2callback` URL. Fixed the auth callback parser so empty callback visits keep waiting instead of rejecting the flow; only callback requests carrying OAuth params now trigger state validation.
- 2026-04-25: Re-verified the callback fix with `node --check scripts/gmail-oauth-refresh.mjs`, `node --check test-all.mjs`, `git diff --check`, and `node test-all.mjs --quick`. The Gmail parser/auth callback regression test passes; the quick suite still fails only on pre-existing absolute-path findings in older logs/plans.
- 2026-04-25: User hit Google `Error 400: redirect_uri_mismatch`, which indicates the saved OAuth client was likely a `Web application` client. Updated the scanner to reject Web client JSON locally with a setup message requiring Application type `Desktop app`, and documented the Desktop-app requirement in the Gmail signal and dashboard docs.
- 2026-04-25: Re-verified the Desktop-app guard with `node --check scripts/gmail-oauth-refresh.mjs`, `node --check test-all.mjs`, `git diff --check`, and `node test-all.mjs --quick`. The Gmail OAuth credential-type regression test passes; quick suite failures remain the unrelated historical absolute-path findings.
- 2026-04-25: After OAuth authorization, `bun run gmail:scan` reached Google APIs but failed because Gmail API is not enabled for project `23015884588`. Updated the scanner to classify that response as setup-required and documented that Gmail API must be enabled for the same OAuth project before scanning can succeed.
- 2026-04-25: Verified the setup-required path with `node --check scripts/gmail-oauth-refresh.mjs`, `node --check test-all.mjs`, `git diff --check`, `bun run gmail:scan`, and `bun run gmail:update`; dashboard refresh status now records the Gmail API-disabled setup message while preserving the existing 63 local signals.
- 2026-04-25: User enabled Gmail API for the OAuth project. Re-ran `bun run gmail:update`; the OAuth scanner completed successfully and wrote 338 parsed signals with 0 parse errors.
- 2026-04-25: Started `bun run dashboard`; startup performed another OAuth scanner refresh successfully, updated `data/gmail-signals.jsonl` to 339 parsed signals with 0 parse errors, and served the dashboard at `http://127.0.0.1:47329/`. Verified the served HTML includes the Gmail refresh success status, Tracker view, and Gmail data.

## Final Outcome

Stage 1 dashboard integration is implemented for optional derived Gmail signals and a pipeline-oriented Tracker UI. The Tracker tab now reads local Gmail scan output from `data/gmail-signals.jsonl` through `web/build-dashboard.mjs`, matches by `applicationNum` or exact company+role, derives active/attention counts from tracker plus Gmail-only rows, shows the configured Gmail account from `config/profile.yml`, and presents active applications as grouped pipeline cards with top opportunities and expandable email evidence.

OAuth/CLI scanner status: implemented, authorized, and wired into dashboard startup. `bun run dashboard` now invokes the OAuth scanner before serving the page and writes fresh derived signals to `data/gmail-signals.jsonl`. Exact tracker mutation remains gated; the scanner writes Gmail signals only.

Privacy note: `data/gmail-signals.jsonl` and `data/gmail-refresh-status.json` stay gitignored, and static `web/index.html` exports omit local profile and Gmail signal data. The enriched Gmail view is available through the private local dashboard server.

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | - | - |
| Codex Review | `/codex review` | Independent 2nd opinion | 0 | - | - |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | done_with_concerns | OAuth scanner implemented and tested; user OAuth authorization still required; quick suite retains unrelated historical absolute-path failures |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | - | - |

**UNRESOLVED:** Full quick-suite cleanup is blocked by unrelated historical plan/log absolute-path findings.
**VERDICT:** OAuth/CLI scanner is implemented, authorized, dashboard startup is wired to run it, and the local dashboard is serving fresh Gmail-derived signals.
