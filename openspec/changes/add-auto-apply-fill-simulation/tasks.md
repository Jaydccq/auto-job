## 1. Workspace skeleton

- [ ] 1.1 Create `packages/auto-apply/` with `src/`, `test/`, `package.json` (deps on browser/humanize/credentials), `tsconfig.json`, `vitest.config.ts`, `.gitignore`
- [ ] 1.2 Run pnpm install at root; verify @auto-job/* workspace links

## 2. Core types + interface + errors

- [ ] 2.1 `src/types.ts` — `ApplyFlow`, `FormSchema`, `FillResult`, `SubmitOptions`, `SubmitResult`, `ApplicationData`, `ApplyRequest`
- [ ] 2.2 `src/errors.ts` — `SubmitNotPermittedError`, `MissingProfileFieldError`, `MissingResumeError`, `UnsupportedATSError`, `FormFillError`
- [ ] 2.3 `src/profile.ts` — `loadApplicationData(opts?)` reads config/profile.yml + cv.md
- [ ] 2.4 `src/snapshot.ts` — `writeReviewSnapshot(tab, id, data, result)` writes form.html + screenshot.png + data.json + result.json with password REDACTION

## 3. Per-ATS adapters

- [ ] 3.1 `src/greenhouse/apply.ts` — selectors for Greenhouse hosted forms (`input[name="first_name"]`, `[data-qa="email"]`, etc.)
- [ ] 3.2 `src/lever/apply.ts` — Lever-specific selectors
- [ ] 3.3 `src/ashby/apply.ts` — Ashby-specific selectors
- [ ] 3.4 `src/workday/apply.ts` — Workday first-page selectors (multi-step deferred)
- [ ] 3.5 `src/registry.ts` — `applyFlowFor(ats)` factory, throws `UnsupportedATSError` for icims/unknown
- [ ] 3.6 `src/index.ts` — public exports

## 4. Orchestrator

- [ ] 4.1 `src/run.ts` — `runApplyFlow(controller, request, opts)`:
  - openTab(request.jobUrl)
  - get vault credentials via `vaultGet(vault_ref)` if needed
  - load profile via `loadApplicationData()`
  - identify form
  - fill form via `humanize(tab)` + adapter.fillForm
  - write review snapshot
  - if `opts.allowSubmit === true`: call adapter.submit (NOT exercised in this change)
  - close tab, return FillResult

## 5. Apply-queue runner skeleton

- [ ] 5.1 `apps/server/src/apply-queue/runner.ts` — `processNextApplyEntry(controller)`:
  - read queue, find first "ready" entry
  - mark status "in_flight"
  - call runApplyFlow with allowSubmit:false
  - on success: mark "succeeded" with snapshot path in notes
  - on AdapterParseError: mark "failed"
  - on detection signal: mark "detected"

## 6. Tests

- [ ] 6.1 Unit tests for profile loader (mock yaml content, missing fields, bad resume path)
- [ ] 6.2 Unit tests for snapshot writer (password REDACTION verified)
- [ ] 6.3 Unit tests per ATS adapter: detectsUrl positive/negative; identifyForm with fakeTab returning canned innerHTML; fillForm calls right humanize methods
- [ ] 6.4 Submit-gate tests: each adapter's submit throws SubmitNotPermittedError without allowSubmit:true
- [ ] 6.5 Runner tests: processNextApplyEntry transitions status correctly per outcome
- [ ] 6.6 Snapshot integration: runApplyFlow with fakeTab + tmp dir for snapshot, verify all 4 files written

## 7. CLI helper

- [ ] 7.1 `scripts/auto-apply-fill.ts` — takes `--url <jobUrl>` and `--ats <id>`, runs the fill flow against the dedicated Chrome, prints snapshot path on success
- [ ] 7.2 npm script `auto-apply:fill`

## 8. Verify + commit + push private + open private PR

- [ ] 8.1 npm run verify passes (extends pipeline to cover packages/auto-apply)
- [ ] 8.2 Update .gitignore for data/apply-snapshots/, packages/auto-apply/{node_modules,dist}/
- [ ] 8.3 Commit on feat/auto-apply-fill-simulation branch
- [ ] 8.4 Push to private remote (NOT origin)
- [ ] 8.5 Open PR against Jaydccq/auto-job-private base main
