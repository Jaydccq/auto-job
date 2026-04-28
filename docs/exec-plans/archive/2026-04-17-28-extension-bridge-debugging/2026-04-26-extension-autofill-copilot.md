# Extension Autofill Copilot

## Background

The extension already has a Simplify-inspired light UI and a floating in-page
panel. The user asked to complete a Simplify-like plugin with automatic
information filling, but better.

Simplify is a reference for workflow quality, not branding. Current public
Simplify docs describe one-profile job search, repetitive application autofill,
field-level autofill controls, AI answers for unique questions, and a copy/paste
profile fallback when autofill is unsupported.

## Goal

Add a local-first application form autofill feature to the existing career-ops
Chrome extension.

The feature should read candidate information from repository-owned files,
preview what can be filled, fill only user-approved fields, and never submit an
application or advance a multi-page application automatically.

## Scope

In scope:
- Add a bridge endpoint that exposes a safe autofill profile assembled from
  `config/profile.yml` and `cv.md`.
- Extend the extension message contract and bridge client with typed autofill
  requests.
- Add an injected-panel autofill surface with preview, field counts, confidence,
  and a user-triggered fill action.
- Fill common text, textarea, and select fields on the current page using
  visible labels, placeholders, names, IDs, and nearby text.
- Add targeted bridge tests for profile assembly and endpoint wiring.
- Update extension design documentation and this plan with the final result.
- Optimization pass: improve profile coverage for compensation fields, support
  conservative yes/no select/radio/checkbox filling, and reduce generic URL
  false positives.

Out of scope:
- Submitting applications, clicking Apply/Easy Apply/Next/Continue/Submit, or
  clicking upload/save controls automatically.
- Site-specific ATS automation for Workday, Greenhouse, Lever, iCIMS, or Taleo.
- LLM-generated long-answer question drafting.
- Continuous multi-page autofill.
- Storing new personal data inside extension storage.
- Copying Simplify branding, assets, names, or proprietary layouts.

## Assumptions

- Repository files remain the system of record for personal data.
- The bridge is the correct filesystem boundary; extension code should not read
  repo files directly.
- Autofill should default to safe repeated profile fields first: name, email,
  phone, location, links, work authorization, sponsorship, and skills.
- A conservative "fill matched fields on this page" button is better than
  background automation because the repo has a hard no-submit rule.
- The existing injected panel is the right UI surface because it can inspect and
  update the host page DOM without adding another content-script architecture.

## Uncertainties

- Actual ATS field markup varies heavily; generic heuristics will miss some
  custom widgets.
- `config/profile.yml` may not contain every answer users expect from a
  dedicated autofill product.
- Long-answer question drafting needs an explicit quality and safety design
  before using generated prose in application forms.
- Checkbox/radio controls are only safe when the answer can be mapped to a
  clear yes/no option.

## Simplest Viable Path

Reuse the current extension and bridge:

```
config/profile.yml + cv.md
        │
        ▼
Bridge adapter readAutofillProfile()
        │
        ▼
POST /v1/autofill/profile
        │
        ▼
background bridge-client + runtime message
        │
        ▼
injected panel preview
        │
        ▼
user clicks Autofill current page
        │
        ▼
visible form fields receive local profile values
```

## Success Criteria

- The panel shows an "Application autofill" section on normal pages.
- The extension can fetch a local profile through the authenticated bridge.
- The panel can preview match counts before filling.
- Clicking the autofill button fills supported current-page fields and reports
  filled/skipped counts.
- The implementation does not submit, click upload/save controls, click next,
  or persist personal values in extension state.
- `npm --prefix bridge test -- --runInBand` or the repo-supported equivalent
  targeted bridge test passes.
- `npm --prefix bridge run typecheck` passes.
- `npm --prefix extension run typecheck` passes.
- `npm --prefix extension run build` passes.
- `git diff --check` passes.

## Implementation Steps

1. Add shared autofill contracts and profile extraction helper.
   Verify: unit tests cover profile fields from a temp repo fixture.
2. Add bridge endpoint and adapter method.
   Verify: server injection test returns the adapter profile and validates auth.
3. Extend extension bridge client, runtime message contracts, and background
   router.
   Verify: extension typecheck catches message mismatch.
4. Add injected-panel autofill UI and DOM fill heuristics.
   Verify: build succeeds and static smoke confirms the panel renders.
5. Update docs and plan results.
   Verify: plan records decisions, risks, verification, and remaining gaps.

## Verification Approach

- `npm --prefix bridge test -- autofill`
- `npm --prefix bridge run typecheck`
- `npm --prefix extension run typecheck`
- `npm --prefix extension run build`
- `./bridge/node_modules/.bin/vitest run extension/test/autofill-option-scoring.test.ts`
- `git diff --check`

## Key Decisions

- Reuse the existing extension instead of creating a parallel plugin.
- Keep personal data read-only from repo files and served through the local
  authenticated bridge.
- Use explicit click-to-fill behavior instead of continuous automation.
- Prefer conservative field matching and visible user feedback over silent fills.
- For option questions, score the actual rendered option text against the
  profile answer and require a field-specific confidence threshold. If no
  option is credible, skip the control instead of forcing a preset answer.

## Risks And Blockers

- Generic form matching may fail on heavily custom ATS widgets.
- YAML/CV parsing must stay tolerant because user profile files vary.
- Autofill can write incorrect values if labels are ambiguous; the UI must make
  it clear how many fields were filled and skipped.
- Browser-extension DOM behavior is hard to fully prove without installing the
  unpacked extension in Chrome.

## Progress Log

- 2026-04-26: Created plan after reading `CLAUDE.md`, `DATA_CONTRACT.md`,
  extension design/panel/message code, bridge server/adapter contracts, and
  existing extension refresh plan.
- 2026-04-26: Checked public Simplify docs for current feature shape. Kept
  only workflow ideas: one profile, repetitive application autofill, field
  controls/copy fallback, and application tracking context.
- 2026-04-26: Added typed autofill contracts, a repo-backed profile reader,
  bridge adapter method, and `/v1/autofill/profile`.
- 2026-04-26: Added extension runtime message/client support and an injected
  panel autofill section with profile preview, matched-field chips, and
  click-to-fill behavior.
- 2026-04-26: Updated extension design docs with autofill safety boundaries.
- 2026-04-26: Ran targeted bridge autofill test, bridge server endpoint test,
  bridge typecheck, and extension typecheck successfully.
- 2026-04-26: Further optimized autofill by adding desired/minimum salary
  profile fields, yes/no select/radio/checkbox support for sponsorship-style
  questions, numeric salary coercion for number inputs, and stricter URL-field
  matching.
- 2026-04-26: User reported the panel still shows "Bridge not reachable" after
  starting the bridge and asks not to request permissions constantly. Diagnosis:
  unauthenticated health can prove the bridge is running while an invalid cached
  token still makes authenticated extension health fail; capture also prechecks
  optional host permissions before trying the active-tab scripting grant.
- 2026-04-26: User provided a concrete PERSONAL DETAILS form shape: title,
  first/middle/last name, email, country code, phone number, country, address
  lines, city, county, state, and postal code. Added the supplied home address
  to `config/profile.yml` and expanded autofill fields/matching for that shape.
- 2026-04-26: Tightened PERSONAL DETAILS matching so direct labels and
  autocomplete attributes outrank broad section text. This prevents `Full name`
  from stealing `First Name`, prevents address fields from stealing country or
  state dropdowns, and keeps `Tax District` separate from `County`.
- 2026-04-26: User reported the panel showed `Mode: fake`. Verified that a
  bare `bridge` start defaults to fake mode, stopped the fake bridge process,
  and restarted through `npm run ext:bridge`, which sets real Codex mode.
- 2026-04-26: User expanded autofill expectations for application questions,
  Education, Experience, and EEO. Added profile-driven answers for age 18,
  legal work authorization, sponsorship, F-1 OPT / H-1B visa text, disability,
  race/ethnicity, veteran status, two education entries, and one work
  experience entry.
- 2026-04-26: Updated extension matching to avoid preferred-location fields,
  prefer pure national phone digits when a country-code field exists, support
  `NC` and `North Carolina` option/text variants, and click matching Yes/No
  radio/button controls only when both the question and option match.
- 2026-04-26: User provided a broader Personal Info / Employment Information /
  Portfolio & Links template. Added birthday, E.164 phone, per-country work
  authorization, LGBTQ+, gender, current school, expected graduation year, and
  preferred work location fields.
- 2026-04-26: Added preferred-work-location support that only uses
  `autofill.preferred_work_locations`, never the home address, for questions
  such as "Where would you like to work?".
- 2026-04-26: User explicitly requested automatic resume attachment from
  `docs/Hongxi_Chen_full_stack.pdf`. Added a bridge resume endpoint and
  extension file-input attachment for matched resume/CV fields; the extension
  still does not click submit, continue, next, upload, or save controls.
- 2026-04-26: User added common application questions for job source,
  relocation, desired start date, and on-site work. Added profile fields and
  matcher guards for `LinkedIn`, relocation `Yes`, start date `June`, and
  on-site work `Yes`.
- 2026-04-26: User reported inaccurate option-question handling when the page
  does not contain the exact preset answer. Extracted option scoring into a
  testable pure module, added option-content tests, and updated panel matching
  so radio/checkbox/button questions use surrounding question text plus the
  actual option label before selecting.
- 2026-04-27: User reported segmented application buttons like Yes/No work
  authorization controls are not filled. Goal: support custom choice buttons
  without widening into submit/next/upload automation. Assumption: these
  controls may be native buttons, `input[type=button]`, or ARIA
  `[role=button]` elements whose option text is separate from the question.
  Verification target: option-button selector/classification tests plus
  extension typecheck/build.
- 2026-04-27: Implemented segmented-button support. The autofill scan now
  includes `[role=button]`, keeps `input[type=button]` fillable, classifies
  those controls as choice buttons, and reads their visible option text before
  applying the existing question+answer scoring. Existing submit/reset/file
  safety boundaries remain in place.
- 2026-04-27: Verification passed:
  `./bridge/node_modules/.bin/vitest run extension/test/autofill-option-scoring.test.ts`,
  `npm --prefix extension run typecheck`, `npm --prefix extension run build`,
  and `git diff --check`.
- 2026-04-27: Added a regression case for the exact sponsorship wording class:
  "Do you now or at a future date require visa sponsorship to work in the
  United States?" with bare `Yes`/`No` buttons. This is intentionally covered
  by the sponsorship option scorer plus the segmented-button selector support.
- 2026-04-27: User reported the BetterUp Ashby application still fails for
  `LinkedIn Profile` and the same sponsorship buttons. Inspected the live
  Ashby-rendered DOM with Playwright. Finding: Ashby renders Yes/No as native
  `<button>` elements without `type="button"`, so the browser exposes them as
  submit buttons and the previous safety filter excluded them before scoring.
  Ashby text inputs also expose stable question labels through
  `.ashby-application-form-field-entry` / `data-field-path` containers.
- 2026-04-27: Updated autofill DOM matching to allow native submit-type buttons
  through the candidate scan while still excluding reset controls and relying on
  option/question scoring before any click. Added Ashby field-container label
  extraction so fields like `LinkedIn Profile` are matched from their nearest
  application field wrapper.
- 2026-04-27: User provided more concrete answers and labels:
  `Preferred Last Name: Chen`, `Please list the city and state/province that
  you are located in today: Durham, NC`, and future sponsorship `Yes`. Profile
  data already contains last name, current location, and sponsorship answers, so
  only alias coverage was needed. Added `preferred last name` to last-name
  aliases and city/state/province/current-location wording to location aliases.
- 2026-04-27: User reported `Phone Number`, `Preferred First Name`,
  `Preferred Last Name`, and `Linkedin Profile or Website` still do not match
  on another application form. Fixed two issues: `Preferred Last Name` was
  accidentally blocked by the generic `preferred name` guard, and non-Ashby
  forms often put labels in nearby sibling/container elements rather than
  standard `label[for]`. Added nearby field-title extraction and a combined
  LinkedIn-or-website alias.
- 2026-04-27: User reported `Preferred Last Name` still fails. Root cause is
  likely nearby-label extraction pulling adjacent `Preferred First Name` text
  into the same direct label. Tightened name guard logic so explicit
  `last name` labels are not invalidated by nearby `first name` text, and
  explicit `first/given name` labels are not invalidated by nearby sibling
  last-name text.
- 2026-04-27: User reported `Please list the city and state/province that you
  are located in today` still fails. Added a direct current-city-state question
  recognizer that boosts the combined `location` field and suppresses separate
  `city`/`state` fields for that single-input wording.

## Follow-Up Goal: Bridge And Permission Friction

- Show "token invalid / reconnect" separately from "bridge not reachable".
- Allow the user to paste a fresh token from the panel when the cached token is
  stale.
- Try current-tab capture first and only request host permission after Chrome
  actually blocks scripting.
- Preserve the no-submit autofill boundary.

## Follow-Up Result: Bridge And Permission Friction

- Removed the capture-time permission precheck from the background worker.
  Capture now tries the current active tab first, using Chrome's `activeTab`
  grant from the toolbar click, and only opens the permission flow if scripting
  actually fails with a host-permission error.
- Updated the injected panel and popup health handling so `UNAUTHORIZED` shows
  "Bridge is running, but the saved token is invalid" and reopens the token
  setup input instead of saying the bridge is unreachable.
- Updated autofill profile errors so stale-token failures point the user to
  reconnect the bridge token instead of showing generic "Profile unavailable."

## Follow-Up Result: Personal Details Coverage

- Added `candidate.phone_country_code`, `candidate.phone_national`, and
  `candidate.address` to `config/profile.yml` so the repository remains the
  system of record for personal details.
- Added autofill field kinds for title, middle name, phone country code, phone
  number, address lines, county, state, and postal code.
- Kept title opt-in: the extension can fill it if `candidate.title` exists, but
  it will not infer `Mr./Ms./Doctor` from the user's name.
- Improved option matching for dependent dropdowns such as country, country
  code, and state. Example: `NC` can match a `North Carolina` option, and `+1`
  can match a United States phone-code option.
- Improved field scoring for Workday/Oracle-style grouped PERSONAL DETAILS
  sections by treating the input's own label as strong evidence and nearby
  section text as weak evidence only.
- Bridge launch rule: use `npm run ext:bridge` for the extension bridge. Do
  not use bare `cd bridge && npm run start` unless explicitly testing fake
  mode, because missing `CAREER_OPS_BRIDGE_MODE` defaults to `fake`.
- Preferred Location rule: do not fill preferred/desired/target location fields
  from the home-address profile. Only current address/location fields should be
  filled.
- Phone rule: when a country-code field is present, fill the national number as
  digits only.
- Application question rule: fill two-option Yes/No controls for stable
  profile facts only: age 18 = Yes, legally authorized = Yes, sponsorship =
  Yes, current job = No, internal candidate = No.

## Follow-Up Result: Option Question Scoring

- Added `extension/src/shared/autofill-option-scoring.ts` as the mechanical
  rule layer for option controls. It scores the actual option label for
  sponsorship, work authorization, age, relocation, on-site work, disability,
  race/ethnicity, LGBTQ+, gender, veteran status, job source, desired start
  date, title, visa status, and preferred work locations.
- Added `extension/test/autofill-option-scoring.test.ts` for the most
  failure-prone cases: sponsorship options containing a misleading bare `Yes`,
  disability decline-to-answer options, East Asian -> Asian fallback,
  LinkedIn -> online job board fallback, June -> summer fallback, and unrelated
  options that must be rejected.
- Updated panel matching so radio/checkbox/button controls read nearby question
  text from `aria-labelledby`, `aria-describedby`, fieldset legends, and nearby
  question-like siblings before selecting an option.
- Verified:
  - `./bridge/node_modules/.bin/vitest run extension/test/autofill-option-scoring.test.ts`
  - `npm --prefix extension run typecheck`
  - `npm --prefix extension run build`
  - `git diff --check`
  - `npm run verify`
- `npm run verify` finished with 0 errors and the two existing duplicate
  tracker warnings for RemoteHunter and Anduril.
- Restarted the extension bridge with `npm run ext:bridge`; it is listening on
  `127.0.0.1:47319` in real/codex mode.

## Follow-Up Result: Location Select Matching

- User reported that a `Location` dropdown could not fill
  `Durham, North Carolina, United States`.
- Root cause: the profile value can be `Durham, NC, USA`, while many ATS
  dropdowns render the option as `Durham, North Carolina, United States`.
  The existing option matcher normalized punctuation/case but did not expand
  state and country abbreviations inside composite location strings.
- Added canonical location matching so `NC` and `North Carolina`, plus `US`,
  `USA`, `U.S.`, `U.S.A.`, and `United States`, compare as equivalent inside
  longer location labels.
- Tightened generic short-value matching so unrelated short labels such as
  `Mr.` and `Mrs.` do not match by substring; state and country abbreviations
  are handled by the explicit location canonicalizer instead.
- Added option-scoring coverage for both directions:
  `Durham, NC, USA` -> `Durham, North Carolina, United States` and
  `Durham, North Carolina, United States` -> `Durham, NC, US`.
- Verified:
  - `./bridge/node_modules/.bin/vitest run extension/test/autofill-option-scoring.test.ts`
  - `npm --prefix extension run typecheck`
  - `npm --prefix extension run build`
  - `git diff --check`
  - `npm run verify`
- `npm run verify` finished with 0 errors and the two existing duplicate
  tracker warnings for RemoteHunter and Anduril.

## Follow-Up Result: Combined Work Auth And Full-Time Start Questions

- User reported three missed questions:
  - `Are you legally authorized to work in the United States or the United Kingdom?`
  - `Will you now or in the future require sponsorship (e.g., a work visa) to work in the United States or the United Kingdom?`
  - `How soon can you start full-time?`
- Root cause: combined US/UK work-authorization questions could be blocked by
  the generic work-authorization country guard, some radio controls expose the
  whole yes/no block as one label, and the full-time start wording was missing
  from the desired-start-date aliases.
- Updated matching so combined US/UK authorization questions are eligible for
  the configured legal-work-authorization answer.
- Updated option-control scoring so radio/checkbox controls score individual
  option candidates such as `value="Yes"` separately from the surrounding
  question block. This prevents a valid `Yes` option from being rejected just
  because nearby text also contains `No`.
- Added `how soon can you start`, `start full time`, and `start full-time` to
  desired-start-date aliases.
- Verified:
  - `./bridge/node_modules/.bin/vitest run extension/test/autofill-option-scoring.test.ts`
  - `npm --prefix bridge test -- autofill-profile`
  - `npm --prefix extension run typecheck`
  - `npm --prefix extension run build`
  - `git diff --check`
  - `npm run verify`
- `npm run verify` finished with 0 errors and the two existing duplicate
  tracker warnings for RemoteHunter and Anduril.
- Restarted `npm run ext:bridge` in real/codex mode so the new profile alias is
  live on `127.0.0.1:47319`.
- EEO rule: fill the configured disability, race/ethnicity, and protected
  veteran answers from `config/profile.yml`; do not infer them from `cv.md`.
- Personal info rule: fill birthday only from explicit `candidate.birthday`,
  and fill combined phone fields with E.164 format while keeping split phone
  fields as country code plus national digits.
- Work authorization rule: country-specific questions use explicit US, Canada,
  and UK values from `autofill.application_questions`.
- Identity question rule: LGBTQ+ and gender are explicit profile fields under
  `autofill.eeo`; do not infer them from name or resume content.
- Resume rule: attach only the configured PDF from `autofill.resume.path` to
  matched resume/CV file inputs after the user clicks "Autofill current page".
  Skip cover-letter, transcript, portfolio, image, headshot, and avatar fields.
- Start date rule: fill desired/available start date questions from
  `autofill.application_questions.desired_start_date`; do not use this for
  Education or Experience start-date fields.

Verification:
- `npm --prefix bridge test -- autofill`: passed.
- `npm --prefix bridge run typecheck`: passed.
- `npm --prefix extension run typecheck`: passed.
- `npm --prefix extension run build`: passed.
- `git diff --check`: passed.
- `npm run verify`: passed with existing tracker duplicate warnings only
  (`RemoteHunter — Software Engineer`, `Anduril Industries — Software
  Engineer`).
- Authenticated `/v1/health` after restart: passed with `mode=real` and
  `realExecutor=codex`.
- Local profile read after new fields: passed with national phone digits, 2
  education entries, and 1 experience entry.
- Restarted `npm run ext:bridge`; authenticated health and
  `/v1/autofill/profile` passed with `mode=real`, `realExecutor=codex`,
  `phoneNational=3417327552`, 2 education entries, and 1 experience entry.
- Local profile read after broader template fields: passed with
  `phone=+13417327552`, `birthday=2002-03-12`, US/Canada/UK work authorization,
  LGBTQ+ status, gender, school, graduation year, and 9 preferred work
  locations.
- Restarted `npm run ext:bridge`; authenticated health and
  `/v1/autofill/profile` passed with `mode=real`, `realExecutor=codex`,
  `phone=+13417327552`, birthday, LGBTQ+, gender, and 9 preferred locations.
- Resume fixture test: `readAutofillResume` returns filename, PDF mime type,
  size, and base64 payload for the configured resume path.
- Server endpoint test: `/v1/autofill/resume` returns the adapter-provided
  PDF payload through the authenticated bridge envelope.
- Restarted `npm run ext:bridge`; authenticated `/v1/autofill/resume` passed
  with `filename=Hongxi_Chen_full_stack.pdf`, `mimeType=application/pdf`, and
  `sizeBytes=85602`.
- Restarted `npm run ext:bridge`; authenticated `/v1/autofill/profile` passed
  with `jobSource=LinkedIn`, `willingToRelocate=Yes`,
  `desiredStartDate=June`, and `onsiteWork=Yes`.

## What Already Exists

- Existing MV3 extension: reused for panel injection, popup/background routing,
  token storage, and bridge messaging.
- Existing bridge server: reused for authenticated local filesystem access.
- Existing `config/profile.yml` and `cv.md`: reused as the only candidate data
  source.
- Existing design refresh: reused the Simplify-inspired light UI instead of
  adding a separate product surface.

## NOT In Scope

- Site-specific ATS robot flows: deferred because generic click-to-fill gives
  value without adding brittle per-site automation.
- LLM-generated long answers: deferred because answer quality and source
  boundaries need a separate design.
- Continuous multipage autofill: deferred because it conflicts with the
  repo-level no-submit/no-application-automation safety boundary.
- Clicking submit, next, continue, save, or upload controls remains out of
  scope. Resume attachment is allowed only for matched file inputs after the
  user explicitly requested it.

## Failure Modes

- Ambiguous label match fills a wrong empty field.
  Test coverage: generic matching is typechecked but not browser-E2E tested.
  Error handling: panel reports filled/skipped counts and only fills on click.
  User impact: visible on the form before submission, not silent final submit.
- Radio/checkbox yes/no wording maps to the wrong option.
  Test coverage: extension typecheck covers control handling; no browser-E2E
  fixture yet.
  Error handling: matching is restricted to sponsorship/work-authorization
  fields and only runs when an option label matches yes/no intent.
  User impact: visible before submission; user can correct the field.
- Bridge profile unavailable because token/bridge is missing.
  Test coverage: existing auth/error envelope paths plus extension typecheck.
  Error handling: panel shows profile unavailable and disables fill.
  User impact: clear local error, no field writes.
- Custom ATS widget is not a native input/select/textarea.
  Test coverage: not covered by unit tests.
  Error handling: unsupported controls are skipped.
  User impact: clear skipped count; user fills manually.

## Final Outcome

Implemented.

Verification:
- `npm --prefix bridge test -- autofill`: passed.
- `npm --prefix bridge test -- server.test.ts`: passed.
- `npm --prefix bridge run typecheck`: passed.
- `npm --prefix extension run typecheck`: passed.
- `npm --prefix extension run build`: passed.
- `git diff --check`: passed.
- `npm run verify`: passed with existing tracker duplicate warnings only
  (`RemoteHunter — Software Engineer`, `Anduril Industries — Software
  Engineer`).
- Optimization verification:
  - `npm --prefix bridge test -- autofill`: passed after compensation-field
    additions.
  - `npm --prefix bridge run typecheck`: passed.
  - `npm --prefix extension run typecheck`: passed.

## Follow-Up Triage: Option-Aware Question Autofill

Background:
- User reported that autofill still treats application questions as preset
  fields. In dropdown/select cases, it can fail when the option labels do not
  literally match the stored answer.

Goal:
- File a GitHub issue with a durable TDD plan for option-aware question
  answering before changing implementation.

Scope:
- In scope: diagnose the current autofill data flow, identify the behavioral
  root cause, define observable tests, and create a GitHub issue.
- Out of scope: implement the fix in this triage pass or broaden application
  automation beyond click-to-fill.

Assumptions:
- Repository profile files remain the only candidate fact source.
- The extension must still leave ambiguous questions untouched for review.
- The no-submit/no-next/no-save boundary remains unchanged.

Uncertainties:
- ATS dropdowns may use native selects, ARIA listboxes, or custom comboboxes;
  the first fix should prove native select behavior and leave custom widgets as
  follow-up unless covered by the same public helper.

Key decisions:
- Treat this as a missing behavior contract, not just another alias list.
- Tests should assert observable page behavior: resolved option selected,
  ambiguous option skipped, and preview counts only fields with a resolved
  selectable option.
- The GitHub issue body should avoid file paths and implementation details so
  it remains useful after refactors.

TDD fix plan:
1. RED: a sponsorship dropdown whose options say "I will now or in the future
   require employer sponsorship" and "I do not require sponsorship" should
   select the sponsorship-required option when the profile fact says
   sponsorship is required.
   GREEN: add an option-decision layer that considers the visible question,
   option labels, and profile facts before selecting an option.
2. RED: a work-authorization dropdown should select the authorization option
   when option text differs from the preset answer but clearly expresses the
   same fact.
   GREEN: add normalized intent mappings for work authorization separate from
   raw answer-string matching.
3. RED: a dropdown with no safely mappable option should remain unchanged and
   report review-needed instead of being counted as fillable.
   GREEN: require option resolution before preview/fill claims a select match.
4. RED: radio, checkbox, and button-like option controls should use the same
   question-plus-options decision behavior.
   GREEN: share the option-decision path across option controls.
5. RED: EEO/self-identification controls should only use explicitly configured
   profile values and skip ambiguous choices.
   GREEN: keep sensitive-question allowlists strict and emit an abstain reason.
6. REFACTOR: extract DOM option-choice behavior into a testable helper with
   fixture-backed tests, while preserving text-field, country/state, salary,
   and resume attachment behavior.

Verification approach:
- Add DOM-level autofill tests for native select and option controls.
- Run `npm --prefix extension run typecheck`.
- Run `npm --prefix extension run build`.
- Run `npm --prefix bridge test -- autofill-profile`.
- Run `git diff --check`.

Progress log:
- 2026-04-27: Triaged reported dropdown failure. Found that current autofill
  matches controls to static profile fields, then tries to match the preset
  value against option labels. It does not yet ask "given this question and
  these choices, which option is supported by profile facts?"
- 2026-04-27: Verified existing coverage with
  `npm --prefix bridge test -- autofill-profile` and
  `npm --prefix extension run typecheck`; both passed. No extension DOM-level
  test currently exercises select/radio option-answer behavior.
- 2026-04-27: Created GitHub issue
  https://github.com/santifer/career-ops/issues/492.

Risks and blockers:
- Without a DOM-level test harness, future fixes can keep passing typecheck
  while regressing actual page behavior.
- Over-broad option mappings could fill sensitive or legally meaningful
  questions incorrectly; ambiguous choices must default to skip/review.

Final outcome:
- Triage complete. The follow-up implementation was completed later in the
  option-question scoring and location-select matching sections above; issue
  https://github.com/santifer/career-ops/issues/492 can be closed after review.

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | — |
| Codex Review | `/codex review` | Independent 2nd opinion | 0 | — | — |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 6 | clean | 0 issues, 0 critical gaps |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | — |

- **UNRESOLVED:** 0
- **VERDICT:** ENG CLEARED — ready to implement.

## Follow-Up Result: Testable DOM Matcher + Button/Reading Robustness

User report: "autofill 工具会遇到各种按钮无法识别，无法选中的问题。同时读取也有
问题" — generic complaint that buttons (radios, segmented Yes/No, ARIA choice
controls) and field-label reading were unreliable across ATS variants.

Root cause: every DOM helper (visibility check, label resolution, option text
extraction, scoring, scan loop) lived inside the `initPanel()` closure in
`extension/src/panel/inject.ts`. Because nothing was exported, no automated
test could exercise the matcher on real markup, and regressions could only be
caught by loading the extension into Chrome on a live application form.

Approach (TDD):

1. Added `happy-dom` to `bridge` devDependencies as the test runtime.
2. Extracted the pure DOM helpers into
   `extension/src/shared/autofill-dom.ts`:
   - `isAutofillElementVisible` / `isAutofillCandidate`: now reject
     `aria-hidden` ancestors, ancestor inline `display:none` /
     `visibility:hidden`, and respect computed style when available. Layout
     check is opt-in (test runtime passes `requireLayout: false`).
   - `directControlLabel` / `nearbyFieldLabelText`: widened field-container
     selectors to include `.application-question`, `.field-row`,
     `[data-question]`, `[data-field]`, `[role='group']`, and field titles
     `.application-question-title`, `.question-title`, `.field-label`,
     `.question`, `[role='heading']`. Increased scan depth (parents 5 → 6,
     container children 4 → 6).
   - `choiceQuestionLabel`: depth 4 → 6, leading children 3 → 5.
   - `optionTextCandidatesForControl`: now also reads `nextElementSibling`
     text and adjacent text nodes (e.g. `<input type="radio"> Yes`,
     `<input><span>Yes</span>`). Includes any non-empty `value` attribute,
     not just `yes/y/true/no/n/false`.
3. Extracted scoring + scan loop into
   `extension/src/shared/autofill-matcher.ts` exposing `scoreAutofillMatch`,
   `scanAutofillMatches`, `optionMatchesAnswer`, `checkboxShouldBeChecked`,
   `bestSelectOption`, `pageHasPhoneCountryCodeControl`, and
   `resumeFileControls`. Each takes a `Document` argument so the engine is
   pure and testable.
4. Slimmed `inject.ts` from ~2745 lines to ~2230 by deleting the duplicate
   closure helpers and importing from the shared modules.
5. Added two new test suites with happy-dom fixtures:
   - `extension/test/autofill-dom.test.ts` (33 tests): visibility filters,
     control kind classification, direct/nearby label resolution, choice
     question label resolution, option text candidate extraction, already-set
     detection, end-to-end candidate scanning.
   - `extension/test/autofill-matcher.test.ts` (21 tests): Greenhouse text
     fields, deep nesting, Lever-style application-question groups, Ashby
     segmented buttons, native radios with sibling labels, ARIA `role=button`
     segmented controls, `input[type=button]` Yes/No, country selects,
     descriptive sponsorship selects, visibility/disabled exclusion, and
     false-positive guards (preferred-location vs home address, employer name
     vs personal name, preferred last name).

DOM-level rules now enforced by tests:
- Hidden inputs (`display:none`, `visibility:hidden`, `hidden`,
  ancestor `aria-hidden="true"`) are excluded from the candidate set.
- Native `<button>` (allowing default submit-type), `[role='button']`, and
  `input[type='button']` participate in choice scoring.
- Radio/checkbox option text reads `label[for=id]`, wrapping `<label>`,
  `nextElementSibling`, and the immediately following text node.
- Field-title containers include Greenhouse, Lever, Ashby, and ARIA group
  patterns.

Verification:
- `./bridge/node_modules/.bin/vitest run extension/test/`: 61 tests passed.
- `npm --prefix bridge test`: 244 tests passed.
- `npm --prefix bridge run typecheck`: passed.
- `npm --prefix extension run typecheck`: passed.
- `npm --prefix extension run build`: passed.
- `git diff --check`: passed.
