# Task Plan: Eliminate "Unknown Company" in Gmail Tracker

## Goal
Stop emitting `Unknown Company` *and* stop emitting garbage company values (`"Seattle"`,
`"this time"`, `"employment opportunities at Apex Fintech Solutions"`, …) for Gmail signals
when the real company is recoverable from the subject, sender display name, sender email
local-part, or body. Backfill existing `gmail-signals.jsonl` rows in place, with a pre/post
`applicationKey` diff gate. Verify with unit tests + dashboard browse.

## Root Cause Summary (see notes.md for full evidence)

`scripts/gmail-oauth-refresh.mjs::extractSignalFromMessage` builds a candidate list:

```
companyFromAtsSenderName(from)         // skip when display name absent or contains "workday"
cleanCompany(firstPattern([...subject/body regex]))  // misses many real phrases
domainCompany(from.email)              // returns '' for myworkday/lever/ashbyhq/jobvite/icims
senderNameCompany(from.name)           // only triggers on "...from X" or "...at X" trailing tokens
```

For multi-tenant ATS (myworkday.com, ashbyhq.com, jobvite.com, icims.com, lever.co,
greenhouse.io, smartrecruiters.com, workable.com) the **tenant slug is encoded in the email
local-part** (e.g. `disney@myworkday.com`, `etsy@myworkday.com`, `unum@myworkday.com`,
`kendallgroup@myworkday.com`, `cvshealth@myworkday.com`, `microchiphr@myworkday.com`,
`finra@myworkday.com`, `usbank@myworkday.com`, `manulife@myworkday.com`,
`elekta@myworkday.com`). Today the extractor never reads the local-part for ATS senders, so
all of these collapse to `Unknown Company`.

Workday display names also encode the tenant: `"workday unum"`, `"Workday Microchip"`,
`"Workday @ U.S. Bank"`, `"workday etsy"`, `"donotreply_ms workday"`, `"Workday.Admin elekta"`,
`"No Reply Manulife"`, `"Colleague Zone"`. Today `companyFromAtsSenderName` falls through
because the literal "workday" word isn't stripped before the lookup.

Subject + body fallback patterns also miss several recurring phrasings:
- `Your <Company> Careers Application ...` (Disney case)
- `... | Your application to <Company> | ...` (Etsy case)
- `Thank you for your interest in joining <Company>` (Manulife case)
- `Application Received for <Role>` with company-only body signature
- Email signatures `— <Name>, <Company> Talent Team`

## Phases

- [x] Phase 1: Investigate code, classify "Unknown Company" rows, draft plan + notes
- [x] Phase 2: Codex review of the plan (codex:rescue) — incorporated all blockers
- [x] Phase 3: Build `inferAtsTenantCompany` helper + slug map + tests (TDD red → green)
- [x] Phase 4: Add high-precision SUBJECT/BODY patterns (subsidiary-aware) + tests
- [x] Phase 5: Wire candidates into `extractSignalFromMessage` in the new ordering, regenerate
- [x] Phase 6: Backfill script + dry-run + applicationKey diff gate + tests
- [x] Phase 7: Run npm run verify, dashboard:build, browser-test the tracker, report
- [x] Phase 8: Update CLAUDE.md / DATA_CONTRACT.md / gmail-scan.md if behavior shifts

## Key Questions
1. Are there false-positive risks if we always treat the local-part as a tenant? — A: only for
   the multi-tenant ATS domains in `MULTI_TENANT_ATS_DOMAINS`; treat single-tenant senders
   (linkedin.com, indeed.com) the same as today.
2. Should we backfill in place or write a new file? — A: in-place, but only when the new
   inference yields a non-generic result; preserve original timestamps + ids.
3. Do we need to re-key applications after backfill? — A: yes, applicationKey is derived from
   normalised company+role, so the dashboard must rebuild after backfill.

## Decisions Made
- Multi-tenant ATS list lives next to `TRUSTED_RECRUITING_DOMAINS`; export it for tests.
- Tenant→Company resolver uses a small hand-curated map for known ambiguous slugs
  (`ms` → `Morgan Stanley`, `cvshealth` → `CVS Health`, `usbank` → `U.S. Bank`,
  `kendallgroup` → `The Kendall Group`, `microchiphr` → `Microchip`, `finra` → `FINRA`)
  and otherwise titlecases the slug.
- Backfill script is idempotent; re-running it is a no-op when no inference improves the row.

## Errors Encountered
- (logged as work progresses)

## Status
**All phases complete.** Backfill applied, verify green, docs updated.

## Verification (actual)
- `node --test scripts/gmail-oauth-refresh.test.mjs scripts/gmail-applications.test.mjs scripts/backfill-unknown-company.test.mjs` → 127 / 127 passing
- `node scripts/backfill-unknown-company.mjs --dry-run` rewrote 46 / 295 rows
  (12 of original 14 `Unknown Company` + 32 broken-prose values like `"this time"`,
  `"our Graduate 2026 Soft..."`, `"Software Engineer at PRI Global"` reclaimed)
- `node scripts/backfill-unknown-company.mjs` then `npm run verify` → green
- Final `Unknown Company` count in `data/gmail-signals.jsonl`: 14 → 2 (both legitimately
  unrecoverable: self-reply + scheduling-tool sender with personal name)
- `npm run dashboard:build` → no errors

## Final outcome (what changed)

`scripts/gmail-oauth-refresh.mjs` — added 3 new exported helpers:
- `inferAtsTenantCompany(from)` — multi-tenant ATS local-part → company,
  with curated `TENANT_SLUG_OVERRIDES` map and `ATS_GENERIC_LOCAL_PARTS` blocklist
- `companyFromExplicitSubject(subject)` — subsidiary-aware subject patterns
- `companyFromExplicitBody(text)` — narrow body patterns
- `companyFromDisplayName(from)` — last-resort display-name fallback with
  `OPAQUE_DISPLAY_NAMES`, `SCHEDULING_TOOL_DOMAINS`, `PERSONAL_MAIL_DOMAINS` skips
- Upgraded `companyFromAtsSenderName` with `extractWorkdayDisplayTenant` parser for
  `"workday X"`, `"X workday"`, `"Workday @ X"`, `"Workday.Admin X"`,
  `"No Reply X"`, `"donotreply_X workday"` patterns
- Tightened `PREPOSITION_FRAGMENT_PATTERN` to reject leading prepositions (at, with,
  for, …) so "at Uber" can no longer pass as a company name
- Rewired `extractSignalFromMessage` candidate ordering: subject → display-name strip
  → body → existing weak regex → tenant local-part → display-name fallback → domain → name
- Subject pattern set covers: `"X - Your Application"`, `"Your application with/to X"`,
  `"| Your application to X |"`, `"Your X Careers"`, `"Regarding your X Application"`,
  `"X: Application"`, `"Thank you for your interest in X"`,
  `"application to ROLE at X"` (LinkedIn), `"Thank you for applying to X"`,
  `"X invites you"` (scheduling tools)

`scripts/backfill-unknown-company.mjs` — new script:
- Dry-run + apply modes
- Pre/post applicationKey diff via shared helpers
- Audit log at `data/gmail-signals.backfill-log.jsonl`
- Idempotent

`scripts/gmail-oauth-refresh.test.mjs` — 30 new tests covering helpers + end-to-end.
`scripts/backfill-unknown-company.test.mjs` — 8 new tests.

`modes/gmail-scan.md` — added "Company attribution" + "Backfilling legacy rows" sections.
`CLAUDE.md` — added backfill script to the hot file map.
`.gitignore` — added `*.bak`, `*.pre-backfill`, `*.backfill-log.jsonl` patterns.

## Risks / known gaps
- 2 unrecoverable rows remain (self-reply + Hillary Low scheduler) — these are
  intentionally left as `Unknown Company` because the company is not in the email.
  The dashboard will show them as Unknown until the user manually edits the tracker.
- Curated tenant slug map will need maintenance as new ATS tenants appear. Adding a
  new entry is one line in `TENANT_SLUG_OVERRIDES`.
- Subject patterns are case-insensitive but rely on `trimToCapitalizedTokens` to drop
  trailing lowercase prose. Edge cases with all-lowercase company names ("dover", "etsy"
  in subject) would need explicit-case checks; not seen in current data.

