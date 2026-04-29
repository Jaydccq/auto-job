# Gmail Application Tracker Review

## Background

The user asked to inspect the job application tracker with Gmail context for `smyhc1@gmail.com`. The repository tracker is `data/applications.md`; Gmail is an external signal source and must not become durable project state unless findings are recorded here or in another repo artifact.

## Goal

Identify active application rows from the repository tracker and summarize fresh Gmail hiring/application signals that may change follow-up or prioritization.

## Scope

- Read `data/applications.md` and related tracker docs.
- Search Gmail for recent job application, recruiter, interview, rejection, and application-update messages.
- Do not send, archive, delete, label, or otherwise mutate Gmail.
- Do not submit applications.

## Assumptions

- "Application tracker" means the canonical tracker at `data/applications.md`.
- "All jobs" means current tracker rows, with emphasis on non-`SKIP` rows and recent/high-score applications.
- Gmail read state and snippets are sufficient for a first-pass signal scan unless a message needs body/thread expansion.

## Implementation Steps

1. Read repository tracker structure and current application rows.
   Verify: parse status counts and top active rows from `data/applications.md`.
2. Search Gmail for recent hiring/application signals.
   Verify: record query scope, result count sampled, and any expanded message/thread reads.
3. Cross-reference Gmail signals with tracker companies where possible.
   Verify: produce an actionable summary of active applications, fresh signals, and gaps.
4. Update this plan with progress, decisions, verification, and final outcome.
   Verify: plan contains the final scan scope and outcome.

## Verification Approach

- Run repository parsing commands/scripts against `data/applications.md`.
- Use Gmail-native search with explicit query scopes.
- Report any limitations from narrowed Gmail coverage.

## Progress Log

- 2026-04-25: Created plan after confirming the tracker file exists and reading project/Gmail instructions.
- 2026-04-25: Confirmed Gmail connector is authenticated as `smyhc1@gmail.com`.
- 2026-04-25: Parsed `data/applications.md`: 248 tracker rows before updates; status counts were 105 `SKIP`, 101 `Evaluated`, 42 `Applied`.
- 2026-04-25: Searched Gmail with recent application, interview, rejection, action-required, and LinkedIn application-confirmation queries scoped to messages after 2026-04-01.
- 2026-04-25: Read 15 shortlisted Gmail messages for Arista, Remitly, Arrivia/Provn, Uber, Appian, Foresight Health, Qualcomm, LendingClub, New Lantern, Disney, and Manulife.
- 2026-04-25: Updated exact tracker matches from Gmail signals: Grant Street Group, Verkada, and KeyBank to `Applied`; LendingClub to `Rejected`.
- 2026-04-25: Verified tracker health with `node verify-pipeline.mjs`: 0 errors; 2 existing duplicate warnings remained.
- 2026-04-25: Rebuilt dashboard with `npm run dashboard:build`; `web/index.html` now reflects the tracker updates.

## Key Decisions

- Keep Gmail read-only; update existing tracker rows only when a fresh Gmail signal exactly matches company and role.
- Treat exact company+role Gmail confirmations as sufficient to update existing tracker status.
- Do not update ambiguous matches where Gmail role text differs from tracker role text, such as Uber variants, Qualcomm, Disney, Sierra, Loop, and Manulife.
- Do not add new tracker rows directly from Gmail; new rows must use the repository's TSV merge flow if the user wants them tracked.

## Risks and Blockers

- Gmail search may return sampled or narrowed results, so conclusions must state coverage.
- Gmail account identity was confirmed as `smyhc1@gmail.com`.
- `data/applications.md` is intentionally ignored by Git as user-layer state, so the canonical local tracker was updated but will not appear in normal Git diffs.
- Several Gmail applications were not present as exact tracker rows and need separate triage if the user wants comprehensive backfill.

## Final Outcome

- Gmail scan found one scheduled interview, several action-required items, many application confirmations, and several rejection/closed signals.
- Highest-priority actions: attend Arista exploratory/video interview on 2026-04-29 at 3:15 PM PDT; complete Remitly Candidate Home personal-information task; complete Arrivia/Provn and New Lantern coding challenges by 2026-04-30 if still desired.
- Tracker now shows 248 rows: 105 `SKIP`, 98 `Evaluated`, 44 `Applied`, and 1 `Rejected`; non-terminal active count is 142.
- Dashboard snapshot was regenerated for 345 reports, 248 applications, 508 pipeline items, and 1,274 scan-history entries.
