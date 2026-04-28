# Businessolver Software Engineer (Remote) Evaluation

## Background

Bridge batch run `3JXp-Nv2cbzLHheURnwbI` requests a full A-G evaluation for Businessolver's `Software Engineer (Remote)` role using the cached JD file at `/var/folders/ly/sdg_pj9x6xb8b89q5yytyhdw0000gn/T/career-ops-bridge-jd-3JXp-Nv2cbzLHheURnwbI.txt`.

## Goal

Produce a complete markdown evaluation report, write the tracker-addition TSV row, and return a valid bridge JSON summary. PDF generation is explicitly disabled for this run.

## Scope

- Read the required local inputs: cached JD, `cv.md`, optional `llms.txt`, `article-digest.md`, `config/profile.yml`, `data/applications.md`, `data/scan-history.tsv`, `templates/states.yml`, and the prior Businessolver quick-screen report already stored in `reports/134-businessolver-2026-04-16.md`.
- Use repository artifacts first. Do not browse unless a critical gap prevents a defensible comp or legitimacy judgment.
- Write `reports/338-businessolver-2026-04-24.md`.
- Write `batch/tracker-additions/3JXp-Nv2cbzLHheURnwbI.tsv`.
- Do not edit `cv.md`, `i18n.ts`, `data/applications.md`, or portfolio/source files.

## Success Criteria

1. The report includes sections A-G, the global score table, and keywords, with section H omitted unless the score reaches `4.5/5`.
   Verify: inspect the saved markdown for the required headings and header fields.
2. The tracker-addition file contains exactly one TSV line with 9 columns and the next sequential tracker number.
   Verify: compute the current max tracker number from `data/applications.md`, then confirm the generated TSV column count.
3. The final JSON payload is internally consistent with the saved report and tracker artifacts.
   Verify: compare company, role, score, legitimacy, and paths across the generated files.

## Assumptions

- The cached JD is the primary source and is sufficient for the core role analysis because it includes frontmatter plus a usable description.
- `llms.txt` is absent, so there is no extra local context file to apply.
- The candidate currently requires sponsorship / work authorization support per `config/profile.yml`.
- The role is a general early-career software-engineering role in regulated SaaS workflows, not an AI-first role, so the forced six-archetype taxonomy will be approximated and explicitly caveated.
- The earlier quick-screen report is a valid in-repo artifact for historical salary/location context, but where it conflicts with the current cached frontmatter, the cached frontmatter wins for blocker handling.

## Uncertainties

- The cached frontmatter says `h1b: "unknown"` while the earlier quick-screen report recorded `Sponsorship: yes`.
- The cached JD omits salary, but the earlier checked-in report recorded a `$60k-$93k` range.
- Batch mode cannot verify freshness or the live apply-button state.

## Simplest Viable Path

1. Use the cached JD plus local repo artifacts only.
   Verify: no external lookup is needed.
2. Reconcile the current profile, the cached JD, and the prior quick-screen report into a full evaluation with explicit caveats instead of guessing.
   Verify: every compensation or blocker claim cites a checked-in artifact.
3. Write the report, tracker row, and final JSON summary.
   Verify: file existence, TSV structure, and report sections.

## Implementation Steps

1. Read repository instructions, candidate materials, cached JD, historical tracker context, and prior Businessolver evaluation.
   Verify: all required local files are inspected and PDF remains disabled.
2. Draft the evaluation with explicit assumptions, hard-blocker handling, and line-level evidence from `cv.md` and `article-digest.md`.
   Verify: report includes sections A-G, legitimacy analysis, score table, and keywords.
3. Write the report and tracker-addition TSV.
   Verify: both files exist and the TSV contains exactly 9 tab-separated columns.
4. Run targeted structural checks and finalize the bridge JSON fields.
   Verify: report header fields, tracker numbering, and final metadata are internally consistent.

## Verification Approach

- Use shell checks for file existence and TSV column count.
- Inspect the report header and required sections with `rg`.
- Confirm the next tracker number by calculating the maximum existing application row number.
- Confirm the run stayed on `report + tracker` with no PDF output.

## Progress Log

- 2026-04-24: Read `CLAUDE.md`, `docs/CODEX.md`, the cached Businessolver JD, `config/profile.yml`, `cv.md`, `article-digest.md`, `data/applications.md`, `data/scan-history.tsv`, `templates/states.yml`, and `reports/134-businessolver-2026-04-16.md`.
- 2026-04-24: Confirmed `llms.txt` is absent and `PDF_CONFIRMED: no`, so the run stays on `report + tracker`.
- 2026-04-24: Confirmed a prior Businessolver quick-screen row already exists in `data/applications.md` (`#86`, report `134`), so this run is a deeper re-evaluation rather than a first sighting.
- 2026-04-24: Calculated the next tracker sequence number as `321`.

## Key Decisions

- Keep the cached JD as the primary source for role analysis and use prior checked-in evaluation artifacts only to fill context the current cache omits.
- Treat sponsorship as unresolved risk, not confirmed support, because the current cached frontmatter says `h1b: "unknown"`.
- Evaluate compensation using the prior checked-in salary band because it is the only versioned salary artifact available in the repository for this role.

## Risks and Blockers

- Compensation likely lands at or below the candidate's current minimum and clearly below the target range.
- The role is materially less aligned with the candidate's AI/full-stack north star than stronger AI/product targets.
- Sponsorship support is not confirmed in the current cached JD.
- Freshness remains unverified in batch mode.

## Final Outcome

Pending report generation and verification.
