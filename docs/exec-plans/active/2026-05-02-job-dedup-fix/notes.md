# Notes: Job Dedup Investigation

## A. Existing Dedup Surfaces

### Scanners (CLIENT side, before bridge)
| File | Function | Key | Source-of-truth check? |
|------|----------|-----|------------------------|
| `scripts/newgrad-scan-autonomous.ts:1264` | `dedupeRows()` | normalizeUrl ∥ company\|title | ❌ batch-only |
| `scripts/newgrad-scan-autonomous.ts:1281` | `normalizeUrl()` | sort query, drop hash | local impl |
| `scripts/job-board-scan-bb-browser.ts:1041` | `dedupeRows()` | normalizeUrl ∥ company\|title | ❌ batch-only |
| `scripts/job-board-scan-bb-browser.ts:1061` | `dedupePipelineEntries()` | candidateEvaluationKey | ❌ batch-only |
| `scripts/linkedin-scan-bb-browser.ts:2259` | `dedupeRows()` | normalizeUrl ∥ company\|title | ❌ batch-only |
| `scripts/linkedin-scan-bb-browser.ts:2292` | `dedupePipelineEntries()` | composite keys | ❌ batch-only |
| `scripts/linkedin-scan-bb-browser.ts:2467` | `normalizeUrl()` | local impl | local impl |
| `scan.mjs:573` | `normalizeScanUrl()` | strip utm + path collapse | local impl |
| `scan.mjs:508` | `loadSeenUrls()` | reads scan-history + pipeline + applications + reports | ✅ used early |
| `scan.mjs:548` | `loadSeenCompanyRoles()` | normalizeIdentityValue | ✅ used early |

### Server (BRIDGE side, after extraction)
| File | Function | Key | Notes |
|------|----------|-----|-------|
| `apps/server/src/adapters/job-identity.ts:38` | `createJobIdentity()` | url > source:jobId > company\|role > content hash | canonical |
| `apps/server/src/adapters/job-identity.ts:63` | `normalizeJobUrl()` | calls `canonicalizeJobUrl()` | canonical |
| `apps/server/src/adapters/job-identity.ts:67` | `jobCompanyRoleKey()` | normalize + ‘\|’ | canonical |
| `apps/server/src/adapters/newgrad-scan-history.ts:46` | `loadNewGradSeenKeys()` | scan-history + pipeline + reports | ✅ |
| `apps/server/src/adapters/newgrad-scan-history.ts:38` | `wasNewGradRowSeen()` | url ∨ company\|role | ✅ |
| `apps/server/src/adapters/newgrad-scan-history.ts:57` | `appendNewGradScanHistory()` | excludes `promoted` | ⚠ promoted leaks |
| `apps/server/src/adapters/claude-pipeline.ts:873` | `scoreNewGradRows()` | uses `wasNewGradRowSeen()` AFTER scoring | ⚠ too late |

### Tracker / Merge
| File | Function | Key | Notes |
|------|----------|-----|-------|
| `merge-tracker.mjs:177` | dup search | report# ∨ num ∨ normCompany+role overlap | ❌ stale `existingApps` |
| `merge-tracker.mjs:35` | `normalizeCompany()` | strip non-alnum, lowercase | local impl |
| `apps/server/src/adapters/claude-pipeline.ts:831` | `readTrackerTail()` | parse table by row count | no URL field |
| `web/dashboard-handlers.mjs:1479` | `updateApplicationsMarkdownStatus()` | match by `num` only | ⚠ doesn't promote dup rows |

## B. Smoking Gun: `data/applications.md` rows 587 and 588

```
| 587 | 2026-05-02 | Qualcomm | Machine Learning Engineer - College Graduate | 4.3/5 | Evaluated | ❌ | [588](reports/588-qualcomm-2026-05-02.md) | …
| 588 | 2026-05-02 | Qualcomm | Machine Learning Engineer - College Graduate | 4.3/5 | Evaluated | ❌ | [588](reports/588-qualcomm-2026-05-02.md) | …
```

Both rows share report number `588`. Merge-tracker.mjs SHOULD have collapsed
them by `additionReportNum`. Why didn't it?

**Root cause**: `merge-tracker.mjs:144-148` snapshots `existingApps` once
before the loop, then only mutates `trackerLines`/`newRows`. When two TSVs
in the same merge run reference the same report number, the first one
gets added to `newRows` (no match in `existingApps`), the second one ALSO
fails to find a match (still searching the original snapshot, not the
just-added row), so both end up as new rows.

This means: any time the bridge writes two TSVs for the same job in the
same scan window (e.g. quick-screen + full eval, or duplicate detail
extraction), both land as separate rows in the tracker.

## C. Why Mark Applied "fails"

The dashboard sends `POST /dashboard/api/apply-status { num, applied }`.
`updateApplicationsMarkdownStatus` finds the row by `num` (column 1)
and flips status to `Applied`. The call SUCCEEDS.

But on next dashboard refresh, the user still sees a row labelled
`Qualcomm – Machine Learning Engineer – College Graduate` with status
`Evaluated`. That is the OTHER duplicate row (#587 vs #588). The mark
worked — on one row. The duplicate looks like it failed.

## D. Inconsistent URL canonicalization

Four independent normalizers exist:
1. `apps/server/src/adapters/job-identity.ts` `normalizeJobUrl()` (canonical)
2. `scan.mjs:573` `normalizeScanUrl()` (utm strip + path collapse)
3. `scripts/newgrad-scan-autonomous.ts:1281` `normalizeUrl()` (sort+hash)
4. `scripts/linkedin-scan-bb-browser.ts:2467` `normalizeUrl()` (sort+hash)

Same URL in different scanners → different keys → cross-scanner dedup
fails (e.g. linkedin sees a job, jobright sees the same job at a
different tracking-param-bearing URL → both get processed).

## E. Why the bridge check is "too late"

`claude-pipeline.ts:873` `scoreNewGradRows()` calls `wasNewGradRowSeen()`
AFTER `loadNewGradSeenKeys()` is fetched and BEFORE scoring — but the
scanner has already done extraction work (detail navigation, screenshots,
JD storage). So the user pays for extraction even on duplicates.

For browser-based scanners this is significant — opening 50 detail pages
per scan takes minutes, blows the bb-browser session budget, and risks
rate-limiting from upstream sites.

## F. Plan

### Phase 3a: Shared identity module
- Build `packages/shared/src/job-identity.ts` exporting:
  - `normalizeJobUrl(value: string): string`
  - `jobCompanyRoleKey(company: string, role: string): string`
  - `createJobIdentity()` (re-use logic from
    `apps/server/src/adapters/job-identity.ts`)
- Have `apps/server/src/adapters/job-identity.ts` re-export from the
  shared package.
- Provide a `.mjs`-compatible runtime via tsx loader (already used for
  scripts) OR ship a small JS-only mirror in `lib/job-identity.mjs`.

### Phase 3b: Dedup-first in scanners
For each scanner, the new flow becomes:
```
1. extract list (cards only — title, company, link)
2. load seenKeys from scan-history.tsv + pipeline + applications + reports
3. filter cards: drop any whose canonicalUrl OR companyRole is seen
4. record extraction count BEFORE filtering and "filtered_known" count AFTER
5. only NOW: detail-extract the survivors
6. score → enrich → evaluate
7. append surviving terminal+promoted rows to scan-history.tsv
```

Files to refactor:
- `scripts/newgrad-scan-autonomous.ts`
- `scripts/job-board-scan-bb-browser.ts`
- `scripts/linkedin-scan-bb-browser.ts`
- `scan.mjs` (already has the right shape but uses local normalizer →
  swap to shared `normalizeJobUrl`)

### Phase 3c: merge-tracker.mjs in-loop fix
Mutate `existingApps` as new rows are added so subsequent additions
in the same run can match them.

```js
// after pushing newRows entry:
existingApps.push({
  num: entryNum, date: addition.date, company: addition.company,
  role: addition.role, score: addition.score, status: addition.status,
  pdf: addition.pdf, report: addition.report, notes: addition.notes,
  raw: newLine,
});
```

### Phase 3d: Mark-applied resilience + backfill
- Update `updateApplicationsMarkdownStatus` to: after flipping the
  matched row, also flip every other row that shares
  (a) the same report number, OR
  (b) the same normalized company AND overlapping role.
- One-shot script: `scripts/dedupe-tracker-rows.mjs` to collapse
  existing duplicates (e.g. 587/588). Run once, manually.

### Phase 4: Verification
- Tests:
  - `apps/server/src/adapters/job-identity.test.ts` — same input across
    canonicalizers must produce equal keys.
  - `apps/server/src/batch/merge-tracker.test.ts` — two consecutive
    additions referencing same report number → one row.
  - `apps/server/src/dashboard/apply-status.test.ts` (new) — when
    duplicate rows exist, applying one promotes them all.
  - Scripts smoke tests (read-only): scanner dedup-first respects seen.
- `npm run verify` (ownership + workspace builds + typecheck).
