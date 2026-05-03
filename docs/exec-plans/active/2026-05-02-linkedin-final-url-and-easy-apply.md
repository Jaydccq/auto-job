# LinkedIn final-URL capture + Easy Apply auto-fill

## Background

Two LinkedIn scan/extension shortcomings reported by the user (2026-05-02):

1. `linkedin-scan` writes pipeline rows whose URL is the LinkedIn `/jobs/view/...` page or LinkedIn's intermediate `/jobs/view/.../apply/external?...` redirect — not the final external ATS posting URL the user lands on after clicking "Apply".
2. When a posting is **Easy Apply** (LinkedIn-hosted modal), the extension currently does nothing automatic — the autofill plumbing exists for ATS pages but the panel never enters the LinkedIn Easy Apply modal scope, so multi-step Easy Apply forms must be filled by hand.

The user wants:
- Final ATS URL captured into pipeline / report when the Apply button leaves LinkedIn.
- Extension to auto-fill Easy Apply questions across the multi-step modal, stopping safely before the irreversible "Submit application" click.

## Goal

- **Goal A (URL):** When `linkedin-scan` opens the external Apply flow, capture the truly final URL after LinkedIn's redirect chain settles, write that into `applyNowUrl` / `applyFlowUrls` / `pickPipelineEntryUrl`, and surface it through the existing pipeline/tracker contract.
- **Goal B (Easy Apply):** Add a modal-aware autofill flow in `apps/extension` that detects an Easy Apply dialog, fills supported questions using the existing `AutofillProfile`, and walks "Continue → Next → Review" steps. Never click "Submit application".

## Scope

### In scope
- `scripts/linkedin-scan-bb-browser.ts` — `probeExternalApplyUrl`, `addCandidateApplyUrls`, `clickLinkedInExternalApplyButton`, plus a new redirect-settle helper.
- `apps/server/src/adapters/newgrad-links.ts` — only if URL-picking logic must change to favor a richer final URL signal (e.g. preserve newly captured `finalApplyUrl`).
- `apps/extension/src/shared/autofill-matcher.ts` — add an optional scanRoot to `scanAutofillMatches` so it can be confined to a modal subtree.
- `apps/extension/src/panel/inject.ts` — Easy Apply modal detection, fill loop, "Continue / Next / Review" advancement, hard guard against "Submit application".
- Unit tests for both modules (vitest in apps/extension; node:test or vitest for the script if practical).

### Out of scope
- Resume upload UX rewrite (existing `loadAutofillResumeFile` already supports it).
- Scoring/eval pipeline behavior.
- Any backend/server changes beyond what the URL plumbing requires.
- Captcha or interview-question generation.

## Assumptions

- `bb-browser eval --tab <id>` can run JavaScript inside any open tab (validated — see `evaluateBrowserJson`).
- LinkedIn's Apply button either:
  - opens a new tab with `target=_blank` (most common for offsite ATS), or
  - performs an in-tab navigation to LinkedIn's `/jobs/view/.../apply/external?...` redirect, which then 30x to the ATS.
- The extension panel runs on the active tab and `chrome.tabs.sendMessage` already wires content access (existing autofill works on ATS pages today).
- The `AutofillProfile` from `/v1/autofill/profile` covers the fields LinkedIn Easy Apply asks (it does — Easy Apply asks city, work auth, sponsorship, phone, resume, plus per-job questions).
- LinkedIn Easy Apply modal lives in the page DOM under `#artdeco-modal-outlet` / `[role="dialog"]` and the form root is `form.jobs-easy-apply-form` (or similar `data-test-modal` attributes that change). We will use multi-pattern selectors for resilience.

## Implementation steps

### Phase 1 — Diagnosis (read-only)
1. Trace `probeExternalApplyUrl` end-to-end and record:
   - what URL is returned today when LinkedIn redirects via `/jobs/view/X/apply/external?...`,
   - what `tab.url` reports during a redirect chain.
2. Trace `scanAutofillMatches` and confirm:
   - it currently scans the entire `document`,
   - has no Easy Apply / modal awareness,
   - has no "next-step" loop.
3. Verify by greping that no Easy Apply UX exists in the panel.

   **Verify:** notes captured in `docs/exec-plans/active/2026-05-02-linkedin-final-url-and-easy-apply.notes.md` with file:line citations.

### Phase 2 — Design
1. Final-URL fix:
   - On click, do **not** close opened tabs immediately.
   - For each tab opened by the click, run `bb-browser eval` polling `window.location.href` until the host stops being a `linkedin.com` host AND remains stable across two consecutive polls (or a hard timeout of ~12s).
   - Read `<link rel="canonical">` href; fall back to `window.location.href`.
   - If no new tab was opened (in-tab navigation), apply the same poll on the original tab AFTER click but only if the URL diverged from the LinkedIn job-view URL.
   - Always restore the user's job-view tab afterward (close the redirect tab once we have its final URL).
2. Easy Apply auto-fill:
   - Add an `AutofillScanScope` option to `scanAutofillMatches({ root?: ParentNode })` — default behavior unchanged.
   - In `inject.ts`, detect modal: `document.querySelector('div[role="dialog"][aria-labelledby], .jobs-easy-apply-modal, [data-test-modal][aria-label*="Easy Apply" i]')`.
   - Add a panel button "Easy Apply: auto-fill this step" + a toggle "auto-advance".
   - Auto-advance loop:
     - scan modal scope → fill → wait short tick → look for `button[aria-label^="Continue"], button[aria-label^="Next"], button[aria-label^="Review"]` → click.
     - **Stop conditions:** found `button[aria-label*="Submit application" i]` (do NOT click), or no fillable matches and no progress button, or 8 iterations max.
   - Hard guard: never call `.click()` on a button whose accessible label matches `/submit/i`.

### Phase 3 — Implement
1. Final-URL fix in `scripts/linkedin-scan-bb-browser.ts`.
2. `scanAutofillMatches` scope option in `apps/extension/src/shared/autofill-matcher.ts`.
3. `inject.ts` Easy Apply UI + loop.
4. Update `pickPipelineEntryUrl` only if needed (likely the new `applyNowUrl` will already win because it scores higher than LinkedIn).

### Phase 4 — Test
- New vitest cases in `apps/extension/test/` for Easy Apply modal detection + scoped scan + submit-button guard.
- Add regression test for the URL-settle helper (extract pure function, test with fake page-state shapes).
- `npm --prefix apps/extension test` and `npm --prefix apps/server test` pass.
- `npm run verify:repo-guard` passes.

### Phase 5 — Codex review
- Run `codex review` against the diff, capture issues, address high/critical.

### Phase 6 — Wrap-up
- Update progress log + final outcome in this file.
- Add deferred items to `docs/exec-plans/tech-debt-tracker.md` if any.

## Verification approach

- **Goal A:** Unit-test the redirect-settle helper with mocked `evaluateBrowserJson` returning a sequence of URL states; regression: when LinkedIn → ATS settles, helper returns the ATS URL; when LinkedIn never leaves, helper returns null and pipeline keeps the LinkedIn URL.
- **Goal B:** Vitest with happy-dom fixture of an Easy Apply modal containing a name field and a "Continue" button; assert that the loop fills the field, clicks Continue, then stops when "Submit application" appears (and does NOT click it).

## Progress log

- **2026-05-02:** Plan created. Diagnosis (Phase 1) and design (Phase 2) recorded in `notes.md`.
- **2026-05-02:** Phase 3 implementation:
  - `apps/server/src/adapters/external-apply-settle.ts` (NEW) — pure URL-settle state machine + helpers `settleFinalUrl`, `preferredUrlFromTabState`, `isOffsiteHttpUrl`, `isLinkedInHost`.
  - `apps/server/src/adapters/external-apply-settle.test.ts` (NEW) — 20 unit tests covering happy path, host-stable churn, tab close, never-leaves-LinkedIn, flap, transient-then-close, fragments, non-http schemes.
  - `scripts/linkedin-scan-bb-browser.ts` — `probeExternalApplyUrl` rewritten to keep popup tabs open and call `settleFinalUrl(readTabUrlState, …)` instead of one-shot `tab.url` polling. Popup discovery uses a quiet-window loop (1.2s quiet → bail; 6s ceiling).
  - `apps/extension/src/shared/autofill-matcher.ts` — `ScanOptions` gained `root?: ParentNode`; `scanAutofillMatches` and the resume-file file-input collection now scope to `root ?? doc`.
  - `apps/extension/src/shared/easy-apply.ts` (NEW) — `findEasyApplyModal`, `findEasyApplyProgressButton`, `findEasyApplySubmitButton`, `assertSafeClick`, `buttonAccessibleLabel`. The label helper concatenates aria-label + aria-labelledby (resolved IDs) + textContent + value + title + nested aria-label so that all paths (title-attribute trap, hidden labelledby, nested span) trip the unsafe regex.
  - `apps/extension/src/panel/inject.ts` — adds "Easy Apply: fill this step" button + auto-advance toggle. `easyApplyLoop` runs ≤ 8 iterations: re-detects modal each step, hard-stops on Submit, calls `assertSafeClick` before every progress click, surfaces results in the existing autofill summary element. Single-step fill never clicks anything.
  - `apps/extension/test/easy-apply.test.ts` (NEW) — 18 tests: scoped scan, modal detection, progress vs submit, assertSafeClick, title-attribute trap, nested span trap, aria-labelledby trap, auto-loop submit short-circuit.
- **2026-05-02:** Phase 4 — codex review pass 1 caught 5 issues (1 critical: `unref()` made the loop drop on idle; 4 warns: state-machine flap, transient-then-close, title-bypass, popup race). All fixes applied with regression tests. Codex pass 2 said "ship it" with three residual risks; the `aria-labelledby` evasion was also fixed in pass 2. Remaining residuals: slow-`interactive` ATS only confirms after `maxMs` (safe but slow), popup discovery loop has no unit coverage, and `listBbTabs()` falls back to bb-browser's 120s timeout if it hangs.
- **2026-05-02:** Phase 5 verification:
  - `npm --prefix apps/server run test` — 332/332 pass.
  - `cd apps/server && ./node_modules/.bin/vitest run --root /Users/hongxichen/Desktop/auto-job/apps/extension` — 84/84 pass.
  - `npm --prefix apps/extension run typecheck` + `run build` — pass.
  - `npm run verify:repo-guard` — pass.

## Key decisions

- Captured final URL goes into `applyNowUrl` (existing field) rather than introducing a new field, so `pickPipelineEntryUrl` already prefers it without contract changes.
- Easy Apply auto-fill is **opt-in via panel button** to honor the "never submit unattended" rule in `CLAUDE.md`. The auto-advance toggle still hard-stops at Submit and at 8 iterations.
- `buttonAccessibleLabel` uses **all** plausible label sources concatenated rather than a "first hit wins" precedence — this prevents bypasses where a button has innocuous visible text but a malicious title/labelledby.
- Pure helpers live under `apps/server/src/adapters/` so they get vitest coverage; the extension test runner is currently orphaned (the project's own state) but my new tests still run when invoked through `apps/server/.bin/vitest --root`.

## Risks and blockers

- **Slow ATS / readyState stuck on `interactive`:** confirmed URL is captured but not returned until `maxMs` (12s). User-visible delay only on the rare site that never reports `complete`.
- **Popup discovery loop:** no unit coverage. Behavior is empirical from the diagnosis; if `listBbTabs()` hangs, the wrapping `runBb` 120s timeout backstops.
- **LinkedIn modal selector drift:** mitigated by multi-selector + role/text fallback, but quarterly drift expected.
- **iframe-hosted Easy Apply widgets:** rare; not handled in this iteration.

## Final outcome

**Shipped (uncommitted; tests passing).** Both reported issues resolved:

1. **Final URL after Apply** — `linkedin-scan` now captures the truly final ATS URL after LinkedIn's redirect chain settles. When LinkedIn keeps the user on `linkedin.com/jobs/view/...`, the pipeline keeps the LinkedIn URL (no regression).
2. **Easy Apply auto-fill** — the extension panel now exposes a modal-aware "Easy Apply: fill this step" button with an opt-in "auto-advance until Submit" toggle. Multi-layer safety guards (label concatenation across aria-label / aria-labelledby / text / value / title / nested aria, plus `assertSafeClick`) make it impossible for the loop to click any "Submit application" / "Submit" / "Withdraw" button even with adversarial markup.

Total LOC delta: ~520 added (incl. tests), ~40 modified. Two codex review passes; both resolved.
