# LaTeX CV Export Integration

## Background

The upstream merge added the LaTeX CV export implementation:
`generate-latex.mjs`, `modes/latex.md`, and `templates/cv-template.tex`.
Project docs also mention `/auto-job-latex`, but the local command routing is
not fully wired for Claude, OpenCode, Gemini, Codex, and Bun package scripts.

## Goal

Expose the upstream LaTeX/Overleaf CV export flow through the same command
surfaces as the existing Auto-Job modes.

## Scope

- Add `latex` to the Auto-Job router and discovery menu.
- Add OpenCode and Gemini command files for LaTeX export.
- Add an package script for the validator/compiler.
- Update concise routing docs so agents can find the mode.
- Do not rewrite the upstream LaTeX generation mode or template.

## Assumptions

- `modes/latex.md` is the source of truth for the export workflow.
- LaTeX export should be an explicit mode, separate from HTML/PDF generation.
- The local fork keeps its existing scanner, bridge, extension, and dashboard
  routes.

## Implementation Steps

1. Compare local routing with upstream-added LaTeX docs and files.
   Verify: inspect `.claude/skills/auto-job/SKILL.md`, `CLAUDE.md`,
   `GEMINI.md`, `.gemini/commands`, `.opencode/commands`, and `package.json`.
2. Wire `latex` into command routing.
   Verify: route tables and menus mention `latex`.
3. Add command files for OpenCode and Gemini.
   Verify: files exist and load `modes/latex.md`.
4. Add package script.
   Verify: `package.json` parses and includes `latex`.
5. Run targeted verification.
   Verify: no conflict markers, `bun run verify`, and safe script checks.

## Verification Approach

- Parse `package.json` with Node.
- Search for command/routing references to `latex`.
- Run `bun run verify`.
- Run `node generate-latex.mjs` without args to verify the command is callable
  and reports usage. Full PDF compilation depends on `pdflatex` availability and
  a generated `.tex` file.

## Progress Log

- 2026-04-22: Confirmed worktree was clean before edits.
- 2026-04-22: Compared local routing with `upstream/main`; upstream added the
  core LaTeX files and documentation references, but not full command routing.
- 2026-04-22: Added `latex` to the Auto-Job router, discovery menu, Bun package scripts
  scripts, OpenCode command list, Gemini command list, and Codex routing docs.
- 2026-04-22: Added `.opencode/commands/auto-job-latex.md` and
  `.gemini/commands/auto-job-latex.toml`; both route into upstream
  `modes/latex.md`.
- 2026-04-22: Verified no conflict markers in touched files.
- 2026-04-22: Verified `package.json` parses and exposes
  `latex: node generate-latex.mjs`.
- 2026-04-22: `node generate-latex.mjs` without args reported the expected
  usage string.
- 2026-04-22: `bun run verify` passed with 0 errors and 2 existing duplicate
  warnings in `data/applications.md`.
- 2026-04-22: `node generate-latex.mjs /tmp/auto-job-latex-smoke.tex
  /tmp/auto-job-latex-smoke.pdf` passed and compiled a PDF with `pdflatex`.

## Key Decisions

- Keep the implementation flow in `modes/latex.md` unchanged and wire callers to
  it instead of duplicating the workflow.
- Add an explicit `latex` mode so existing `pdf` behavior remains unchanged.
- Use upstream's naming convention `/auto-job-latex` for standalone CLI
  command files and `/auto-job latex` for the core router mode.

## Risks and Blockers

- None blocking. Tracker verification still reports two duplicate warning
  groups that predate this integration.

## Final Outcome

LaTeX/Overleaf CV export is now wired as an explicit Auto-Job mode across
Claude, OpenCode, Gemini, Codex routing docs, and Bun package scripts. The upstream implementation
files remain the source of truth: `modes/latex.md`, `templates/cv-template.tex`,
and `generate-latex.mjs`. Verification passed, including a real local pdflatex
smoke compile.
