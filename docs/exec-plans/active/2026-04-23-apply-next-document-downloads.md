# Apply Next Document Downloads Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-role Apply Next controls that generate CV and cover-letter PDFs, then expose buttons that save those PDFs to the local Downloads folder.

**Architecture:** Serve the dashboard through a local Node web app instead of making `file://` the primary interface. The server renders `web/template.html` with fresh repository data on each request, reads `cv.md`, `config/profile.yml`, and the selected report for PDF actions, reuses `generate-pdf.mjs` and `generate-cover-letter.mjs`, writes generated PDFs under `output/`, then copies selected files into `~/Downloads`.

**Tech Stack:** Vanilla JavaScript, Node HTTP server, existing Playwright PDF scripts.

---

## Background

The dashboard used to be generated from `web/template.html` by
`web/build-dashboard.mjs` and written to `web/index.html`. Apply Next currently
renders links to the job, the dossier, local "mark applied" control, and PDF
generation/download controls. The user clarified the desired interface should
not be static.

## Goal

Users should be able to click Apply Next buttons for each recommended role:

1. Generate CV PDF.
   Verify: the card reveals a CV PDF download button.
2. Generate cover-letter PDF.
   Verify: the card reveals a cover-letter PDF download button.
3. Download each generated document.
   Verify: the server copies the generated PDF to `~/Downloads` with a
   deterministic filename.
4. Mark a role as applied from the dynamic dashboard.
   Verify: the local server updates the existing `data/applications.md` row so
   the role no longer appears in Apply Now after a refresh.

## Scope

- Add a local PDF companion server under `web/`.
- Modify `web/template.html` to add generation and download controls.
- Make `npm run dashboard` start the local dynamic dashboard.
- Keep static export available as `npm run dashboard:build`.
- Regenerate `web/index.html` with `npm run dashboard`.
- Let the dynamic local dashboard update existing application tracker status
  rows when the user explicitly marks a role as applied.
- Do not replace existing PDF generation scripts; call them.

## Assumptions

- The user's `index.html` means `web/index.html`, because there is no root
  `index.html` and the docs identify `web/index.html` as the dashboard.
- The primary dashboard should be `http://127.0.0.1:47329/`, not `file://`.
- Static HTML cannot run the repository's Node/Playwright PDF scripts directly,
  so static export remains browse-only for PDF actions.
- The local server may generate deterministic, template-based tailoring content;
  it must not invent experience beyond `cv.md`, `config/profile.yml`, and the
  selected report.
- Existing report content has enough fit and tailoring context to produce useful
  cover-letter and CV PDF drafts without inventing experience.

## Success Criteria

- Apply Next cards show `Generate CV PDF` and `Generate Cover Letter PDF`
  buttons.
- Clicking either generate button creates an in-memory document and reveals a
  corresponding PDF download button on that card.
- Download filenames include document type, company, role, and date.
- Download buttons save PDFs to `~/Downloads`.
- `npm run dashboard` starts a local dynamic server.
- `npm run dashboard:build` completes and updates `web/index.html`.
- Browser verification confirms the buttons render, PDF generation succeeds,
  and the download action reports the saved Downloads path.
- Clicking `Mark applied` on the dynamic dashboard persists the existing tracker
  row status as `Applied` and removes it from Apply Now after reload.
- Opening the standalone static export still falls back to browser-local marks,
  because it cannot write repository files.

## Implementation Steps

- [x] **Step 1: Preserve existing generated dashboard flow**
  - Inspect `web/template.html`, `web/build-dashboard.mjs`, and the current
    `web/index.html` diff.
  - Verify: `web/index.html` is generated from current repo data and should be
    regenerated after template changes.

- [x] **Step 2: Keep user CV out of generated dashboard data**
  - Remove the earlier `cvMarkdown` inline data path from
    `web/build-dashboard.mjs`.
  - Let the local PDF companion read `cv.md` only at generation time.
  - Verify: generated `window.DATA` does not contain `cvMarkdown`.

- [x] **Step 3: Add local PDF companion server**
  - Create `web/dashboard-server.mjs`.
  - Reuse `generate-pdf.mjs` for CV PDFs and `generate-cover-letter.mjs` for
    cover-letter PDFs.
  - Verify: direct API calls create PDFs under `output/`.

- [x] **Step 4: Replace browser Markdown generation with PDF server calls**
  - Update `web/template.html` so Apply Next actions call the local PDF server.
  - Verify: the UI shows PDF generation/download state, not Markdown controls.

- [x] **Step 5: Regenerate dashboard**
  - Run `npm run dashboard`.
  - Verify: command exits successfully and writes `web/index.html`.

- [x] **Step 6: Browser smoke test**
  - Start the local PDF dashboard server.
  - Open the served dashboard with Playwright.
  - Click `Generate CV PDF` and `Generate Cover Letter PDF` on the first Apply
    Next card.
  - Click both PDF download buttons.
  - Verify: PDFs exist in `output/` and copies exist in `~/Downloads`.

- [x] **Step 7: Convert primary dashboard to dynamic server**
  - Rename the PDF companion to `web/dashboard-server.mjs`.
  - Export shared parser/renderer functions from `web/build-dashboard.mjs`.
  - Change `npm run dashboard` to start the dynamic server and move static
    snapshot generation to `npm run dashboard:build`.
  - Verify: served dashboard renders fresh data and PDF actions still work.

- [x] **Step 8: Persist Mark Applied through the dynamic server**
  - Add an authenticated local dashboard API that updates only existing
    `data/applications.md` status cells.
  - Update the Apply Next button to call that API when served from
    `npm run dashboard`, with localStorage retained as the static fallback.
  - Verify: a mark/unmark smoke test leaves the tracker restored and Apply Now
    filtering respects persisted `Applied` status.

## Verification Approach

- `npm run dashboard`
- `npm run dashboard:build`
- Direct local API smoke test for PDF generation and download copy.
- Node/Playwright smoke test against the local PDF dashboard server.
- Direct local API smoke test for marking and restoring a tracker row.
- `git diff --check -- web/dashboard-server.mjs web/build-dashboard.mjs web/template.html web/index.html web/README.md package.json docs/exec-plans/active/2026-04-23-apply-next-document-downloads.md`

## Progress Log

- 2026-04-23: Read `CLAUDE.md`, the dashboard template, builder, and existing
  Apply Next rendering. Confirmed setup files exist and update check is current.
- 2026-04-23: Created this execution plan before editing implementation files.
- 2026-04-23: Added `cvMarkdown` to generated dashboard data, then added
  browser-side CV and cover-letter Markdown draft generation to Apply Next
  cards.
- 2026-04-23: Regenerated `web/index.html` with `npm run dashboard`.
- 2026-04-23: Verified template script parsing, diff whitespace, button
  presence, and Playwright download smoke behavior.
- 2026-04-23: Playwright confirmed generated filenames:
  `cv-gumloop-software-engineer-2026-04-23.md` and
  `cover-letter-gumloop-software-engineer-2026-04-23.md`.
- 2026-04-23: User clarified output must be PDF, not Markdown, and must reuse
  existing project PDF generation.
- 2026-04-23: Removed inlined `cv.md` from generated dashboard data; the PDF
  server now reads user-layer files locally during generation.
- 2026-04-23: Added `web/dashboard-server.mjs`, a loopback-only dashboard
  server that injects a per-process PDF API token into the served dashboard and
  rejects mutating API calls without that token.
- 2026-04-23: Updated Apply Next controls to call the local PDF server and show
  `Generate CV PDF`, `Download CV PDF`, `Generate Cover Letter PDF`, and
  `Download Cover Letter PDF` controls.
- 2026-04-23: Added a PDF-capable dashboard server and documented the flow in
  `web/README.md`.
- 2026-04-23: Regenerated `web/index.html` with `npm run dashboard`.
- 2026-04-23: Verified direct API behavior: unauthenticated generation returns
  401; authenticated generation creates
  `output/cv-gumloop-software-engineer-2026-04-23.pdf` and copies it to
  `/Users/hongxichen/Downloads/cv-gumloop-software-engineer-2026-04-23-4.pdf`.
- 2026-04-23: Playwright verified the served dashboard buttons generate and
  save PDFs to Downloads:
  `/Users/hongxichen/Downloads/cv-gumloop-software-engineer-2026-04-23-5.pdf`
  and
  `/Users/hongxichen/Downloads/cover-letter-gumloop-software-engineer-2026-04-23-4.pdf`.
- 2026-04-23: `file` confirmed generated outputs are real PDFs:
  CV PDF version 1.4 with 3 pages; cover-letter PDF version 1.4 with 1 page.
- 2026-04-23: User asked to make the dashboard non-static. Converted the
  primary interface to a dynamic local server, moved static snapshot generation
  to `npm run dashboard:build`, and made `npm run dashboard` the only dynamic
  dashboard entry point.
- 2026-04-23: Verified the dynamic server with Playwright: `/api/health`
  returned the Downloads directory, `/reports/301-gumloop-2026-04-22.md`
  served the dossier, the dashboard rendered from `http://127.0.0.1:47329/`,
  and Apply Next generated/saved both PDFs to Downloads.
- 2026-04-24: User reported that roles previously clicked with `Mark applied`
  still appear in Apply Now. Confirmed the existing button only writes
  `auto_job_apply_done_v1` to browser localStorage, so the state is not a
  repository-backed tracker update.
- 2026-04-24: Added authenticated `/api/apply-status` to the dynamic dashboard
  server and updated Apply Next so `Mark applied` writes the existing tracker
  row status to `Applied` when served from `npm run dashboard`; static
  `web/index.html` still falls back to localStorage.
- 2026-04-24: Verified the markdown rewrite helper, regenerated
  `web/index.html` with `npm run dashboard:build`, API-smoked mark/restore on
  tracker row 317 with exact file restoration, and browser-smoked the Figma
  card disappearing from Apply Now after refresh. `npm run verify` passed with
  0 errors and the existing 2 duplicate warnings.

## Key Decisions

- Use a local Node companion server for PDF actions, because static browser
  code cannot execute `generate-pdf.mjs`.
- Make the local server the primary dashboard interface; keep `web/index.html`
  only as an optional static export.
- Generate real PDFs by calling existing scripts instead of creating a new PDF
  renderer.
- Require a per-process local token for mutating PDF API calls, because the
  companion server can write files to `~/Downloads`.
- Reuse that local token for tracker status mutations; only existing tracker
  rows may be changed, and static HTML remains browser-local.
- Change the template and builder, then regenerate `web/index.html`, instead of
  editing the generated dashboard only.

## Risks and Blockers

- Opening `web/index.html` directly from `file://` remains a static snapshot and
  cannot run Node PDF generation or persist tracker status changes.
- Generated PDFs are deterministic dashboard PDFs, not a replacement for the
  richer agent-driven `/auto-job pdf` and `/auto-job cover-letter`
  workflows when deep manual tailoring is required.

## Final Outcome

The dashboard primary interface is now non-static. `npm run dashboard` starts a
local dynamic server at `http://127.0.0.1:47329/`; `npm run dashboard:build`
remains available only for standalone static snapshots. Apply Next generates
real PDFs through the dynamic server, writes them under `output/`, and copies
them into `~/Downloads`. Apply Next also persists `Mark applied` to
`data/applications.md` through the dynamic server, so applied tracker rows stay
out of Apply Now after refresh. Targeted API and browser smoke verification
passed.
