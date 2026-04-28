# Extension Evaluation Latency Optimization (Phase 1+2) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Reduce p50/p95 latency of the extension → bridge → Codex evaluation path by (a) rejecting short JDs at the extension boundary, (b) exposing `reasoning` and `--search` as env toggles, (c) pre-bundling CV + article-digest + profile into the JD temp file to collapse 4 sequential reads into 1 — all behind a 3-way eval harness that proves the change is safe before merge.

**Architecture:** Two changes in one PR, but the eval harness runs a **3-way matrix** (`baseline` / `Phase1-only` / `Phase1+Phase2`) over a **stratified fixture set** (6 JDs × 3 repetitions = 18 runs per config = 54 Codex invocations total) so latency deltas are attributable AND score regressions are catchable. The extension-side JD_MIN_CHARS gate shifts the denominator of "successful runs," so the harness reports three metrics side-by-side: completion-rate, short-JD-rejection-rate, and latency over successful runs only.

**Tech Stack:** TypeScript (extension + bridge), Node.js (harness script in `.mjs`), Vitest (unit tests for the env toggles + shared constant), Codex CLI (subject under test).

---

## Blocking-Issue Resolution Map

Each reviewer issue is addressed by a specific task below.

| Reviewer issue | Addressed by |
|---|---|
| 1. Sample size too small for p50/p95 | Task 3 (harness design): 6 fixtures × 3 repetitions per config, report shown as mean + range, not p95 |
| 2. Fail-fast changes the denominator | Task 3 (harness output schema): 3 separate metrics — completion-rate, rejection-rate, latency-on-success |
| 3. Fixture coverage shallow | Task 2 (fixture matrix): stratified on archetype × ATS × comp-clarity × legitimacy × search-dependency |
| 4. Combined phases blocks attribution | Task 3 (harness 3-way matrix): `baseline`, `phase1`, `phase1+2` runs side-by-side |
| Rollback doc only in code | Task 9 (rollback doc ships in PR) |
| `JD_MIN_CHARS` drift risk | Task 4 (extension imports from shared contract; no second constant) |
| Prompt enum vs path | Task 6 (env var is a **path**, not an enum) |

---

## Task 1: Worktree + branch setup

**Files:** none (git only)

**Step 1:** Create worktree off `main` (NOT off `feat/cover-letter-generation` — this is independent infra work).

Run: `git worktree add ../career-ops-latency -b feat/latency-phase1-2 main`
Expected: new worktree at `../career-ops-latency`, on branch `feat/latency-phase1-2`.

**Step 2:** `cd ../career-ops-latency && bun install` (runs in root). Verify tests pass on clean baseline.

Run: `bun test`
Expected: all existing tests pass (green baseline).

**Step 3:** Commit the (empty-diff) starting point to anchor the branch.

```bash
git commit --allow-empty -m "chore: branch point for latency phase 1+2"
```

---

## Task 2: Design stratified fixture matrix (addresses Issue 3)

**Files:**
- Create: `tests/eval-fixtures/README.md`
- Create: `tests/eval-fixtures/fixtures.json`
- Create (6 files): `tests/eval-fixtures/jds/{01..06}-*.txt`

**Step 1: Write the fixture manifest**

`tests/eval-fixtures/fixtures.json` (exact structure the harness in Task 3 will consume):

```json
[
  {"id": "01-ai-greenhouse-clear", "archetype": "AI/ML", "ats": "greenhouse", "comp": "present", "legitimacy": "clear", "search_dependent": false, "jd_path": "jds/01-ai-greenhouse-clear.txt"},
  {"id": "02-backend-lever-borderline", "archetype": "Backend", "ats": "lever", "comp": "missing", "legitimacy": "ambiguous", "search_dependent": false, "jd_path": "jds/02-backend-lever-borderline.txt"},
  {"id": "03-ai-linkedin-searchdep", "archetype": "AI/ML", "ats": "linkedin", "comp": "missing", "legitimacy": "ambiguous", "search_dependent": true, "jd_path": "jds/03-ai-linkedin-searchdep.txt"},
  {"id": "04-product-workday-clear", "archetype": "Product-adjacent", "ats": "workday", "comp": "present", "legitimacy": "clear", "search_dependent": false, "jd_path": "jds/04-product-workday-clear.txt"},
  {"id": "05-backend-ashby-redflag", "archetype": "Backend", "ats": "ashby", "comp": "present", "legitimacy": "red-flag", "search_dependent": false, "jd_path": "jds/05-backend-ashby-redflag.txt"},
  {"id": "06-ai-greenhouse-clearhire", "archetype": "AI/ML", "ats": "greenhouse", "comp": "present", "legitimacy": "clear", "search_dependent": false, "jd_path": "jds/06-ai-greenhouse-clearhire.txt"}
]
```

Stratification rationale (why exactly these 6, not 5-8 arbitrary):
- 2 archetypes × 2 ATS families minimum → covers the realistic distribution from `reports/`
- 1 legitimacy red-flag → catches Block G regressions when `--search` is off
- 1 comp-missing + ambiguous → catches Block B specificity loss on weaker reasoning
- 1 search-dependent → this is the canary for `CODEX_BRIDGE_SEARCH=off`; if this fixture's score drops, `--search off` is too aggressive as default
- 1 clear-hire → baseline sanity; score shouldn't drift even under aggressive settings

**Step 2: Populate fixture JDs from existing reports**

Select 6 historical jobs from `reports/` that match the cells above. Copy the captured JD text (from the report's `## Texto completo del puesto` section or the original URL) to each `jds/NN-*.txt`. Each file must be ≥ 1500 chars real JD content.

**Step 3: Write `tests/eval-fixtures/README.md`**

```markdown
# Eval Fixtures

6 stratified JD fixtures for the latency-optimization eval harness. Each fixture represents
one cell of the {archetype × ATS × comp × legitimacy × search-dependency} matrix.

## Adding a fixture
1. Pick a historical JD from `reports/` matching an under-covered cell.
2. Copy JD text to `jds/NN-<slug>.txt` (≥ 1500 chars).
3. Add a row to `fixtures.json` with categorical tags.
4. Re-run `node scripts/run-eval-harness.mjs` — all three configs must pass gates.

## Harness gates (per fixture, per config)
- Global score delta vs baseline ≤ 0.5
- Archetype exact match
- Legitimacy tier exact match
- All Blocks A-G present
```

**Step 4: Commit**

```bash
git add tests/eval-fixtures/
git commit -m "feat: add stratified eval fixture matrix (6 JDs × 5 dims)"
```

---

## Task 3: Build the 3-way eval harness (addresses Issues 1, 2, 4)

**Files:**
- Create: `scripts/run-eval-harness.mjs`
- Create: `scripts/run-eval-harness.test.mjs` (unit tests for scoring/parsing only; real Codex is integration)

**Step 1: Write the harness schema**

Output schema (`eval-results.json`), machine-readable, so attribution is objective:

```json
{
  "generated_at": "2026-04-12T15:30:00Z",
  "configs": ["baseline", "phase1", "phase1_2"],
  "fixtures": ["01-ai-greenhouse-clear", "..."],
  "runs": [
    {"fixture": "01-...", "config": "baseline", "rep": 1,
     "completed": true, "rejected_short_jd": false,
     "latency_ms": 147000, "global_score": 4.3,
     "archetype": "AI/ML Engineering", "legitimacy": "clear"},
    ...
  ],
  "summary": {
    "baseline":   {"completion_rate": 1.0, "rejection_rate": 0.0, "latency_ms_mean": 152000, "latency_ms_min": 140000, "latency_ms_max": 168000},
    "phase1":     {"completion_rate": 1.0, "rejection_rate": 0.0, "latency_ms_mean": 98000,  "latency_ms_min": 89000,  "latency_ms_max": 112000},
    "phase1_2":   {"completion_rate": 1.0, "rejection_rate": 0.0, "latency_ms_mean": 72000,  "latency_ms_min": 65000,  "latency_ms_max": 85000}
  },
  "gates": {
    "score_delta_max": 0.5,
    "archetype_mismatch_count": 0,
    "legitimacy_mismatch_count": 0,
    "passed": true
  }
}
```

**Why mean + min/max, not p95:** 18 samples per config is too few for credible p95. Mean over 3 reps per fixture × 6 fixtures is an honest "typical latency"; min/max shows the variance envelope. If the user still wants p95, they need to 5× the fixture count; document that in the README.

**Step 2: Write the harness driver** (`scripts/run-eval-harness.mjs`)

Key behaviors:
- Reads `tests/eval-fixtures/fixtures.json`.
- For each config in `[baseline, phase1, phase1_2]`:
  - Sets the relevant env vars (`CODEX_BRIDGE_REASONING`, `CODEX_BRIDGE_SEARCH`, `CODEX_BRIDGE_PROMPT_PATH`, `CODEX_BRIDGE_PREBUNDLE=on|off`).
  - For each fixture, runs 3 repetitions.
  - Invokes the bridge HTTP endpoint `POST /v1/evaluate` with `pageText` = fixture content, measures wall-clock.
  - Parses the resulting report from `reports/` for Global score, archetype, legitimacy.
- Writes `eval-results.json` and a human-readable `eval-results.md` summary.
- Exits non-zero if any gate fails (score delta > 0.5, archetype/legitimacy mismatch).

**Metrics reported (splits, per Issue 2):**
- `completion_rate` = completed / (completed + bridge-errors)
- `rejection_rate` = rejected_short_jd / total_invocations
- `latency_ms_*` = computed **only over completed, non-rejected runs**

This makes it impossible to hide a latency improvement that came purely from dropping slow/broken inputs.

**Step 3: Write unit tests** for the result parser (not the Codex call) — parse a synthetic report, assert scores extracted correctly.

Run: `bunx vitest run scripts/run-eval-harness.test.mjs`
Expected: PASS.

**Step 4: Commit**

```bash
git add scripts/run-eval-harness.mjs scripts/run-eval-harness.test.mjs
git commit -m "feat: 3-way eval harness with stratified latency + quality gates"
```

---

## Task 4: Export `JD_MIN_CHARS` for the extension (addresses drift risk)

Good news: the constant already exists at `bridge/src/contracts/jobs.ts:64`. The extension currently hardcodes `400` at `extension/src/background/index.ts:525`.

**Files:**
- Modify: `extension/src/background/index.ts:525`
- Modify (maybe create): a shared path the extension can import from. Check existing extension build setup first.

**Step 1: Write the failing test**

`extension/src/background/index.test.ts` (new or append):

```ts
import { describe, it, expect } from "vitest";
import { JD_MIN_CHARS } from "../../../bridge/src/contracts/jobs";

describe("JD_MIN_CHARS wiring", () => {
  it("extension threshold matches bridge contract", () => {
    expect(JD_MIN_CHARS).toBe(400);
  });
});
```

**Step 2: Run it — expect fail or pass depending on import path**

Run: `bunx vitest run extension/src/background/index.test.ts`
Expected: may fail due to missing import resolution. Fix by configuring a path alias or copying the export into a shared module referenced by both sides (preferred: tsconfig path alias `@contracts/*` → `bridge/src/contracts/*`).

**Step 3: Replace the hardcoded 400**

```ts
// extension/src/background/index.ts (top of file)
import { JD_MIN_CHARS } from "@contracts/jobs";

// line 525, old:
//   if (!captured || captured.pageText.length < 400) {
// new:
  if (!captured || captured.pageText.length < JD_MIN_CHARS) {
```

**Step 4: Re-run tests**

Run: `bunx vitest run`
Expected: all pass.

**Step 5: Commit**

```bash
git add extension/src/background/index.ts extension/src/background/index.test.ts tsconfig.json
git commit -m "refactor: extension imports JD_MIN_CHARS from bridge contract"
```

---

## Task 5: Add `CODEX_BRIDGE_REASONING` env toggle

**Files:**
- Modify: `bridge/src/runtime/config.ts`
- Modify: `bridge/src/adapters/claude-pipeline.ts` (around the codex exec args, lines ~1005-1023)
- Test: `bridge/src/runtime/config.test.ts`

**Step 1: Write the failing test**

```ts
// bridge/src/runtime/config.test.ts (append)
describe("CODEX_BRIDGE_REASONING", () => {
  it("defaults to 'medium' when unset", () => {
    delete process.env.CODEX_BRIDGE_REASONING;
    const c = loadBridgeConfig();
    expect(c.codexReasoning).toBe("medium");
  });
  it("passes 'low' verbatim", () => {
    process.env.CODEX_BRIDGE_REASONING = "low";
    expect(loadBridgeConfig().codexReasoning).toBe("low");
  });
  it("passes 'high' verbatim for rollback", () => {
    process.env.CODEX_BRIDGE_REASONING = "high";
    expect(loadBridgeConfig().codexReasoning).toBe("high");
  });
  it("rejects unknown values loudly", () => {
    process.env.CODEX_BRIDGE_REASONING = "bogus";
    expect(() => loadBridgeConfig()).toThrow(/CODEX_BRIDGE_REASONING/);
  });
});
```

**Step 2:** `bunx vitest run bridge/src/runtime/config.test.ts` — expect FAIL (field doesn't exist).

**Step 3: Implement**

In `bridge/src/runtime/config.ts`, add `codexReasoning: "low" | "medium" | "high"` to the config type, parse from env with default `"medium"`, validate.

In `claude-pipeline.ts` near line 1008, inject the reasoning arg into the codex exec args array:

```ts
args: [
  "exec",
  "--full-auto",
  ...(config.codexSearch ? ["--search"] : []),
  "-c", `model_reasoning_effort="${config.codexReasoning}"`,
  "-C", config.repoRoot,
  // ...
]
```

Note: `--search` and `-c model_reasoning_effort=...` are both global flags; per Codex CLI conventions they go **before** `exec`. Verify by running `codex --help` once — if they go after, swap. The test in Task 7 will catch wiring mistakes.

**Step 4:** `bunx vitest run` — expect PASS.

**Step 5: Commit**

```bash
git commit -am "feat: CODEX_BRIDGE_REASONING env toggle (default medium)"
```

---

## Task 6: Add `CODEX_BRIDGE_SEARCH` env toggle

**Files:**
- Modify: `bridge/src/runtime/config.ts` (add `codexSearch: boolean`, default `false`)
- Modify: `bridge/src/adapters/claude-pipeline.ts:1009` — drop the hardcoded `"--search"`; now conditional on `config.codexSearch`
- Test: `bridge/src/runtime/config.test.ts` (append)

**Step 1: Failing test**

```ts
describe("CODEX_BRIDGE_SEARCH", () => {
  it("defaults to off (--search NOT in args)", () => {
    delete process.env.CODEX_BRIDGE_SEARCH;
    expect(loadBridgeConfig().codexSearch).toBe(false);
  });
  it("'on' turns --search on", () => {
    process.env.CODEX_BRIDGE_SEARCH = "on";
    expect(loadBridgeConfig().codexSearch).toBe(true);
  });
});
```

**Step 2-4:** Implement + verify (same TDD loop as Task 5).

**Step 5: Commit**

```bash
git commit -am "feat: CODEX_BRIDGE_SEARCH env toggle (default off)"
```

---

## Task 7: Integration test — args contain the right flags

**Files:**
- Test: `bridge/src/adapters/claude-pipeline.test.ts` (append)

**Step 1: Failing test**

```ts
it("includes --search only when CODEX_BRIDGE_SEARCH=on", () => {
  const cfg = { ...baseConfig, realExecutor: "codex" as const, codexSearch: false, codexReasoning: "medium" as const };
  const plan = buildExecutionPlan(cfg, { ... });
  expect(plan.args).not.toContain("--search");
  expect(plan.args.join(" ")).toMatch(/model_reasoning_effort="medium"/);

  const cfg2 = { ...cfg, codexSearch: true, codexReasoning: "high" as const };
  const plan2 = buildExecutionPlan(cfg2, { ... });
  expect(plan2.args).toContain("--search");
  expect(plan2.args.join(" ")).toMatch(/model_reasoning_effort="high"/);
});
```

**Step 2-4:** Run, expect fail, wire through, expect pass.

**Step 5: Commit.**

---

## Task 8: Add `CODEX_BRIDGE_PROMPT_PATH` (path, not enum — per review)

**Files:**
- Create: `bridge/prompts/bridge-prompt.md` (trimmed version of `batch/batch-prompt.md` with PDF section removed)
- Modify: `bridge/src/runtime/config.ts` — add `codexPromptPath?: string`
- Modify: `bridge/src/adapters/claude-pipeline.ts` — if `config.codexPromptPath` set, use it; else current default

**Step 1:** Copy `batch/batch-prompt.md` → `bridge/prompts/bridge-prompt.md`. Remove lines 230-319 (`## Paso 4 — PDF opcional` section) since extension path never generates PDFs. Keep everything else byte-identical.

**Step 2: Failing test**

```ts
it("uses CODEX_BRIDGE_PROMPT_PATH when set", () => {
  process.env.CODEX_BRIDGE_PROMPT_PATH = "/tmp/custom-prompt.md";
  expect(loadBridgeConfig().codexPromptPath).toBe("/tmp/custom-prompt.md");
});
it("falls back to default prompt when unset", () => {
  delete process.env.CODEX_BRIDGE_PROMPT_PATH;
  expect(loadBridgeConfig().codexPromptPath).toBeUndefined();
});
```

**Step 3:** Implement. The adapter passes `config.codexPromptPath ?? defaultPromptPath` to `buildCodexPrompt`.

**Step 4:** Verify tests pass.

**Step 5: Commit.**

```bash
git commit -am "feat: CODEX_BRIDGE_PROMPT_PATH env override + bridge-prompt.md variant"
```

---

## Task 9: Rollback documentation (ships in same PR per review)

**Files:**
- Create: `docs/latency-rollback.md`

**Step 1:** Write rollback doc:

```markdown
# Latency Optimization — Rollback

If the Phase 1+2 latency optimization shows quality regressions in production, roll back
per-knob without a deploy:

## Full rollback (restore pre-change behavior)
```bash
export CODEX_BRIDGE_REASONING=high
export CODEX_BRIDGE_SEARCH=on
unset CODEX_BRIDGE_PROMPT_PATH
unset CODEX_BRIDGE_PREBUNDLE    # if Phase 2 pre-bundle is suspect
# restart bridge
```

## Partial rollback — by knob

| Symptom | Knob to flip |
|---|---|
| Block B (CV match) feels generic | `CODEX_BRIDGE_REASONING=high` |
| Block G (legitimacy) misses red flags | `CODEX_BRIDGE_SEARCH=on` |
| Report missing Blocks or malformed | `unset CODEX_BRIDGE_PROMPT_PATH` |
| Output references wrong CV snippets | `unset CODEX_BRIDGE_PREBUNDLE` |

## Escape hatch verification
Re-run the eval harness with the rolled-back env:
```bash
CODEX_BRIDGE_REASONING=high CODEX_BRIDGE_SEARCH=on node scripts/run-eval-harness.mjs --config baseline
```
Scores should match the baseline row in the original PR's `eval-results.md` within ±0.2.
```

**Step 2:** Link this doc from the PR description template and from `bridge/CLAUDE.md` (one-line pointer).

**Step 3: Commit.**

```bash
git add docs/latency-rollback.md
git commit -m "docs: latency rollback runbook"
```

---

## Task 10: Phase 2 — pre-bundled context file

**Files:**
- Modify: `bridge/src/adapters/claude-pipeline.ts` around `buildJdText` (line 909) and wherever the JD temp file is written

**Step 1: Failing test**

```ts
it("pre-bundles CV + article-digest + profile into the JD temp file when enabled", () => {
  const cfg = { ...baseConfig, codexPrebundle: true };
  const jdText = buildJdText(input, cfg, { cvSnippet: "CV HERE", articlesSnippet: "ARTS", profileSnippet: "PROF" });
  expect(jdText).toContain("## Candidate CV\nCV HERE");
  expect(jdText).toContain("## Portfolio proof points\nARTS");
  expect(jdText).toContain("## Candidate profile\nPROF");
});
it("does NOT pre-bundle when disabled (baseline behavior)", () => {
  const cfg = { ...baseConfig, codexPrebundle: false };
  const jdText = buildJdText(input, cfg, {});
  expect(jdText).not.toContain("## Candidate CV");
});
```

**Step 2:** Run — FAIL (function signature changed).

**Step 3: Implement**

- Add `codexPrebundle: boolean` to config (default `false` so baseline runs stay honest).
- Read CV (capped 8KB), article-digest (capped 4KB), profile.yml once at bridge startup; cache.
- When `codexPrebundle=true`, append sections to `buildJdText` output.
- Prompt needs a one-line note: "Candidate context (CV, articles, profile) is inlined below — prefer it over file reads." Add to `bridge-prompt.md` only, not `batch-prompt.md`.

**Step 4:** Verify tests pass; run the eval harness's `phase1_2` config locally on 1 fixture to sanity-check.

Run: `node scripts/run-eval-harness.mjs --config phase1_2 --fixture 01-ai-greenhouse-clear --reps 1`
Expected: completes in < 100s; report contains Blocks A-G; Global score within 0.5 of a recent human eval.

**Step 5: Commit.**

```bash
git commit -am "feat: pre-bundle CV/articles/profile into JD temp file (Phase 2)"
```

---

## Task 11: Run the full 3-way harness and commit results

**Step 1:** Run the harness end-to-end.

Run: `node scripts/run-eval-harness.mjs`
Expected runtime: ~60-90 min (54 Codex invocations × ~90s average). This is a sequential run — do NOT parallelize in the harness; Codex rate limits and reasoning quality are workload-dependent.

**Step 2:** Inspect `eval-results.md`:
- All `gates.passed === true`?
- `phase1` completion_rate === `baseline` completion_rate? (Must be equal — Phase 1 only changes reasoning/search/prompt, not the denominator.)
- `phase1_2` latency mean ≤ 50% of `baseline` mean?
- Score delta ≤ 0.5 for all fixtures × all configs?

**Step 3:** If any gate fails, DO NOT proceed. Triage per Task 9 rollback matrix. If the regression is structural, abort the PR and open an issue.

**Step 4:** Commit the eval artifact.

```bash
git add tests/eval-fixtures/eval-results.json tests/eval-fixtures/eval-results.md
git commit -m "chore: eval harness 3-way results (baseline/phase1/phase1+2)"
```

---

## Task 12: PR description

**Step 1:** Open PR with body including:
1. The 4 reviewer issues verbatim + how each task above addresses them.
2. Link to `docs/latency-rollback.md`.
3. Pasted `eval-results.md` summary table.
4. Explicit call-out: "p95 is NOT reported — sample size (18/config) is insufficient. Mean + min/max is the honest metric; see `tests/eval-fixtures/README.md`."

---

## DRY / YAGNI notes for the executor
- `JD_MIN_CHARS` exists at `bridge/src/contracts/jobs.ts:64` — **do not** create a second constant anywhere.
- The prompt variant is a **file path via env**, not an enum. Don't add a `"bridge"|"batch"` type.
- Do NOT extract `batch/batch-prompt.md`'s PDF section into its own file in this PR — that's deferred to `TODOS.md`.
- Do NOT add a `CODEX_BRIDGE_MODEL` toggle — deferred to `TODOS.md`.
- The eval harness reports mean + min/max, **not p95**. Anyone who says "but I want p95" needs to 5× the fixture count first.

---

## What this plan deliberately does NOT do
- No changes to `batch/` path — regression-locked via the existing batch-runner e2e test.
- No SDK adapter changes — `sdk-pipeline.ts` stays as-is.
- No Playwright changes — extension-side rejection short-circuits before bridge is called.
- No model swap (stays on current Codex default model).
