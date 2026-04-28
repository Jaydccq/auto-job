# Tesla Data Engineer Evaluation

## Background

Bridge batch run `XlsURuKz8qf82lpt6GADR` requests a full A-G evaluation for Tesla's `Data Engineer, Applications Engineering` role, report `324`, dated `2026-04-23`.

## Goal

Create a real markdown evaluation report under `reports/`, add a tracker-addition TSV line under `batch/tracker-additions/`, and finish with valid machine-readable JSON.

## Scope

- Read-only sources: `cv.md`, `article-digest.md`, `config/profile.yml`, cached JD file, `data/applications.md`, and `data/scan-history.tsv`.
- Write-only outputs for this run: the execution plan, `reports/324-tesla-2026-04-23.md`, and `batch/tracker-additions/XlsURuKz8qf82lpt6GADR.tsv`.
- PDF generation is out of scope because `PDF_CONFIRMED: no`.

## Assumptions

- The cached JD is the primary source because it exists and contains structured role data.
- `llms.txt` is absent in this repository, so there is no local LLM instruction source to read.
- `Evaluada` is acceptable for tracker additions because the batch prompt requires Spanish canonical statuses and `templates/states.yml` lists it as an alias for evaluated.
- The candidate requires sponsorship per `config/profile.yml`; the cached JD's "H1B Sponsor Likely" signal mitigates but does not eliminate that risk.

## Uncertainties

- Batch mode cannot verify Tesla's live apply button state or posting freshness.
- The cached JD is not YAML frontmatter; it is structured plain text, so `used_frontmatter` would be false if reported by the bridge.
- On-site Fremont logistics need candidate confirmation.

## Simplest viable path

1. Use the cached JD only.
   Verify: report notes `jd_source` as local cache and no web research.
2. Map Tesla requirements to exact CV/article-digest evidence.
   Verify: report cites line-level evidence from `cv.md` and `article-digest.md`.
3. Write report and tracker addition.
   Verify: files exist and tracker row has 9 tab-separated columns.
4. Run lightweight file/format checks.
   Verify: shell checks confirm report presence and TSV shape.

## Verification approach

- Confirm `reports/324-tesla-2026-04-23.md` exists and includes sections A-G plus keywords.
- Confirm `batch/tracker-additions/XlsURuKz8qf82lpt6GADR.tsv` exists with exactly one line and 9 TSV fields.
- Confirm no PDF file is generated.

## Progress log

- 2026-04-23: Read `CLAUDE.md`, cached JD, `cv.md`, `article-digest.md`, `config/profile.yml`, tracker state, and scan history search results.
- 2026-04-23: Confirmed no prior Tesla/268830 hit in `data/scan-history.tsv` from local search.

## Key decisions

- Classify the role as `AI Platform / LLMOps Engineer (data-platform adjacent)` because the JD is pure data engineering, but the closest required bridge archetype is platform-oriented production data infrastructure.
- Do not generate PDF because this run explicitly says `PDF_CONFIRMED: no`.

## Risks and blockers

- Sponsorship remains a candidate-specific risk despite the cached "H1B Sponsor Likely" tag.
- Role is on-site in Fremont and not directly AI-focused, lowering North Star alignment.

## Final outcome

Pending implementation and verification.
