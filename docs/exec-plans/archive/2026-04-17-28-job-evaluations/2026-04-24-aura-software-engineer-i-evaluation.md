# AURA Software Engineer I Evaluation

## Background

Bridge batch run `b8J1YoTll2OStrzVINMPv` requests a full A-G evaluation for Association of Universities for Research in Astronomy's `Software Engineer I` role using the cached JD file at `/var/folders/ly/sdg_pj9x6xb8b89q5yytyhdw0000gn/T/career-ops-bridge-jd-b8J1YoTll2OStrzVINMPv.txt`.

## Goal

Produce a complete markdown evaluation report, write the tracker-addition TSV row, and return a valid bridge JSON summary. PDF generation is explicitly disabled for this run.

## Scope

- Read the required local inputs: cached JD, `cv.md`, optional `llms.txt`, `article-digest.md`, `config/profile.yml`, `data/applications.md`, `data/scan-history.tsv`, and `templates/states.yml`.
- Write `reports/334-association-of-universities-for-research-in-astronomy-2026-04-24.md`.
- Write `batch/tracker-additions/b8J1YoTll2OStrzVINMPv.tsv`.
- Do not edit `cv.md`, `i18n.ts`, `data/applications.md`, or any portfolio artifacts.

## Assumptions

- The cached JD is the primary source and is sufficient for the evaluation because it includes frontmatter plus a detailed requirements and responsibilities extract.
- `llms.txt` is absent, so there is no extra local context file to apply.
- The candidate requires sponsorship / work authorization support per `config/profile.yml`.
- The role is a conventional early-career observatory software opening, so the mandatory six-archetype taxonomy must be mapped to the closest platform/systems categories rather than treated literally.
- Salary evaluation should use the current repository truth in `config/profile.yml`, which sets the walk-away compensation minimum at `$90K`.

## Implementation Steps

1. Read repository instructions, candidate materials, cached JD, and tracker context.
   Verify: all required local files are inspected and PDF remains disabled.
2. Draft the evaluation with explicit assumptions, hard-blocker checks, and line-level evidence from `cv.md` and `article-digest.md`.
   Verify: report includes sections A-G, score table, legitimacy assessment, and keywords.
3. Write the report and tracker-addition TSV.
   Verify: both files exist and the TSV contains exactly 9 tab-separated columns.
4. Run targeted structural checks and finalize the bridge JSON fields.
   Verify: report header fields, tracker row numbering, and JSON metadata are internally consistent.

## Verification Approach

- Use shell checks for file existence and tracker TSV column count.
- Inspect the report header, required sections, and keywords with `rg`.
- Confirm the next tracker number by calculating the maximum existing application row number.

## Progress Log

- 2026-04-24: Read `CLAUDE.md`, `docs/CODEX.md`, `AGENTS.md`, the cached AURA JD, `config/profile.yml`, `cv.md`, `article-digest.md`, `data/applications.md`, `data/scan-history.tsv`, and `templates/states.yml`.
- 2026-04-24: Confirmed `llms.txt` is absent and `PDF_CONFIRMED: no`, so the run stays on `report + tracker`.
- 2026-04-24: Confirmed the existing quick-screen row for this role is tracker row `310` with report `316`; this run is a deeper re-evaluation rather than a first sighting.

## Key Decisions

- Use the cached JD only; no WebFetch or WebSearch unless a critical gap appears.
- Treat `h1b: "unknown"` as a sponsorship risk, not a confirmed blocker, because the JD body only cites company-level historical H-1B data.
- Keep the tracker company name aligned with the existing row `310` to preserve re-evaluation continuity.

## Risks and Blockers

- The current cached JD does not restate a precise job location, even though the prior quick-screen artifact recorded Boulder on-site.
- Compensation is below the candidate's target range and only clears the current minimum at the top end of the posted band.
- The role is domain-specific and not directly aligned with the candidate's AI-forward north star.

## Final Outcome

Pending report generation and verification.
