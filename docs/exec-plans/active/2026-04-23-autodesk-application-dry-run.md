# Autodesk Application Dry Run

## Background

The user asked to test the live application submission flow and write down any
problems found. Repository rules prohibit submitting an application on the
user's behalf, so this task must stop at the final submit boundary while still
verifying the live form flow and blockers.

## Goal

Exercise the real Autodesk Workday application flow for `Machine Learning
Engineer`, reach the final submission boundary without submitting, and record
all issues, missing inputs, and risky questions discovered along the way.

## Scope

- Use the existing Autodesk role context from `reports/315-autodesk-2026-04-23.md`.
- Open the live Autodesk Workday application flow.
- Test the form path up to the final submit/review boundary only.
- Record required fields, validation blockers, and any unanswered questions.
- Do not actually submit the application.

## Assumptions

- The intended target is Autodesk `Machine Learning Engineer`, because it is the
  latest strong apply target in repository state.
- It is acceptable to use the real live application page for inspection and dry
  run validation.
- The user has not authorized final submission, and project rules forbid it.

## Implementation Steps

1. Re-read apply mode and Autodesk evaluation context.
   Verify: target URL, role, fit notes, and no-submit boundary are explicit.
2. Open the live Workday application flow.
   Verify: application page loads and the role matches Autodesk Machine Learning Engineer.
3. Walk the form until the review/submit boundary.
   Verify: required fields, uploads, work authorization questions, and validation errors are captured.
4. Record blockers and open questions.
   Verify: durable plan log includes exact issues and what the user must answer or provide.

## Verification Approach

- Inspect the live form directly.
- Capture visible validation errors and required fields.
- Confirm whether the flow can reach a final review/submit state without
  actually submitting.

## Progress Log

- 2026-04-23: Created plan for Autodesk live application dry run. Next step is
  to open the Workday application flow and test it without final submission.
- 2026-04-23: Re-read `modes/apply.md`, `reports/315-autodesk-2026-04-23.md`,
  and the Autodesk evaluation plan to confirm target role, expected no-submit
  boundary, and likely sponsorship question.
- 2026-04-23: Opened the live Autodesk Workday posting at
  `https://autodesk.wd1.myworkdayjobs.com/ext/job/San-Francisco-CA-USA/Machine-Learning-Engineer_26WD97077-1`
  in Chrome and confirmed the role, requisition ID `26WD97077`, and visible
  `Apply` CTA all match repository state.
- 2026-04-23: Entered the live application flow via `Apply` ->
  `Apply Manually`. Workday redirected to an 8-step application wizard, but the
  first step is a hard authentication gate (`Create Account/Sign In`) before any
  application fields are available.
- 2026-04-23: Switched from `Create Account` to `Sign In` to test whether there
  was an existing account path. No saved session or account bypass appeared. The
  dry run cannot proceed to `My Information` without Autodesk Workday
  credentials, so the test stops here.
- 2026-04-23: Noted an environment inconsistency: the Simplify sidebar marks the
  role as `Applied`, while repository tracker state in `data/applications.md`
  row `311` remains `Evaluated`. The repository remains source of truth, but the
  mismatch can mislead live apply testing.

## Key Decisions

- Use Autodesk as the target role based on current repository state.
- Stop before final submission even if the form is fully complete.
- Prefer `Apply Manually` over extension-driven autofill so the dry run reflects
  the native Workday path and does not mutate application data through a plugin.
- Do not create a new Autodesk Workday account during the dry run. That would
  be a real third-party account creation event and is unnecessary once the login
  gate is established as the blocker.

## Risks and Blockers

- The live form may require authentication, CAPTCHA, email verification, or file
  uploads that are not safely automatable.
- The application may require user-specific answers that are not available in
  repository state.
- Workday may persist partial progress while testing, so actions must stay
  conservative.
- Confirmed blocker: Autodesk Workday does not expose any guest-apply path for
  this role. Reaching `My Information` requires either an existing Autodesk
  Workday login or creation of a new candidate account.
- Confirmed blocker: because authentication happens before application fields,
  this dry run cannot verify resume upload behavior, sponsorship questions,
  additional application questions, voluntary disclosures, or the review page
  without user credentials.
- Environment issue: the Simplify sidebar currently labels this job `Applied`
  even though repository tracker state is `Evaluated`. This does not block
  Workday itself, but it creates conflicting state during manual testing.

## Final Outcome

Dry run reached the real Autodesk Workday application wizard and verified the
exact blocker: step 1 is `Create Account/Sign In`, with no unauthenticated path
to the application form. Because repository rules and current user inputs do
not authorize account creation or provide Autodesk Workday credentials, the
test stopped before `My Information` and never approached final submission.

Issues discovered:

1. Autodesk Workday requires login or account creation before any application
   fields are shown, so the application cannot be fully tested from repository
   state alone.
2. The live Simplify overlay shows this role as `Applied`, but repository
   tracker state remains `Evaluated` in `data/applications.md`. That mismatch
   should not be trusted when deciding whether to continue a live application.
