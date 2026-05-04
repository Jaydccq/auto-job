## ADDED Requirements

### Requirement: Workspace package `@auto-job/auto-apply`

The system SHALL provide a private workspace package `packages/auto-apply/` exposing the `ApplyFlow<TFormData>` interface, per-ATS adapter implementations (greenhouse / lever / ashby / workday), an `applyFlowFor(ats)` factory, the `runApplyFlow` orchestrator, and the profile reader.

The package SHALL declare `@auto-job/browser`, `@auto-job/humanize`, `@auto-job/credentials` as workspace dependencies.

#### Scenario: Importable from apps/server

- **WHEN** an `apps/server` source file declares `import { applyFlowFor } from "@auto-job/auto-apply"`
- **THEN** TypeScript resolves the import without error and the server typecheck passes

### Requirement: ApplyFlow contract

Each ATS adapter SHALL implement:

```ts
interface ApplyFlow<TFormData = ApplicationData> {
  ats: SiteId;                                       // "greenhouse" | "lever" | ...
  detectsUrl(url: string): boolean;                   // does this URL look like an apply page for me?
  identifyForm(tab: Tab): Promise<FormSchema>;        // probe selectors, return field map + unknownFields
  fillForm(tab: HumanizedTab, schema: FormSchema, data: TFormData): Promise<FillResult>;
  submit(tab: HumanizedTab, opts: SubmitOptions): Promise<SubmitResult>;
}
```

Where `FillResult` includes `{fieldsFilled, fieldsSkipped, reviewSnapshotPath}` and `SubmitOptions` includes `{allowSubmit: boolean}`.

#### Scenario: detectsUrl positive case

- **WHEN** `greenhouseApplyFlow.detectsUrl("https://boards.greenhouse.io/stripe/jobs/12345")` is called
- **THEN** the return value is `true`

#### Scenario: detectsUrl negative case

- **WHEN** `greenhouseApplyFlow.detectsUrl("https://www.linkedin.com/jobs/view/...")` is called
- **THEN** the return value is `false`

#### Scenario: identifyForm returns FormSchema with both standard and unknown fields

- **WHEN** `identifyForm(tab)` runs against an apply page with standard name/email fields PLUS a custom "Why this role?" textarea
- **THEN** the returned `FormSchema.standardFields` includes `firstName`, `lastName`, `email`
- **AND** `FormSchema.unknownFields` includes the custom textarea selector with its visible label text

### Requirement: fill-only mode by default — submit gated

The `submit()` method SHALL throw `SubmitNotPermittedError` if `opts.allowSubmit` is anything other than the literal boolean `true`. The runner skeleton in `apps/server/src/apply-queue/runner.ts` SHALL ALWAYS pass `allowSubmit: false` in this change.

`runApplyFlow(...)` SHALL never call `submit()` unless explicitly told to via its own `allowSubmit: true` option, which the runner does NOT currently set.

#### Scenario: submit without explicit allowSubmit throws

- **WHEN** `flow.submit(tab, {})` or `flow.submit(tab, { allowSubmit: false })` is called
- **THEN** the call throws `SubmitNotPermittedError`

#### Scenario: submit with allowSubmit: true proceeds (in code; not exercised in tests)

- **WHEN** `flow.submit(tab, { allowSubmit: true })` is called
- **THEN** the call proceeds with the submit logic (this requirement does NOT exercise an actual submit click in any test; the unit tests assert the gate, not the click)

### Requirement: Review snapshot mandatory after fill

After every successful `runApplyFlow` execution, the system SHALL write a review snapshot directory `data/apply-snapshots/{id}-{ISO-timestamp}/` containing:

- `form.html` — full-page HTML at fill-complete time
- `screenshot.png` — full-page screenshot
- `data.json` — structured data that was filled (with password REDACTED, never raw)
- `result.json` — `FillResult` with field counts and skipped fields

The snapshot directory SHALL be gitignored.

#### Scenario: Snapshot directory created with all 4 files

- **WHEN** `runApplyFlow(...)` completes successfully against a fakeTab
- **THEN** a directory `data/apply-snapshots/{id}-*/` exists
- **AND** it contains `form.html`, `screenshot.png`, `data.json`, `result.json`

#### Scenario: Snapshot data.json never contains the raw password

- **WHEN** the apply flow used a vault entry whose password was "TopSecret123!"
- **AND** the resulting `data.json` is read back
- **THEN** the JSON does NOT contain the substring "TopSecret123!"
- **AND** the password field contains "<redacted>" or is omitted entirely

### Requirement: Profile reader produces typed ApplicationData

`packages/auto-apply/src/profile.ts` SHALL expose `loadApplicationData(opts?)` that reads `config/profile.yml` (and optionally `cv.md`) and returns a typed `ApplicationData`:

```ts
interface ApplicationData {
  name: { first: string; last: string };
  email: string;
  phone: string;
  location: { city: string; state?: string; country?: string };
  links: { linkedin?: string; github?: string; portfolio?: string };
  resumePath: string;          // absolute file path; existsSync verified
  workAuthorization: "us_citizen" | "permanent_resident" | "h1b" | "needs_sponsorship" | "other";
  requiresSponsorship: boolean;
  defaultCoverLetter?: string;
}
```

The reader SHALL throw `MissingProfileFieldError` listing the missing field and the file it should be in. Resume path SHALL be verified to exist on disk; `MissingResumeError` thrown if not.

#### Scenario: Reader returns typed data when profile is complete

- **WHEN** `config/profile.yml` contains all required fields and the resume_path exists
- **AND** `loadApplicationData()` is called
- **THEN** the returned object satisfies the `ApplicationData` shape

#### Scenario: Missing required field throws helpful error

- **WHEN** `config/profile.yml` lacks the `email` field
- **AND** `loadApplicationData()` is called
- **THEN** the call throws `MissingProfileFieldError` with the field name and the path `config/profile.yml`

### Requirement: Per-ATS adapters for 4 sites

The package SHALL ship working adapters for Greenhouse, Lever, Ashby, and Workday. Each adapter SHALL probe ≥2 selector alternates per standard field for resilience to ATS UI updates.

iCIMS adapter is intentionally NOT included in this change (URL pattern broken — see Phase 1.5 follow-up).

#### Scenario: All 4 adapters export ApplyFlow constants

- **WHEN** the package exports are introspected
- **THEN** `greenhouseApplyFlow`, `leverApplyFlow`, `ashbyApplyFlow`, `workdayApplyFlow` are all present
- **AND** each has the correct `ats` id matching its module path

#### Scenario: applyFlowFor factory dispatches correctly

- **WHEN** `applyFlowFor("greenhouse")` is called
- **THEN** the returned flow has `ats === "greenhouse"`

#### Scenario: applyFlowFor throws for unsupported ATS

- **WHEN** `applyFlowFor("icims")` or `applyFlowFor("monster")` is called
- **THEN** the call throws an error identifying the ATS as unsupported in this change

### Requirement: Integration with apply-queue runner

`apps/server/src/apply-queue/runner.ts` SHALL provide `processNextApplyEntry()` that:
1. Reads the next `status: "ready"` entry from the queue
2. Calls `runApplyFlow(controller, entry, { allowSubmit: false })`
3. On success: `markStatus(entry.id, "succeeded", { notes: "fill-simulation; snapshot at ..." })`
4. On `AdapterParseError`: `markStatus(entry.id, "failed", { notes: error.message })`
5. On suspected detection (CAPTCHA / 403 / login redirect during fill): `markStatus(entry.id, "detected", { notes: ... })`

`processNextApplyEntry` SHALL respect the apply-queue gate's cooldown semantics (verified by checking queue state after status update).

#### Scenario: Successful fill marks status succeeded

- **WHEN** `processNextApplyEntry()` runs against a queue with one ready entry and the underlying fill succeeds
- **THEN** the queue's projected state for that id has `status: "succeeded"`

#### Scenario: Detection signal marks status detected

- **WHEN** the fill flow throws an error indicating bot detection
- **THEN** the queue's projected state has `status: "detected"` (which triggers cooldown for that ATS via the existing gate logic)
