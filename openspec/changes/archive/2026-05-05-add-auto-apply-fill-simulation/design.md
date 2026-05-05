## Context

Phase 2B turns the Phase 2A foundations into actual per-ATS auto-apply flows. The architecture spec calls for 4 ATS at this stage (Greenhouse, Lever, Ashby, Workday); iCIMS is skipped pending URL-pattern reverse engineering.

This change deliberately ships in **fill-only mode**: every adapter knows how to fill its ATS's form, but `.submit()` is gated behind an explicit opt-in. This is the correct shape for a project where:
- The user has to validate that filled data matches expectations BEFORE any irreversible submission
- Phase 5 risk telemetry (next change) needs to observe behavior before we ever click Submit
- Iteration on form selectors is high — many submit cycles during dev would burn the device fingerprint

## Goals / Non-Goals

**Goals:**
- One `ApplyFlow` interface that all 4 ATS adapters implement
- Each adapter fills standard fields (name / email / phone / location / LinkedIn / portfolio / resume / cover-letter / work-auth / sponsorship)
- Custom per-job questions are SKIPPED and reported in `FillResult.fieldsSkipped` for human review
- A review snapshot (form.html + screenshot.png + data.json) is written before any submit attempt
- Submit method exists but throws `SubmitNotPermittedError` unless `opts.allowSubmit: true`
- Apply-queue runner is wired to call this with `allowSubmit: false` always in this change

**Non-Goals:**
- Actually submitting any application (Phase 2C / future change with explicit user opt-in workflow)
- Custom-question Claude generation (Phase 3+)
- iCIMS adapter (URL pattern broken)
- Multi-step Workday flows beyond the first page (deferred — many Workday apps span 5+ pages)
- Account creation flow (Phase 4)
- Risk telemetry (Phase 5)

## Decisions

### D1 — `ApplyFlow<TFormData>` interface common across ATS

```ts
export interface ApplyFlow<TFormData = ApplicationData> {
  ats: SiteId;
  detectsUrl(url: string): boolean;
  identifyForm(tab: Tab): Promise<FormSchema>;
  fillForm(tab: HumanizedTab, schema: FormSchema, data: TFormData): Promise<FillResult>;
  /** ALWAYS throws SubmitNotPermittedError unless caller's runner explicitly enabled. */
  submit(tab: HumanizedTab, opts: SubmitOptions): Promise<SubmitResult>;
}
```

Each adapter file `src/{ats}/apply.ts` exports an `ApplyFlow` instance.

### D2 — Field identification by selector probes, not full schema parsing

Each adapter has a hardcoded list of selectors per standard field, e.g.:
```ts
const FIELD_SELECTORS = {
  firstName: ['input[name="first_name"]', '#first_name', '[data-qa="first-name"]'],
  email: ['input[type="email"]', 'input[name="email"]', '#email'],
  // ...
};
```
`identifyForm()` probes each selector list, returns the first that matches a visible form field. Custom questions discovered as "any input/textarea NOT in our standard map" go into `FormSchema.unknownFields`.

**Alternative considered:** full DOM-walk + heuristic mapping. Rejected — too brittle, hard to maintain across ATS updates.

### D3 — Default mode = fill-only; submit gated

`SubmitOptions { allowSubmit: boolean }`. The runner skeleton in `apps/server/src/apply-queue/runner.ts` ALWAYS passes `allowSubmit: false` in this change. Phase 2C will add the user-facing opt-in surface for actual submits.

`submit()` checks `opts.allowSubmit` first; if false, throws `SubmitNotPermittedError("submit blocked: allowSubmit must be explicitly true")`.

### D4 — Review snapshot is mandatory after fill

After every fill (regardless of submit), the runner writes:
- `data/apply-snapshots/{id}-{timestamp}/form.html` — full page HTML at fill-complete time
- `data/apply-snapshots/{id}-{timestamp}/screenshot.png` — full-page screenshot
- `data/apply-snapshots/{id}-{timestamp}/data.json` — the structured data that was filled (excluding raw password)
- `data/apply-snapshots/{id}-{timestamp}/result.json` — FillResult with field counts, skipped fields, errors

This directory is gitignored. The user can inspect any apply attempt before deciding to enable real submit.

### D5 — Profile reader produces a typed `ApplicationData`

`packages/auto-apply/src/profile.ts` reads:
- `config/profile.yml` — structured: `{ name, email, phone, location, links: { linkedin, github, portfolio }, resume_path, work_auth, sponsorship_required, default_cover_letter? }`
- Optional `cv.md` for cover-letter generation context

Throws clear errors with remediation if required fields are missing.

### D6 — Adapter scope: 4 ATS, deliberately not 5

Greenhouse, Lever, Ashby, Workday. iCIMS is omitted because its current public URLs are uniformly deprecated (see Phase 1.5 finding). Adding iCIMS without a working URL pattern would be dead code.

## Risks / Trade-offs

- **ATS UI drift** — selectors break when ATS updates UI. Mitigation: each FIELD_SELECTORS has 3+ alternates; clear `AdapterParseError` if all alternates miss; tests use captured form HTML as fixtures so UI changes flag in CI.
- **Custom-question coverage** — many ATS forms have 3-10 custom questions per posting (e.g., "why this company?"). This change reports them in `fieldsSkipped` rather than filling. Phase 3+ can add Claude-generated answers. Acceptable for fill-simulation.
- **Multi-step Workday** — Workday applications often span Personal Info → Work Experience → Education → Voluntary Disclosures → Review. This change handles only the first page. Phase 2C (or a follow-up to this) extends to full multi-step.
- **Resume upload** — file uploads via playwright are well-supported but require the file to exist. Profile loader validates `resume_path` exists; throws if not.
- **Test isolation** — fakeTab in unit tests doesn't actually inject HTML; we mock `tab.evaluate` returns and `humanizedTab.fill/click` calls. We assert call counts and arguments, not actual DOM mutation. One `RUN_APPLY_INTEGRATION=1` integration test serves a `data:text/html` form to verify the round-trip works on real Chrome.

## Migration Plan

Pure-additive. No existing code changes except wiring `apps/server/src/apply-queue/runner.ts` (new file). Revert by removing the new package + runner.

Rollout: ship to private repo. Future Phase 2C user-facing opt-in for real submits is a SEPARATE change with its own brainstorm — that change introduces irreversible action surface and deserves its own deliberate review.

## Open Questions

None at design time. Phase 2C will brainstorm separately.
