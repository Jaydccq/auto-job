## Why

Phase 2A (PR #6, merged) shipped the foundations: humanizer, vault, apply-queue, gate. Phase 2B turns those into actual auto-apply flows for the 4 supported ATS (Greenhouse, Lever, Ashby, Workday). iCIMS is intentionally skipped because its public URL pattern is currently broken (see `update-icims-modern-urls` follow-up).

This change ships **fill-only / dry-run by default**: every flow loads the application page, identifies form fields, fills them with vault-sourced credentials and profile data via `HumanizedTab`, captures a review snapshot (HTML + screenshot), and **stops before submit**. The `submit()` method exists but throws `SubmitNotPermittedError` unless `opts.allowSubmit: true` is explicitly passed.

Fill-only mode gives us:
1. End-to-end pipeline validation (humanizer + vault + adapter) without tripping anti-bot signals or accidentally submitting test data
2. A "what would have been submitted" review snapshot for the user to inspect before any real submit
3. A safe path to iterate on adapter form-field selectors as ATS UIs evolve
4. Phase 5 risk telemetry (next change) can observe detection signals on the fill traffic before any submit ever fires

## What Changes

- **NEW** workspace package `packages/auto-apply/` (`@auto-job/auto-apply`)
  - `ApplyFlow<TFormData>` interface — common contract across ATS
  - `runApplyFlow(controller, request, opts)` orchestrator: fetch profile, get vault creds, navigate, identify form, fill, capture snapshot, optionally submit
  - Per-ATS adapters under `src/{greenhouse,lever,ashby,workday}/apply.ts`
  - `SubmitNotPermittedError` thrown on `.submit()` unless explicitly opted in
- **NEW** profile reader `packages/auto-apply/src/profile.ts` — reads `config/profile.yml` + `cv.md` → typed `ApplicationData` (name, email, phone, location, LinkedIn, GitHub, portfolio, resume path, default cover-letter text, work-auth answer, sponsorship answer)
- **NEW** review-snapshot artifact written to `data/apply-snapshots/{id}-{timestamp}/` with `form.html`, `screenshot.png`, `data.json` (the data that would have been submitted)
- **NEW** scan/CLI script `scripts/auto-apply-fill.ts` for ad-hoc dry-run testing — takes a job URL, runs the flow, prints the review path
- Wires apply-queue runner skeleton: `processNextApplyEntry()` reads queue → calls `runApplyFlow` in dry-run → markStatus("succeeded" if filled, "failed" if filling error). Submit path NOT wired in this change.
- Tests: unit tests with `fakeTab` per ATS (verify field selectors invoked, no submit click). One integration test gated by `RUN_APPLY_INTEGRATION=1` against a static `data:text/html,<form>...</form>` page.

**Not breaking.** No public-repo changes. No actual submits. No emails sent. The `applyQueue` gate from Phase 2A still defaults to disabled, so even with this change merged, nothing fires unless the user enables the policy file.

## Capabilities

### New Capabilities

- `auto-apply`: per-ATS apply flows (greenhouse / lever / ashby / workday) running via `HumanizedTab`. Default mode is fill-only; submit gated behind explicit opt-in. Captures review snapshots. Compose with vault, profile reader, apply-queue.

### Modified Capabilities

(none — additive only)

## Impact

- **Affected code:** `packages/auto-apply/` (new), `apps/server/src/apply-queue/runner.ts` (new file, skeleton only — fills not submits), `scripts/auto-apply-fill.ts` (new), `data/apply-snapshots/.gitkeep` (new dir)
- **Dependencies:** `@auto-job/browser`, `@auto-job/humanize`, `@auto-job/credentials` (all in private workspaces)
- **External systems:** ATS apply pages (Greenhouse, Lever, Ashby, Workday) — read + fill only, no POST in dry-run
- **Reversibility:** revert by removing the new package and runner skeleton
- **Authoritative spec:** `docs/superpowers/specs/2026-05-04-auto-job-architecture-design.md` (Phase 2B)
- **Repo:** **PRIVATE** (Jaydccq/auto-job-private)
