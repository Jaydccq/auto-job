# Semantic CV PDF Tailoring Execution Plan

## Background

The dynamic dashboard can generate CV PDFs from Apply Next cards, but the
current CV path is deterministic and shallow: it reads `cv.md`, fills
`templates/cv-template.html`, and renders the first four projects in source
order. It does not rank projects against the selected role, bind JD keywords to
evidence, or create explicit project-level semantic chunks for modern ATS and
LLM-based screening.

## Goal

Make dashboard-generated CV PDFs tailor themselves to each selected role by
using the selected report/JD signals to choose the most relevant `cv.md`
projects, reorder evidence, and render ATS-friendly semantic blocks.

## Scope

- Update `web/dashboard-server.mjs` CV generation logic.
- Update `templates/cv-template.html` for clearer ATS parsing.
- Keep the existing `generate-pdf.mjs` renderer.
- Do not edit `cv.md` source content.
- Do not add unsupported skills or invent experience.
- Do not change tracker rows or application state.

## Assumptions

- Apply Next rows have a report path for most high-value roles.
- The selected report contains useful JD requirements, keyword, and
  personalization-plan signals.
- `cv.md` is the source of truth for project facts, metrics, and technologies.
- Rewriting may mirror JD wording only when the underlying CV project already
  supports that claim.

## Uncertainties

- Some reports use English headings and others use Spanish headings, so parsing
  must rely on section letters and flexible table extraction.
- Some lightweight reports may not include a detailed section B or extracted
  keyword list.

## Simplest Viable Path

1. Extract role signals from report sections A, B, D, E, H, row notes, company,
   and role.
   Verify: a local smoke script can show non-empty keywords for a known report.
2. Rank `cv.md` projects by overlap between project text and those role signals.
   Verify: Gumloop should rank FinSentinel and Casino Training Pro near the top.
3. Render top projects with explicit `Tech Stack:` lines and bullet lists.
   Verify: generated HTML contains the selected projects and no unrelated
   template placeholders.
4. Rewrite project bullets conservatively by reordering and adding short
   context prefixes only when supported by existing project text.
   Verify: generated PDF succeeds and remains text-based.

## Implementation Steps

- [x] Add report/JD signal extraction helpers.
- [x] Add project ranking helpers.
- [x] Add safe bullet-tailoring helpers.
- [x] Update project and skill rendering in `templates/cv-template.html`.
- [x] Run syntax, static dashboard build, and PDF generation smoke checks.

## Verification Approach

- `node --check web/dashboard-server.mjs`
- `npm run dashboard:build`
- Start `npm run dashboard`, call the Apply Docs API for a known report, and
  verify a CV PDF is produced.
- Inspect generated work HTML for:
  - `Professional Summary`
  - `Technical Skills`
  - `Projects`
  - explicit `Tech Stack:` project lines
  - a top-ranked Gumloop project order led by AI/product-relevant projects
- `git diff --check -- web/dashboard-server.mjs templates/cv-template.html web/index.html docs/exec-plans/active/2026-04-23-semantic-cv-pdf-tailoring.md`

## Progress Log

- 2026-04-23: Created this plan after reading `CLAUDE.md`,
  `web/dashboard-server.mjs`, `templates/cv-template.html`, `cv.md`,
  `modes/pdf.md`, and sample reports.
- 2026-04-23: Implemented report/JD signal extraction from sections A, B, D,
  E, H, extracted keyword sections, role metadata, and report requirement
  tables. Signals are filtered against `cv.md` so unsupported terms such as
  TailwindCSS are not injected into generated CV output.
- 2026-04-23: Added deterministic project scoring that combines role-signal
  overlap, quantified evidence, and project mentions in the selected report.
  Project bullets are sorted by role relevance and metrics before rendering.
- 2026-04-23: Updated the CV template to use a standard `Technical Skills`
  block, explicit `Tech Stack:` lines under each project, `Relevant Focus:`
  role-signal chunks, and proper `<ul><li>` project bullets.
- 2026-04-23: Verified Gumloop CV generation through the local dashboard API.
  The generated HTML selected role-shaped project blocks, included
  `Professional Summary`, `Technical Skills`, `Projects`, `Tech Stack:`, and
  `Relevant Focus:`, and excluded unsupported Tailwind/MCP claims.
- 2026-04-23: Verified
  `output/cv-gumloop-software-engineer-2026-04-23.pdf` is a real PDF document
  with `file`.
- 2026-04-23: Verified the dashboard download endpoint copied the tailored CV
  PDF to `/Users/hongxichen/Downloads/cv-gumloop-software-engineer-2026-04-23-7.pdf`.
- 2026-04-23: Ran `node --check web/dashboard-server.mjs`,
  `npm run dashboard:build`, and `git diff --check` for the changed CV
  generation/template files.

## Key Decisions

- Keep generation deterministic inside the dashboard server; no LLM call is
  required for this change.
- Prefer report-derived signals over raw keyword stuffing.
- Preserve the original CV as the factual source and tailor only the generated
  PDF output.
- Treat `AI agents` as LLM/workflow-context evidence, not any project with
  "AI Agent" in its title, so unrelated RL/game-agent projects do not receive
  inflated LLM-agent relevance.

## Risks and Blockers

- Deterministic rewriting cannot reason as deeply as an agent reading the full
  JD, but it is fast, local, repeatable, and safe for dashboard use.
- If the selected report is sparse, tailoring quality falls back to role,
  company, existing CV project content, and generic engineering signals.

## Final Outcome

Dashboard-generated CV PDFs now tailor project selection and rendering to the
selected role/report. The CV path extracts supported job signals, ranks
`cv.md` projects by semantic relevance and quantified evidence, reorders
project bullets, renders explicit `Tech Stack:` and `Relevant Focus:` semantic
chunks, and keeps unsupported JD terms out of the generated CV. Targeted syntax,
build, diff, and API PDF-generation checks passed.
