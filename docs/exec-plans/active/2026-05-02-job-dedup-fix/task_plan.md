# Task Plan: Fix Job Dedup (URL-First, Scan-First)

## Goal
Every scanner consults a single source-of-truth dedup ledger BEFORE doing any
extraction, scoring, screenshot, or evaluation work. URL is the primary
identity. Mark-applied in apply-next no longer "fails" because there are
no longer two tracker rows for the same job.

## Phases
- [x] Phase 1: Map current dedup logic + write canonical plan
- [x] Phase 2: Codex review of the plan
- [x] Phase 3a: Carve shared job-identity-runtime module (consumable from .mjs and .ts)
- [x] Phase 3b: Make scanners dedup-first (newgrad, linkedin, jobright, scan.mjs)
- [x] Phase 3c: Fix merge-tracker.mjs (in-loop existingApps mutation + stale dup.raw)
- [x] Phase 3d: Mark-applied resilience (report-number-only) + 587/588 repair
- [x] Phase 4: Tests, `npm run verify`, update canonical plan

## Key Questions
1. Does scan-history.tsv get URLs from every scanner consistently?
   → No. linkedin and jobright scanners write rows via the bridge after
   scoring; scan.mjs writes its own; newgrad-scan-autonomous.ts goes
   through the bridge. URL canonicalization differs per call site.
2. Why does Mark applied "fail"?
   → Tracker has DUPLICATE rows for the same job (e.g. rows 587 + 588
   both reference report `[588]`). User marks one, the other stays
   `Evaluated`, looking like the click had no effect.
3. Can we add a URL column to the tracker without breaking existing tools?
   → No, schema change is high-blast-radius. Solution: store URL in
   tracker-additions and use it for collapse during merge; keep tracker
   row schema unchanged for now.

## Decisions Made
- **Canonical key = `createJobIdentity().stableKey`** (canonicalUrl >
  source:sourceJobId > company|role > content hash). Codex review
  pointed out URL-first alone is brittle (different ATS reposts, same
  URL serving different roles over time), and the codebase already
  has the right 4-level hierarchy.
- **Source of truth for canonicalization**: `apps/server/src/adapters/job-identity.ts`
  → re-export to a path importable from both `.ts` and `.mjs` scripts.
- **Merge-tracker has TWO bugs**:
  (a) `existingApps` is snapshotted once → in-loop additions don't
      participate in dedup;
  (b) on UPDATE, `dup.raw` becomes stale so a later same-job TSV does
      `trackerLines.indexOf(dup.raw)` → -1 and silently does nothing.
  Fix both.
- **Mark-applied promotion = ONLY report-number match**. The
  company+role-overlap heuristic is fine for write-time merge dedup
  but UNSAFE for status promotion (co-promotes "Software Engineer I"
  / "Software Engineer II").
- **One-shot 587/588 repair via dedupe-tracker-rows script** (existing
  `dedup-tracker.mjs` is sufficient — re-use, don't rewrite).
- **No schema migration of applications.md**: keep 9-column shape.

## Status
**Done.** All phases complete. `npm run verify` is green: 0 errors, 1
pre-existing Anduril warning unrelated to this fix. 16 duplicate rows
repaired in `data/applications.md` including the smoking-gun 587/588.

## Errors Encountered
- (running log; populate during execution)

## Verification Targets
- Unit tests: `apps/server/src/adapters/job-identity.test.ts` (extended),
  `apps/server/src/batch/merge-tracker.test.ts` (extended), new
  `scripts/__tests__/*.test.ts` for scanner dedup-first.
- Functional: regenerate dashboard, click Mark applied on a known
  duplicate, watch all dups flip to Applied.
- Repo guard: `npm run verify`.
