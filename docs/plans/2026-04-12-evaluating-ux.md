# Extension "Evaluating" UX Overhaul — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the extension's "Evaluating (A-F blocks)" phase feel fast and informative, even when the underlying Codex call still takes 2-4 minutes, by combining (a) true intra-phase progress signal, (b) non-blocking UX so the popup can close without killing the job, (c) aggressive latency reduction with an eval-harness safety net, and (d) honest time estimates so users stop wondering "is it stuck?"

**Architecture:** Three complementary layers — UX feedback (streamed sub-phases + elapsed/ETA counter + close-and-come-back), latency reduction (reasoning/search env toggles + prompt trim + context pre-bundle), and measurement (3-way eval harness over stratified fixtures). The UX changes alone fix the perceived-wait problem even if latency improvements underperform; the latency changes alone don't — so UX work ships first.

**Tech Stack:** TypeScript (extension popup/panel/background), Node.js + Fastify (bridge HTTP + SSE), Codex CLI (evaluator), Vitest (tests), Node child_process (harness).

---

## Problem Diagnosis (why the current UX feels broken)

Evidence from the code, not speculation:

1. **`evaluating` is one opaque phase in `PHASE_ORDER`** (`extension/src/shared/utils.ts:22-30`). It flips to "active" once and stays active for the entire Codex run. No intra-phase events reach the popup.
2. **The popup has no elapsed/ETA counter.** `renderPhases`/`appendPhase` (`extension/src/popup/index.ts:450-510`) render a static checkbox list — the user has no idea if 30s in = normal or stuck.
3. **Closing the popup disconnects the SSE port.** `activePort?.disconnect()` in `subscribeToJob` (line 389-398) — if the user closes the popup, the background still owns the job, but on reopen there's no resumable "job in flight" entry point. Users keep the popup open and stare at it.
4. **Codex emits nothing back to the bridge during the eval call.** `buildExecutionPlan` in `claude-pipeline.ts:982-1046` spawns `codex exec -` with stdin prompt and waits for the terminal JSON file. No stdout parsing, no per-block signal.
5. **Latency is real: ~120-200s p50 today.** Driven by `reasoning=high` default, `--search` hardcoded on (line 1009), 4 sequential file reads (CV, articles, profile, JD) in prompt execution.

So the UX fix has to attack two things at once: make the wait feel shorter (#1, #2, #3) AND make the wait actually shorter (#4, #5) — with a safety net so "shorter" doesn't become "worse scores" (Tasks 11-13 below).

---

## Blocking-Issue Resolution Map

From the outside-voice eng review, the 4 issues that blocked the previous plan:

| Reviewer issue | Addressed by |
|---|---|
| 1. Sample size too small for p50/p95 | Task 13 — 6 fixtures × 3 reps; report mean + min/max, not p95 |
| 2. Fail-fast changes the denominator | Task 13 — harness output splits completion-rate, rejection-rate, latency-on-success |
| 3. Fixture coverage shallow | Task 12 — stratified {archetype × ATS × comp × legitimacy × search-dependency} |
| 4. Combined phases blocks attribution | Task 13 — 3-way matrix: baseline / phase1-latency / phase1+phase2 |
| Rollback doc only in code | Task 16 — rollback runbook ships in same PR |
| `JD_MIN_CHARS` drift risk | Task 3 — extension imports from `bridge/src/contracts/jobs.ts` (already canonical) |
| Prompt enum vs path | Task 15 — env var is `CODEX_BRIDGE_PROMPT_PATH` (path, not enum) |

---

## Ordering Principle

1. **UX first (Tasks 1-10).** The UX fixes help every user on every evaluation, whether the latency work lands or not. They're reversible, low-risk, and user-visible.
2. **Latency second (Tasks 11-16).** Gated behind the eval harness. If the harness fails, only the UX changes ship — still a meaningful improvement.
3. **No rollup.** Each task has its own commit. The PR can be split mid-review if latency work gets contested.

---

## Task 1: Worktree + branch

**Files:** none (git only)

**Step 1:** Create isolated worktree off `main`.

Run: `git worktree add ../auto-job-eval-ux -b feat/evaluating-ux main`
Expected: worktree at `../auto-job-eval-ux` on `feat/evaluating-ux`.

**Step 2:** Install + green baseline.

Run: `cd ../auto-job-eval-ux && bun install && bun test`
Expected: all existing tests pass.

**Step 3:** Anchor the branch.

```bash
git commit --allow-empty -m "chore: branch point for evaluating-ux overhaul"
```

---

## Task 2: Split `evaluating` into sub-phases in the wire contract

**Files:**
- Modify: `bridge/src/contracts/bridge-wire.ts` (or wherever `JobPhase` is declared — grep to confirm)
- Modify: `extension/src/shared/utils.ts:22-41` (`PHASE_ORDER`, `PHASE_LABEL`)

**Step 1:** Locate the canonical `JobPhase` union.

Run: `Grep -n "JobPhase" bridge/src/contracts/`
Expected: single file defines `export type JobPhase = "queued" | "extracting_jd" | "evaluating" | ...`.

**Step 2: Write the failing test**

`extension/src/shared/utils.test.ts` (new or append):

```ts
import { describe, it, expect } from "vitest";
import { PHASE_ORDER, PHASE_LABEL } from "./utils";

describe("evaluating sub-phases", () => {
  it("splits evaluating into reading_context, reasoning, assembling", () => {
    expect(PHASE_ORDER).toEqual([
      "queued",
      "extracting_jd",
      "reading_context",
      "reasoning",
      "assembling",
      "writing_report",
      "generating_pdf",
      "writing_tracker",
      "completed",
    ]);
  });
  it("labels each sub-phase with user-facing copy", () => {
    expect(PHASE_LABEL.reading_context).toBe("Reading your CV + portfolio");
    expect(PHASE_LABEL.reasoning).toBe("Scoring A–F blocks");
    expect(PHASE_LABEL.assembling).toBe("Finalizing report");
  });
});
```

Run: `bunx vitest run extension/src/shared/utils.test.ts`
Expected: FAIL — `reading_context` not in `JobPhase` union.

**Step 3: Wire the new phases**

Update the `JobPhase` union in `bridge/src/contracts/bridge-wire.ts` (keep `evaluating` as a deprecated alias for one release for backward compatibility):

```ts
export type JobPhase =
  | "queued"
  | "extracting_jd"
  | "reading_context"
  | "reasoning"
  | "assembling"
  | "writing_report"
  | "generating_pdf"
  | "writing_tracker"
  | "completed"
  | "failed"
  | "evaluating";  // deprecated, remove next release
```

Update `extension/src/shared/utils.ts`:

```ts
export const PHASE_ORDER: readonly JobPhase[] = [
  "queued",
  "extracting_jd",
  "reading_context",
  "reasoning",
  "assembling",
  "writing_report",
  "generating_pdf",
  "writing_tracker",
  "completed",
];

export const PHASE_LABEL: Record<JobPhase, string> = {
  queued: "Queued",
  extracting_jd: "Extracting job description",
  reading_context: "Reading your CV + portfolio",
  reasoning: "Scoring A\u2013F blocks",
  assembling: "Finalizing report",
  writing_report: "Writing report",
  generating_pdf: "PDF step",
  writing_tracker: "Writing tracker row",
  completed: "Completed",
  failed: "Failed",
  evaluating: "Evaluating",  // deprecated fallback
};
```

**Step 4:** Re-run test — PASS.

**Step 5: Commit**

```bash
git commit -am "feat(wire): split 'evaluating' phase into reading_context/reasoning/assembling"
```

---

## Task 3: Emit sub-phase progress from the bridge adapter

**Files:**
- Modify: `bridge/src/adapters/claude-pipeline.ts` (around line 264 where `evaluating` is emitted today)

**Step 1: Write the failing test**

`bridge/src/adapters/claude-pipeline.test.ts` (append):

```ts
it("emits reading_context → reasoning → assembling around the Codex call", async () => {
  const emitted: string[] = [];
  const onProgress: PipelineProgressHandler = (ev) => {
    emitted.push(ev.phase);
  };
  // Use the fake executor so this runs synchronously
  const cfg = { ...baseConfig, realExecutor: "fake" as const };
  await runEvaluation(input, cfg, onProgress);
  const evalIdx = emitted.indexOf("reading_context");
  expect(evalIdx).toBeGreaterThan(-1);
  expect(emitted.slice(evalIdx, evalIdx + 3)).toEqual([
    "reading_context",
    "reasoning",
    "assembling",
  ]);
});
```

**Step 2:** Run — FAIL (only `evaluating` emitted).

**Step 3: Implement**

Replace the single `onProgress({ phase: "evaluating", ... })` emission at `claude-pipeline.ts:264` with three timed emits bracketing the Codex exec:

```ts
// Before Codex exec:
onProgress({ phase: "reading_context", at: new Date().toISOString() });

// Right before `spawn`:
onProgress({ phase: "reasoning", at: new Date().toISOString() });

// After Codex returns but before we parse/persist the report:
onProgress({ phase: "assembling", at: new Date().toISOString() });
```

The `reading_context` phase covers: reading the prompt file, reading CV/articles/profile (current behavior), composing the JD temp file. The `reasoning` phase covers the actual Codex wall-clock (the part users feel). The `assembling` phase covers parsing the terminal JSON, writing the report MD, and emitting the TSV row.

**Step 4:** Re-run test — PASS.

**Step 5: Commit**

```bash
git commit -am "feat(bridge): emit reading_context/reasoning/assembling during eval"
```

---

## Task 4: Popup — show elapsed timer during `reasoning`

**Files:**
- Modify: `extension/src/popup/index.ts` (in `renderPhases` and `appendPhase`, lines 450-510)
- Modify: `extension/src/popup/index.html` (add `<span id="elapsed-counter">`)
- Add: `extension/src/popup/index.css` (style for counter)

**Step 1: Write the failing test**

Popup logic is hard to unit-test (DOM-bound). Instead, extract the elapsed-formatting function into `shared/utils.ts` and test it.

`extension/src/shared/utils.test.ts` (append):

```ts
describe("formatElapsed", () => {
  it("shows mm:ss for under 1h", () => {
    expect(formatElapsed(0)).toBe("0:00");
    expect(formatElapsed(65_000)).toBe("1:05");
    expect(formatElapsed(3_605_000)).toBe("60:05");
  });
});
describe("etaHint", () => {
  it("returns 'typically ~90s' for reasoning phase", () => {
    expect(etaHint("reasoning")).toMatch(/~90s|~1-2 min/);
  });
  it("returns null for fast phases", () => {
    expect(etaHint("queued")).toBeNull();
    expect(etaHint("reading_context")).toBeNull();
  });
});
```

**Step 2:** Run — FAIL (function doesn't exist).

**Step 3: Implement** in `shared/utils.ts`:

```ts
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const mm = Math.floor(total / 60);
  const ss = total % 60;
  return `${mm}:${String(ss).padStart(2, "0")}`;
}

export function etaHint(phase: JobPhase): string | null {
  if (phase === "reasoning") return "typically ~1-2 min";
  if (phase === "writing_report") return "a few seconds";
  return null;
}
```

**Step 4:** Run tests — PASS.

**Step 5: Wire into popup**

In `extension/src/popup/index.html`, add `<span id="elapsed-counter" class="muted"></span>` near the phase list.

In `extension/src/popup/index.ts`, after `show("running")` on line 383, start a 1-Hz interval that updates `elapsed-counter` with `formatElapsed(Date.now() - startedAt)`. Clear the interval in `stopJobPolling()`. When `snap.phase === "reasoning"`, also render the ETA hint in parentheses: `1:23 · typically ~1-2 min`.

**Step 6:** Manual smoke test.

Run: `bun run ext:build && load unpacked in Chrome`
Expected: after clicking Evaluate on a real JD, elapsed counter ticks every second; ETA hint appears during the long phase.

**Step 7: Commit**

```bash
git commit -am "feat(popup): elapsed counter + ETA hint during reasoning"
```

---

## Task 5: Panel — mirror the elapsed timer

**Files:**
- Modify: `extension/src/panel/inject.ts` (same pattern as popup)

Panel has its own DOM (`inject.ts:243-248`). The `shared/utils.ts` functions are already bundled into both entry points per the comment at `shared/utils.ts:6`. Reuse them.

**Step 1:** Mirror Task 4's DOM + interval pattern in `panel/inject.ts`. No new tests — the format/ETA helpers are already tested.

**Step 2: Commit**

```bash
git commit -am "feat(panel): elapsed counter + ETA hint (mirrors popup)"
```

---

## Task 6: Background — job snapshot cache so popup reopen resumes state

**Files:**
- Modify: `extension/src/background/index.ts`
- Test: `extension/src/background/index.test.ts`

Currently if the user closes the popup mid-evaluation, reopening it shows the empty initial state because the popup resubscribes from scratch and doesn't know a job is in flight.

**Step 1: Write the failing test**

```ts
describe("active job recovery", () => {
  it("reports the last active jobId to a re-opening popup", async () => {
    await bg.startEvaluation({ url: "https://x/y", pageText: "...".repeat(500) });
    const active = await bg.getActiveJob();
    expect(active).not.toBeNull();
    expect(active!.jobId).toBeDefined();
    expect(active!.phase).toMatch(/queued|extracting_jd|reading_context|reasoning|assembling/);
  });
  it("clears the active job on completion", async () => {
    // simulate job complete event
    await bg.handleJobDone("job-123");
    expect(await bg.getActiveJob()).toBeNull();
  });
});
```

**Step 2:** Run — FAIL.

**Step 3: Implement**

In `background/index.ts`, maintain `activeJob: { jobId, startedAt, lastPhase } | null` in module scope (persisted to `chrome.storage.session` so it survives SW restarts). Update on every phase event. Expose a new message handler `getActiveJob` returning the current record.

In popup on boot (before normal capture flow), call `getActiveJob`. If non-null, immediately `subscribeToJob(jobId)` and `show("running")` — user sees the running phase list + elapsed counter without clicking Evaluate again.

**Step 4:** Verify.

**Step 5: Commit**

```bash
git commit -am "feat: resumable active-job state across popup open/close"
```

---

## Task 7: Popup UX — "you can close this; we'll notify when done"

**Files:**
- Modify: `extension/src/popup/index.ts`
- Modify: `extension/src/popup/index.html`
- Modify: `extension/src/background/index.ts` (add `chrome.notifications` on done)
- Modify: `extension/public/manifest.json` (add `"notifications"` permission if missing)

**Step 1:** During `reasoning` phase, add a small muted hint under the phase list:

```
It's safe to close this popup. We'll notify you when the report is ready.
```

**Step 2:** Add a Chrome notification on `done` event in `background/index.ts`:

```ts
chrome.notifications.create(`auto-job-${jobId}`, {
  type: "basic",
  iconUrl: "icons/icon-128.png",
  title: `Evaluation ready — ${result.score.toFixed(1)}/5`,
  message: `${result.company} · ${result.role}`,
});
```

Clicking the notification opens the popup (which, per Task 6, will render the completed state immediately).

**Step 3:** Smoke-test manually — start eval, close popup, wait, see notification. Click it, popup opens on the done screen.

**Step 4: Commit**

```bash
git commit -am "feat: popup hints close-is-safe + desktop notification on done"
```

---

## Task 8: Keep the evaluate button disabled across popup reopens while a job is live

**Files:**
- Modify: `extension/src/popup/index.ts` (near `onEvaluateClick`, line 349)

Today, if the user closes the popup and reopens it on a different tab, they might click Evaluate again and queue a second job. Task 6 gave us `activeJob`; use it to short-circuit.

**Step 1: Write the failing test**

In the popup boot logic test (create if missing): if `getActiveJob()` returns a jobId and the current tab's URL differs, disable the evaluate button with label "Already evaluating another tab — see running job above".

**Step 2-4:** Implement, verify.

**Step 5: Commit**

```bash
git commit -am "feat(popup): guard against concurrent job starts across tabs"
```

---

## Task 9: Cancel button during `reasoning`

**Files:**
- Modify: `bridge/src/server.ts` (add `DELETE /v1/jobs/:id`, which kills the in-flight spawn)
- Modify: `bridge/src/adapters/claude-pipeline.ts` (plumb an AbortSignal through `spawn` call at line 1155)
- Modify: `extension/src/popup/index.ts` (show cancel button during `reasoning`)

**Step 1: Failing test on the bridge side**

`bridge/src/server.test.ts` (append):

```ts
it("DELETE /v1/jobs/:id kills an in-flight evaluation and marks it failed", async () => {
  const startRes = await app.inject({ method: "POST", url: "/v1/evaluate", payload: { url: "..." } });
  const { jobId } = JSON.parse(startRes.body).data;
  // small delay to ensure job reached reasoning
  await new Promise((r) => setTimeout(r, 50));
  const cancelRes = await app.inject({ method: "DELETE", url: `/v1/jobs/${jobId}` });
  expect(cancelRes.statusCode).toBe(200);
  const snap = await app.inject({ method: "GET", url: `/v1/jobs/${jobId}` });
  expect(JSON.parse(snap.body).data.phase).toBe("failed");
  expect(JSON.parse(snap.body).data.error.code).toMatch(/CANCELLED/);
});
```

**Step 2-4:** Implement with `AbortController` wired into the spawn. The adapter must `child.kill("SIGTERM")` on abort; fallback `SIGKILL` after 2s.

**Step 5:** Popup side — during `reasoning`, render a secondary "Cancel" button. On click, call new `sendRequest({ kind: "cancelJob", jobId })` which hits `DELETE /v1/jobs/:id`. Re-enable Evaluate.

**Step 6: Commit**

```bash
git commit -am "feat: cancel in-flight evaluation via DELETE /v1/jobs/:id"
```

---

## Task 10: Error UX — distinguish bridge-down vs model-timeout vs short-JD

**Files:**
- Modify: `extension/src/popup/index.ts:543+` (in `classifyError`)

Current error screen is generic. Add 3 distinct recovery paths keyed on error code:
- `JD_TOO_SHORT` → "Only {N} chars captured — try scrolling the JD into view and retry."
- `BRIDGE_UNREACHABLE` → "Bridge not running. Start it with `bun run server` then reopen this popup."
- `CODEX_TIMEOUT` → "Evaluation exceeded 5 min — try again, or run `CODEX_BRIDGE_REASONING=medium` for a faster retry."

**Step 1-4:** TDD on `classifyError` (pure function, easy to test). 

**Step 5: Commit**

```bash
git commit -am "feat(popup): error UX distinguishes short-JD / bridge-down / timeout"
```

---

## Task 11: Import `JD_MIN_CHARS` in the extension (DRY — addresses review)

**Files:**
- Modify: `extension/src/background/index.ts:525` — replace hardcoded `400`
- Modify: `extension/tsconfig.json` — add path alias `@contracts/*` → `../bridge/src/contracts/*`

**Step 1: Write the failing test**

```ts
import { JD_MIN_CHARS } from "@contracts/jobs";
it("extension threshold is sourced from the bridge contract", () => {
  expect(JD_MIN_CHARS).toBe(400);
});
```

**Step 2-4:** Implement and verify.

**Step 5: Commit**

```bash
git commit -am "refactor(ext): import JD_MIN_CHARS from bridge contract (no drift)"
```

---

## Task 12: Stratified fixture matrix (addresses review Issue 3)

**Files:**
- Create: `tests/eval-fixtures/README.md`
- Create: `tests/eval-fixtures/fixtures.json`
- Create (6 files): `tests/eval-fixtures/jds/{01..06}-*.txt`

6 fixtures, not 5-8, chosen so each cell of the matrix has at least 1 representative:

```json
[
  {"id":"01-ai-greenhouse-clear","archetype":"AI/ML","ats":"greenhouse","comp":"present","legitimacy":"clear","search_dependent":false,"jd_path":"jds/01-ai-greenhouse-clear.txt"},
  {"id":"02-backend-lever-borderline","archetype":"Backend","ats":"lever","comp":"missing","legitimacy":"ambiguous","search_dependent":false,"jd_path":"jds/02-backend-lever-borderline.txt"},
  {"id":"03-ai-linkedin-searchdep","archetype":"AI/ML","ats":"linkedin","comp":"missing","legitimacy":"ambiguous","search_dependent":true,"jd_path":"jds/03-ai-linkedin-searchdep.txt"},
  {"id":"04-product-workday-clear","archetype":"Product-adjacent","ats":"workday","comp":"present","legitimacy":"clear","search_dependent":false,"jd_path":"jds/04-product-workday-clear.txt"},
  {"id":"05-backend-ashby-redflag","archetype":"Backend","ats":"ashby","comp":"present","legitimacy":"red-flag","search_dependent":false,"jd_path":"jds/05-backend-ashby-redflag.txt"},
  {"id":"06-ai-greenhouse-clearhire","archetype":"AI/ML","ats":"greenhouse","comp":"present","legitimacy":"clear","search_dependent":false,"jd_path":"jds/06-ai-greenhouse-clearhire.txt"}
]
```

Each JD file ≥ 1500 chars, drawn from existing `reports/`. Source fixture `03` from a role where the original eval is known to have used `--search` enrichment (this is the canary for turning search off).

README documents the stratification rationale and the "add a fixture" workflow. Commit:

```bash
git add tests/eval-fixtures/
git commit -m "feat: stratified eval fixture matrix (6 JDs × 5 dims)"
```

---

## Task 13: 3-way eval harness (addresses review Issues 1, 2, 4)

**Files:**
- Create: `scripts/run-eval-harness.mjs`
- Create: `scripts/run-eval-harness.test.mjs`

**Step 1: Define the result schema** (machine-readable, so attribution is objective):

```json
{
  "generated_at": "2026-04-12T15:30:00Z",
  "configs": ["baseline", "phase1", "phase1_2"],
  "runs": [
    {"fixture":"01-...","config":"baseline","rep":1,
     "completed":true,"rejected_short_jd":false,
     "latency_ms":147000,"global_score":4.3,
     "archetype":"AI/ML Engineering","legitimacy":"clear"}
  ],
  "summary": {
    "baseline":  {"completion_rate":1.0,"rejection_rate":0.0,"latency_ms_mean":152000,"latency_ms_min":140000,"latency_ms_max":168000},
    "phase1":    {"completion_rate":1.0,"rejection_rate":0.0,"latency_ms_mean":98000, "latency_ms_min":89000, "latency_ms_max":112000},
    "phase1_2":  {"completion_rate":1.0,"rejection_rate":0.0,"latency_ms_mean":72000, "latency_ms_min":65000, "latency_ms_max":85000}
  },
  "gates": {"score_delta_max":0.5,"archetype_mismatch_count":0,"legitimacy_mismatch_count":0,"passed":true}
}
```

**Why mean + min/max, not p95:** 18 samples per config is too few for credible p95. This is the reviewer's exact objection — the harness reports what the data supports and nothing more. README calls this out explicitly.

**Step 2: Driver behavior**

For each config in `[baseline, phase1, phase1_2]`:
- Set env: `CODEX_BRIDGE_REASONING`, `CODEX_BRIDGE_SEARCH`, `CODEX_BRIDGE_PROMPT_PATH`, `CODEX_BRIDGE_PREBUNDLE`.
- For each fixture × 3 reps: `POST /v1/evaluate` with `pageText` = fixture content; measure wall-clock; parse the resulting report for Global / archetype / legitimacy.
- Write `eval-results.json` + `eval-results.md`.
- Exit non-zero if any gate fails.

**Metric splits (per review Issue 2):**
- `completion_rate` = completed / total
- `rejection_rate` = rejected_short_jd / total (should be 0 for fixtures ≥ 1500 chars — this is a canary)
- `latency_ms_*` computed **only on completed non-rejected runs**. This prevents "latency improved" claims from being secretly driven by dropping slow/broken inputs.

**Step 3: Unit-test only the result parser** (not the Codex call) — synthetic report in, scores out.

**Step 4: Commit**

```bash
git commit -am "feat: 3-way eval harness with stratified latency + quality gates"
```

---

## Task 14: `CODEX_BRIDGE_REASONING` env toggle (default `medium`)

**Files:**
- Modify: `bridge/src/runtime/config.ts`
- Modify: `bridge/src/adapters/claude-pipeline.ts:1008-1023`
- Test: `bridge/src/runtime/config.test.ts`

**Step 1: Failing tests**

```ts
describe("CODEX_BRIDGE_REASONING", () => {
  it("defaults to 'medium'", () => {
    delete process.env.CODEX_BRIDGE_REASONING;
    expect(loadBridgeConfig().codexReasoning).toBe("medium");
  });
  it("passes 'low' / 'high' verbatim", () => {
    process.env.CODEX_BRIDGE_REASONING = "low";
    expect(loadBridgeConfig().codexReasoning).toBe("low");
    process.env.CODEX_BRIDGE_REASONING = "high";
    expect(loadBridgeConfig().codexReasoning).toBe("high");
  });
  it("rejects unknown values loudly", () => {
    process.env.CODEX_BRIDGE_REASONING = "bogus";
    expect(() => loadBridgeConfig()).toThrow(/CODEX_BRIDGE_REASONING/);
  });
});
```

**Step 2-4:** Run → fail → add `codexReasoning` to config + inject `-c model_reasoning_effort="..."` into the codex args → pass.

**Step 5: Commit**

```bash
git commit -am "feat: CODEX_BRIDGE_REASONING env toggle (default medium)"
```

---

## Task 15: `CODEX_BRIDGE_SEARCH` + `CODEX_BRIDGE_PROMPT_PATH` + `CODEX_BRIDGE_PREBUNDLE`

**Files:**
- Modify: `bridge/src/runtime/config.ts`
- Modify: `bridge/src/adapters/claude-pipeline.ts` (lines 909-930 for prebundle; line 1009 for --search; prompt-path wiring throughout)
- Create: `bridge/prompts/bridge-prompt.md` (copy of `batch/batch-prompt.md` with `## Paso 4 — PDF opcional` lines 230-319 removed)
- Tests: `bridge/src/runtime/config.test.ts`, `bridge/src/adapters/claude-pipeline.test.ts`

**Step 1: Failing tests (all three toggles)**

- `CODEX_BRIDGE_SEARCH` default `off` — `--search` absent from codex args.
- `CODEX_BRIDGE_PROMPT_PATH` — if set, overrides the default prompt file path (path, not enum).
- `CODEX_BRIDGE_PREBUNDLE` default `off` — `buildJdText` returns the current format. When `on`, it appends `## Candidate CV`, `## Portfolio proof points`, `## Candidate profile` sections.

**Step 2-4:** Implement each, verify.

**Step 5:** Integration assertion: with all three "on" (`reasoning=medium`, `--search` off, bridge-prompt.md, prebundle on), the execution plan's args string contains what it should and omits what it shouldn't. One test per toggle + one combined test.

**Step 6: Commit**

```bash
git commit -am "feat: CODEX_BRIDGE_SEARCH + PROMPT_PATH + PREBUNDLE env toggles"
```

---

## Task 16: Rollback runbook (ships in same PR — addresses review)

**Files:**
- Create: `docs/latency-rollback.md`

Contains the per-knob rollback matrix (reasoning, search, prompt path, prebundle), exact commands, and a one-line re-verification step using the eval harness. Linked from the PR description AND from `bridge/CLAUDE.md`.

```bash
git add docs/latency-rollback.md
git commit -m "docs: latency rollback runbook"
```

---

## Task 17: Run the full harness, commit results, open PR

**Step 1:** Run end-to-end.

Run: `node scripts/run-eval-harness.mjs`
Expected runtime: ~60-90 min (54 invocations × ~90s average). Sequential. Do NOT parallelize.

**Step 2: Verify all gates**

- `gates.passed === true`?
- `phase1.completion_rate === baseline.completion_rate`? (Phase 1 must not change the denominator.)
- `phase1_2.latency_ms_mean ≤ 0.5 × baseline.latency_ms_mean`?
- Score delta ≤ 0.5 per fixture per config?

**Step 3:** If any gate fails, STOP. Diagnose per `docs/latency-rollback.md` matrix. If the regression is structural, abort the latency half of the PR — ship UX tasks (1-10) alone.

**Step 4:** Commit artifacts.

```bash
git add tests/eval-fixtures/eval-results.json tests/eval-fixtures/eval-results.md
git commit -m "chore: eval harness 3-way results"
```

**Step 5:** Open PR. Body must include:
1. The 4 reviewer issues verbatim + which task addresses each.
2. Link to `docs/latency-rollback.md`.
3. Pasted `eval-results.md` summary table.
4. Explicit disclaimer: "p95 is NOT reported. Sample size (18/config) cannot support it. Mean + min/max is the honest metric."
5. UX tasks 1-10 work on `fake` executor too — reviewers can smoke-test without Codex.

---

## DRY / YAGNI guardrails for the executor

- `JD_MIN_CHARS` exists at `bridge/src/contracts/jobs.ts:64`. Do NOT duplicate.
- Prompt variant is a **path via env**, not an enum.
- Do NOT extract `batch/batch-prompt.md`'s PDF section in this PR — deferred per `TODOS.md`.
- Do NOT add `CODEX_BRIDGE_MODEL` — deferred per `TODOS.md`.
- The harness reports mean + min/max, NOT p95. Anyone wanting p95 must 5× the fixtures first.
- Keep the old `evaluating` phase as a deprecated alias in `JobPhase` for 1 release so server/extension version skew doesn't crash older popups.

---

## What this plan deliberately does NOT do

- No `batch/` path changes — regression-locked via existing e2e test.
- No `sdk-pipeline.ts` changes.
- No Playwright changes — extension-side rejection short-circuits before bridge is called.
- No model swap.
- No attempt to stream **tokens** from Codex — the CLI doesn't expose a per-token stream hook worth integrating today. Sub-phase markers (Task 3) are the right granularity.
