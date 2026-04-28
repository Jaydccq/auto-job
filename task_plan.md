# Task Plan: Fix 4 blocking issues in latency-optimization eng plan

## Goal
Address 4 reviewer issues (measurement rigor, fail-fast bias, fixture coverage, attribution) in the Phase 1+2 latency eng-review plan BEFORE implementation, then produce a revised plan that is safe to execute.

## Context
- Source plan: `~/.gstack/projects/Jaydccq-career-ops/hongxichen-feat-cover-letter-generation-eng-review-test-plan-20260412-152343.md`
- Deferred items: `TODOS.md`
- Branch: `jd-extension-work` (sibling to `feat/cover-letter-generation`)
- Scope: extension-side JD_MIN_CHARS gate + bridge reasoning/search env toggles + pre-bundled context file + eval harness

## The 4 Blocking Issues (from reviewer)

### Issue 1 — Sample size too small for p50/p95
**Problem:** 5-8 fixtures run once cannot support p95 latency claims.
**Resolution required:** Either repeat each fixture 3-5× OR expand fixtures to 20+. Plan must specify which.

### Issue 2 — Fail-fast changes the denominator
**Problem:** Extension-first short-JD rejection removes slow/broken inputs from the sample, making "latency improved" misleading.
**Resolution required:** Report must split metrics:
- Completion success rate
- JD_TOO_SHORT rejection rate
- Latency distribution over **successful** samples only

### Issue 3 — Fixture coverage is shallow
**Problem:** Not just count — need stratified coverage.
**Resolution required:** Fixture set must cover:
- Multiple archetypes (AI/ML, Backend, Product-adjacent)
- Multiple ATS sources (Greenhouse, LinkedIn, Workday, Lever/Ashby)
- Comp info present vs missing
- Legitimacy clear vs ambiguous
- At least 1 case that historically relied on `--search` for enrichment (regression risk for `--search off`)

### Issue 4 — Phase 1 + Phase 2 combined blocks attribution
**Problem:** Can't tell which change caused the delta if bundled.
**Resolution required:** Harness must run 3-way matrix, not 2-way:
- `baseline` (reasoning=high, --search on, full prompt, 4 reads)
- `baseline + reasoning/search change` (Phase 1 only)
- `final combined` (Phase 1 + Phase 2 context pre-bundle)

## Secondary items to bake in
- Rollback doc for `CODEX_BRIDGE_REASONING` / `CODEX_BRIDGE_SEARCH` ships WITH the PR (not after)
- `JD_MIN_CHARS` as a shared constant between extension and bridge (single source of truth)
- Prompt selection via path, not enum

## Phases
- [x] Phase 0: Read source plan + TODOS, extract 4 issues verbatim
- [ ] Phase 1: Write revised measurement methodology (addresses Issues 1, 2, 4)
- [ ] Phase 2: Design stratified fixture matrix (addresses Issue 3)
- [ ] Phase 3: Write revised eng-review test plan as deliverable
- [ ] Phase 4: Present to user for approval BEFORE any code changes

## Key Questions (must answer before coding)
1. How many fixtures × how many repetitions? (3-5× over 8 fixtures = 24-40 runs per config × 3 configs = 72-120 Codex invocations. Cost?)
2. Where does the stratified fixture set live on disk? (`tests/eval-fixtures/` structure)
3. What is the single TSV/JSON schema the harness emits so attribution is machine-readable?
4. Where does the shared `JD_MIN_CHARS` constant live? (Proposal: `shared/constants.mjs`)
5. How is the rollback doc discoverable? (Proposal: `docs/latency-rollback.md` linked from PR description)

## Decisions Made
- (pending Phase 1)

## Errors Encountered
- (none yet)

## Status
**Phase 0 complete.** Moving to Phase 1 — write revised measurement methodology in `notes.md`.
