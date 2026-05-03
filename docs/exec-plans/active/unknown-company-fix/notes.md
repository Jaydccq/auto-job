# Notes: Unknown Company root cause

## Where the value is set

- `scripts/gmail-oauth-refresh.mjs:886` — `company: company || 'Unknown Company'`
- `scripts/gmail-oauth-refresh.mjs:830-847` — candidate list, ordered:
  1. `companyFromAtsSenderName(from)` (display-name strip)
  2. body/subject regex set #1 (`application for X at Y`, `thank you for applying to Y`,
     `interest in Y`, `position at Y`, `- Y`)
  3. body/subject regex set #2 (`applying to ... at Y`, `application to Y`,
     `career opportunities at Y`, `from Y`)
  4. `domainCompany(from.email)` (root-only domain titlecase, with deny-list)
  5. `senderNameCompany(from.name)` (display name `... from Y` / `... at Y` only)
- Helpers (line ranges):
  - `parseEmail` 576
  - `domainCompany` 662 — discards `myworkday`, `lever`, `ashbyhq`, etc.
  - `senderNameCompany` 671
  - `cleanCompany` 680
  - `companyFromAtsSenderName` 691 — only strips `hiring team / recruiting team / talent ...`
  - `isGenericCompany` 729
  - `TRUSTED_RECRUITING_DOMAINS` 36-52

## Live evidence (`data/gmail-signals.jsonl`)

`grep -c '"company":"Unknown Company"' data/gmail-signals.jsonl` → 14 rows.

Sender breakdown of those 14 rows:

| Sender                                                    | Domain         | Tenant in local-part | Tenant in display name | Tenant in subject              |
|-----------------------------------------------------------|----------------|----------------------|------------------------|--------------------------------|
| `donotreply_ms workday <ms@myworkday.com>`                | myworkday.com  | ms (Morgan Stanley)  | yes                    | —                              |
| `Hillary Low <scheduling@ats.rippling.com>` (Formant)     | ats.rippling.com | —                    | —                      | "- Formant"                    |
| `Hongxi Chen <smyhc1@gmail.com>` (self-reply)             | gmail.com      | —                    | —                      | "- Formant" (Re:)              |
| `No Reply Manulife <manulife@myworkday.com>`              | myworkday.com  | manulife             | yes                    | —                              |
| `finra@myworkday.com` (no display name)                   | myworkday.com  | finra                | —                      | —                              |
| `workday unum <unum@myworkday.com>`                       | myworkday.com  | unum                 | yes                    | "At Unum"                      |
| `Colleague Zone <cvshealth@myworkday.com>`                | myworkday.com  | cvshealth (CVS Health) | hidden                 | "Oak Street Health"            |
| `disney@myworkday.com`                                    | myworkday.com  | disney               | —                      | "Disney"                       |
| `workday etsy <etsy@myworkday.com>`                       | myworkday.com  | etsy                 | yes                    | "Etsy"                         |
| `Workday.Admin elekta <elekta@myworkday.com>`             | myworkday.com  | elekta               | yes                    | —                              |
| `kendallgroup@myworkday.com`                              | myworkday.com  | kendallgroup         | —                      | —                              |
| `Workday Microchip <microchiphr@myworkday.com>`           | myworkday.com  | microchiphr (Microchip) | yes                  | —                              |
| `"Workday @ U.S. Bank" <usbank@myworkday.com>`            | myworkday.com  | usbank               | yes                    | —                              |

13 of 14 rows are recoverable from the local-part alone; the 14th is a self-reply (gmail.com)
that should fall back to the parent thread's company (already handled via thread aggregation
once the parent row is fixed).

## Tenant slug map (curated)

```
ms          → Morgan Stanley
cvshealth   → CVS Health
usbank      → U.S. Bank
kendallgroup→ The Kendall Group
microchiphr → Microchip
finra       → FINRA
manulife    → Manulife
unum        → Unum
disney      → The Walt Disney Company
etsy        → Etsy
elekta      → Elekta
```

When the slug is unknown, fall back to `titleCase(slug.replace(/[-_]+/g, ' '))`. Strip
trailing `hr|careers|talent|recruiting|admin` words from the slug before titlecasing
(so `microchiphr` becomes `Microchip`, `usbankhr` becomes `U.S. Bank` once the special
case fires, etc.).

## Multi-tenant ATS domains

```
myworkday.com    (workday cloud HR)
ashbyhq.com      (Ashby)
lever.co
greenhouse.io
greenhouse-mail.io
smartrecruiters.com
talent.icims.com / icims.com
workablemail.com / workable.com
jobvite.com
bamboohr.com
ats.rippling.com / rippling.com
hire.lever.co
```

Single-tenant or non-ATS senders should NOT have local-part interpreted as a company:
linkedin.com, indeed.com, gmail.com, etc.

## Display-name patterns to add

- `^workday[\s.@-]+(.+)$` → tenant
- `^(.+)\s+workday$` → tenant
- `^workday\.admin\s+(.+)$` → tenant
- `^no\s*reply\s+(.+)$` → tenant (e.g. "No Reply Manulife")
- `^donotreply[_\s-]+(\w+)\s+workday$` → tenant (e.g. "donotreply_ms workday")
- `^colleague zone$` → resolve via local-part instead

## Subject + body fallback patterns to add

- `\bYour\s+([A-Z][A-Za-z0-9& .'-]{2,40}?)\s+(?:Careers?|Application)\b` → company
- `\b\|\s*Your application to\s+([A-Z][A-Za-z0-9& .'-]{2,40}?)\s*\|`
- `\bThank you for your interest in joining\s+([A-Z][A-Za-z0-9& .'-]{2,60}?)[.!]`
- `\bThank you for taking the time to explore an opportunity (?:with|at)\s+([A-Z][A-Za-z0-9& .'-]{2,60}?)\b`
- `\bjoining\s+([A-Z][A-Za-z0-9& .'-]{2,60}?)[.!,]`

## Decision: candidate ordering after fix (revised after Codex review)

Subject + body must beat tenant inference, because the tenant name is often the *parent
company* and the user actually applied to a *subsidiary*. Examples from the live JSONL:

| Sender (tenant)                    | Real applied-to company (in subject/body) |
|------------------------------------|-------------------------------------------|
| `cvshealth@myworkday.com`          | Oak Street Health                         |
| `peak6group@myworkday.com`         | Apex Fintech Solutions                    |
| `kiongroup@myworkday.com`          | Dematic                                   |
| `nordstrom@myworkday.com`          | Nordstrom (matches; tenant == subsidiary) |

So the new ordering is:

```
1. companyFromAtsSenderName(from)              // display-name strip (high precision)
2. companyFromExplicitSubject(subject)         // NEW — "X - Application", "Your application to X"
3. companyFromExplicitBody(text)               // NEW — "interest in joining X"
4. body/subject regex set #1 (existing, tightened to forbid generic-prose captures)
5. body/subject regex set #2 (existing, tightened)
6. inferAtsTenantCompany(from)                 // NEW — local-part for multi-tenant ATS
7. domainCompany(from.email)                   // unchanged
8. senderNameCompany(from.name)                // unchanged
```

Tenant inference is the **last high-precision fallback**, behind every signal that names a
specific company in the message itself.

## Generic ATS local-part blocklist (NEW)

These local-parts are shared across all tenants on multi-tenant ATS domains and must NEVER
be interpreted as the company:

```
no-reply, noreply, donotreply, do-not-reply,
notification, notifications, notify, notifier,
mail, mailer, scheduling, scheduler, hello,
support, info, contact, careers, jobs, hr,
talent, recruiting, recruiter, candidate, candidates
```

Plus-tags must be stripped before the blocklist check (`uber+email+abc@talent.icims.com`
→ `uber`).

## Verified false-positive guards

- `ashbyhq.com` rows always have a real display name; `companyFromAtsSenderName` already
  wins (Phase-1 manual check on rows 1, 3, 50). Local-part `no-reply` is in the blocklist.
- `greenhouse-mail.io` rows use `no-reply@us.greenhouse-mail.io`; local-part is in the
  blocklist. Display name carries the company (e.g. `"Acme Hiring Team"`).
- `lever.co` / `hire.lever.co` rows use `no-reply@hire.lever.co`; same pattern.
- `smartrecruiters.com` / `jobvite.com` use `notification@`; same pattern.
- `talent.icims.com` rows use plus-addressed local-parts (`uber+email+...`); strip
  `+...` then check the blocklist — `uber` survives → tenant = "Uber".

## Curated tenant-slug map (revised)

```
ms          → Morgan Stanley
cvshealth   → CVS Health        (subject usually overrides to subsidiary; map is fallback)
usbank      → U.S. Bank
kendallgroup→ The Kendall Group
microchiphr → Microchip
microchip   → Microchip
finra       → FINRA
manulife    → Manulife
unum        → Unum
disney      → The Walt Disney Company
etsy        → Etsy
elekta      → Elekta
peak6group  → Peak6 Group       (subject usually overrides to Apex Fintech Solutions)
kiongroup   → KION Group        (subject usually overrides to Dematic)
snc         → Sierra Nevada Corporation
nordstrom   → Nordstrom
```

Unknown slugs fall back to `titleCase(slug.replace(/[-_]+/g, ' '))`. Strip trailing
`hr|careers|talent|recruiting|admin` words from the slug before titlecasing.

## Backfill applicationKey diff gate (NEW)

Backfill must:

1. Load existing signals.
2. Compute `selectBestCompanyAndRole` per thread under both old and new signal contents.
3. Print the per-thread `applicationKey` change (old → new) before applying.
4. With `--dry-run`, exit without writing.
5. Without `--dry-run`, write `data/gmail-signals.jsonl` atomically and *also* write the
   diff log to `data/gmail-signals.backfill-log.jsonl` (gitignored, for audit).

Signals do not carry `applicationKey` themselves — that field is built later in
`scripts/gmail-applications.mjs::buildApplicationRecord`. The diff is computed by running
`buildApplications` over old vs new rows.

## Tests to add (revised)

`scripts/gmail-oauth-refresh.test.mjs`:
- `inferAtsTenantCompany`:
  - returns "Disney" for `disney@myworkday.com`
  - returns "Microchip" for `microchiphr@myworkday.com`
  - returns "U.S. Bank" for `usbank@myworkday.com`
  - returns "Unum" for `unum@myworkday.com`
  - returns "Uber" for `uber+email+3ucw0-ead611133c@talent.icims.com` (plus-tag strip)
  - returns "" for `noreply@gmail.com` (not multi-tenant ATS)
  - returns "" for `no-reply@hire.lever.co` (generic local-part blocklist)
  - returns "" for `notification@smartrecruiters.com`
  - returns "" for `notification@jobvite.com`
  - returns "" for `mail@ats.rippling.com`
  - returns "" for `scheduling@ats.rippling.com`
- `companyFromAtsSenderName`:
  - returns "Etsy" for display name `"workday etsy"`
  - returns "Microchip" for `"Workday Microchip"`
  - returns "Manulife" for `"No Reply Manulife"`
  - returns "U.S. Bank" for `"Workday @ U.S. Bank"`
  - returns "Elekta" for `"Workday.Admin elekta"`
- `extractSignalFromMessage` end-to-end:
  - Etsy rejection email → company "Etsy" (subject contains "Etsy")
  - Oak Street Health row (`cvshealth@myworkday.com`) → company "Oak Street Health"
    (subject must beat tenant)
  - Apex Fintech row (`peak6group@myworkday.com`) → "Apex Fintech Solutions"
  - Dematic row (`kiongroup@myworkday.com`) → "Dematic"
  - Nordstrom row → "Nordstrom" (not "Seattle")
  - SNC row → "Sierra Nevada Corporation" (not "Sierra Nevada Corporation - Application Update")
  - New Lantern Ashby row → "New Lantern" (already covered by display-name strip; regression
    test to lock that in)

`scripts/backfill-unknown-company.test.mjs`:
- dry-run does not write the file
- rewrites only `Unknown Company` and broken-prose company rows
- is idempotent (second run is a no-op)
- emits applicationKey diff log in non-dry mode

## Backfill strategy

`scripts/backfill-unknown-company.mjs`:

1. Read `data/gmail-signals.jsonl`.
2. For each row where `company === 'Unknown Company'`:
   - Re-derive company from `sender` (parse name+email) + `subject` + `summary` using the
     same helpers as the live extractor.
   - If new value is non-generic, write back; otherwise leave row untouched.
3. Re-derive `applicationKey`, `recentContact`, `confidence` accordingly.
4. Print a `--dry-run` summary table; without `--dry-run`, rewrite atomically.
5. After rewrite, suggest `npm run dashboard:build`.

Idempotent: on a second run, no rows are updated.

## Tests to add

- `scripts/gmail-oauth-refresh.test.mjs`:
  - `inferAtsTenantCompany` returns "Disney" for `disney@myworkday.com`.
  - returns "Microchip" for `microchiphr@myworkday.com`.
  - returns "U.S. Bank" for `usbank@myworkday.com`.
  - returns "Unum" for `unum@myworkday.com`.
  - returns "" for `noreply@gmail.com` (not a multi-tenant ATS).
  - `companyFromAtsSenderName` returns "Etsy" for display name `"workday etsy"`.
  - returns "Microchip" for `"Workday Microchip"`.
  - returns "Manulife" for `"No Reply Manulife"`.
  - end-to-end `extractSignalFromMessage` returns company "Etsy" for the Etsy
    rejection email payload.
- `scripts/backfill-unknown-company.test.mjs`:
  - dry-run does not write the file.
  - rewrites only Unknown Company rows.
  - is idempotent.
