# Figma Full Stack Evaluation

## Background

Batch bridge run for report 320 evaluates Figma's Software Engineer, Full Stack posting from the cached JD file at `/var/folders/ly/sdg_pj9x6xb8b89q5yytyhdw0000gn/T/career-ops-bridge-jd-iCpZLQvNg6YsbjAJIkOv7.txt`.

## Goal

Create a complete A-G evaluation report, write the tracker-addition TSV line, and return valid bridge JSON. PDF generation is explicitly disabled for this run.

## Scope

- Read local truth sources: `cv.md`, optional `llms.txt`, `article-digest.md`, `config/profile.yml`, tracker data, and scan history.
- Write `reports/320-figma-2026-04-23.md`.
- Write `batch/tracker-additions/iCpZLQvNg6YsbjAJIkOv7.tsv`.
- Do not edit `cv.md`, `i18n.ts`, or `data/applications.md`.

## Assumptions

- The cached JD is sufficient because it includes company, role, location, salary, requirements, responsibilities, Jobright signals, and sponsorship tag.
- `llms.txt` is absent, so there is no additional local LLM context to apply.
- The candidate requires work authorization support per `config/profile.yml`.
- `Recommendation tags: H1B Sponsor Likely` is a positive signal, not a guarantee.

## Implementation Steps

1. Read instructions, cached JD, profile, CV, article digest, tracker, states, and scan history.
   Verify: required files inspected; no PDF-only files needed.
2. Evaluate the JD against candidate evidence with line-level CV references.
   Verify: report contains A-G blocks, score, legitimacy, keywords, and no draft answers unless score is at least 4.5.
3. Write the report and tracker addition.
   Verify: files exist and tracker TSV has 9 tab-separated columns.
4. Run lightweight structural checks.
   Verify: report header, TSV column count, and JSON summary fields are consistent.

## Verification Approach

- Use shell checks for file existence.
- Validate tracker TSV column count with `awk -F '\t'`.
- Inspect report header and key sections with `rg`.

## Progress Log

- 2026-04-23: Read `CLAUDE.md`, cached JD, `cv.md`, `article-digest.md`, `config/profile.yml`, `templates/states.yml`, `data/applications.md`, and `data/scan-history.tsv`.
- 2026-04-23: Confirmed `llms.txt` is absent and PDF is not confirmed.
- 2026-04-23: Wrote the evaluation report and tracker-addition TSV.

## Key Decisions

- Use cached JD as primary source; no WebFetch/WebSearch needed.
- Classify as AI Forward Deployed Engineer + Technical AI Product Manager because the Figma role is full-stack product engineering with product/design/research collaboration rather than a pure LLMOps job.
- Use `Evaluada` in the tracker addition per the batch prompt's canonical Spanish status list.

## Risks and Blockers

- Posting freshness and apply button state are unverified in batch mode.
- Sponsorship is indicated only by local enrichment tags; candidate should still confirm with recruiting.
- Role may expect stronger professional production experience than a 2026 new grad has.

## Final Outcome

Pending verification.
