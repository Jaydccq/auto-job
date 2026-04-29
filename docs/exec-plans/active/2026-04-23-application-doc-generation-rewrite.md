# Application Document Generation Rewrite

## Background

The dashboard's document generation path currently reads evaluation-report prose
directly into generated CV and cover-letter output. In practice this leaks
internal analysis into applicant-facing documents, including report-summary
language, evidence citations, and CV-edit recommendations. The HTML CV template
also hardcodes a `Professional Summary` section and a section order that does
not match the desired application layout.

## Goal

Refactor the dedicated CV and cover-letter PDF generation flow so it produces
application-ready output from JD signals plus `cv.md`, without copying internal
report prose into the final document.

## Scope

- Update dashboard document generation in `web/dashboard-server.mjs`.
- Update `templates/cv-template.html` to remove the default summary block and
  enforce the requested section order.
- Keep `cv.md` as the factual source of truth.
- Allow idealized JD-aligned phrasing only in generated outputs, not in
  repository source CV content.

## Assumptions

- The selected report remains the best local source for structured JD signals
  such as requirements, keywords, and role framing.
- Generated application documents may use idealized wording for stronger
  semantic ATS alignment, as long as `cv.md` is not modified.
- The dashboard HTML-to-PDF path is the primary PDF flow affected by the user's
  complaint.

## Implementation Steps

1. Replace report-prose reuse with structured signal extraction only.
   Verify: generated content no longer includes report-summary text patterns.
2. Rebuild CV composition around fixed section order and JD-ranked project
   selection.
   Verify: generated CV order is Education, Work Experience, Projects,
   Technical Skills and projects are limited to 2-3 entries.
3. Rebuild cover-letter generation around applicant-facing narrative only.
   Verify: generated letter excludes evidence citations, internal analysis, and
   CV-edit suggestions.
4. Run targeted smoke checks against Aurora output.
   Verify: generated documents omit `Professional Summary`, `Top 5 CV changes`,
   `cv.md:` citations, and `The strongest evidence I would bring...`.

## Verification Approach

- `node --check web/dashboard-server.mjs`
- `npm run dashboard:build`
- Start `npm run dashboard`, call the apply-doc API for Aurora CV and cover
  letter, and inspect the generated HTML/JSON/PDF outputs.
- Use `rg` checks against generated artifacts to confirm forbidden internal
  report phrases are absent.
- `git diff --check -- web/dashboard-server.mjs templates/cv-template.html docs/exec-plans/active/2026-04-23-application-doc-generation-rewrite.md`

## Progress Log

- 2026-04-23: Read `CLAUDE.md`, `docs/CODEX.md`, `modes/pdf.md`,
  `modes/cover-letter.md`, `cv.md`, `templates/cv-template.html`,
  `templates/cover-letter-template.html`, and the Aurora report. Confirmed the
  current dashboard logic injects report section A/E prose and match-table
  evidence directly into generated documents.
- 2026-04-23: Reworked `web/dashboard-server.mjs` so reports provide only
  structured role signals. The CV path no longer builds a professional summary
  from report prose, and the cover-letter path now composes applicant-facing
  paragraphs from JD themes plus tailored `cv.md` evidence.
- 2026-04-23: Updated `templates/cv-template.html` to remove the default
  summary block and enforce section order `Education`, `Work Experience`,
  `Projects`, `Technical Skills`.
- 2026-04-23: Verified Aurora document generation through the dashboard API.
  The generated CV selected three JD-shaped projects (`Battleship AI Agent`,
  `HTTP Caching Proxy Server`, `Machine Learning & Computer Vision System
  Portfolio`) and the generated cover letter excluded internal analysis text.
- 2026-04-23: Verified generated artifacts omit `Professional Summary`,
  `Top 5 CV changes`, `The strongest evidence I would bring...`, and
  repository citation strings such as `cv.md:`.

## Key Decisions

- Treat reports as signal sources, not applicant-facing copy.
- Remove the default CV summary block from the HTML PDF path instead of trying
  to sanitize a generated summary paragraph.
- Keep idealized JD-specific strengthening limited to generated project bullets
  and cover-letter prose, never `cv.md`.

## Risks and Blockers

- The report still mediates access to some JD signals, so sparse reports will
  reduce tailoring quality.
- More aggressive idealized rewriting can overfit wording if not constrained by
  project context; this rewrite should keep changes scoped to the generated
  output path only.

## Final Outcome

Dashboard-generated application documents now use report data only as JD
signals. The HTML CV path no longer emits a `Professional Summary`, uses the
requested section order, and selects 2-3 role-shaped projects with stronger
JD-bound bullet phrasing. The cover-letter path now generates applicant-facing
paragraphs without internal report analysis, evidence citations, or CV-edit
guidance. Aurora smoke checks passed for artifact generation and forbidden-text
removal.
