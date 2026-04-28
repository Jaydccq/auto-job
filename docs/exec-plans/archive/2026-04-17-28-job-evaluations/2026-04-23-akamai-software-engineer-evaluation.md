# Akamai Software Engineer Evaluation

## Background

Bridge batch run `W7PkMzzNVx2eHeWM3Oyuz` requests report `318` for Akamai Technologies, Software Engineer.
The local JD cache at `/var/folders/ly/sdg_pj9x6xb8b89q5yytyhdw0000gn/T/career-ops-bridge-jd-W7PkMzzNVx2eHeWM3Oyuz.txt` is the primary source.
PDF generation is explicitly not confirmed, so this run must produce only a markdown report and tracker addition.

## Goal

Create a complete A-G evaluation report, write one tracker-addition TSV row, and return a valid JSON summary.

## Scope

- Read-only sources: `cv.md`, `config/profile.yml`, `article-digest.md`, optional `llms.txt`, `data/applications.md`, `data/scan-history.tsv`, and the cached JD file.
- Write targets: `reports/318-akamai-technologies-2026-04-23.md`, `batch/tracker-additions/W7PkMzzNVx2eHeWM3Oyuz.tsv`, and this execution plan.
- No edits to `cv.md`, `i18n.ts`, `data/applications.md`, or portfolio files.
- No PDF generation.

## Assumptions

- The JD cache is sufficient because it contains company, role, location, work model, salary, requirements, responsibilities, sponsorship-positive enrichment, and skill tags.
- The cache does not contain YAML frontmatter, so `used_frontmatter=false`.
- The role is a general early-career software engineering role; the closest required batch archetype is AI Platform / LLMOps Engineer by platform engineering adjacency, with AI Forward Deployed Engineer as a secondary framing only for rapid delivery and troubleshooting.
- The candidate requires sponsorship based on `config/profile.yml`.

## Implementation Steps

1. Read required repository sources.
   Verify: local cache, CV, profile, article digest, tracker, state list, and scan history are inspected.
2. Score the role against candidate evidence.
   Verify: every major JD requirement maps to exact `cv.md` line references or repository config evidence.
3. Write the markdown report.
   Verify: report file exists at the required path and includes A-G, score table, legitimacy, and keywords.
4. Write tracker addition.
   Verify: TSV has 9 tab-separated columns, status before score, and next number `314`.
5. Final sanity check.
   Verify: no PDF generated, no forbidden files edited, and JSON fields match the bridge output schema.

## Verification Approach

- Use `test -s` for generated artifacts.
- Use `awk -F '\t' '{print NF}'` to verify tracker column count.
- Use `git diff --check` to catch whitespace issues in touched files.

## Progress Log

- 2026-04-23: Read `CLAUDE.md`, ran update check, confirmed required user files exist except optional `llms.txt`.
- 2026-04-23: Read cached JD, `cv.md`, `config/profile.yml`, `article-digest.md`, `templates/states.yml`, `data/applications.md`, and checked `data/scan-history.tsv` for Akamai/requisition references.
- 2026-04-23: Wrote the full A-G report and tracker-addition TSV row. PDF generation was skipped because confirmation was explicitly `no`.

## Key Decisions

- No WebFetch or WebSearch: the local cache has enough compensation, location, role, and requirements data for scoring.
- No PDF: `PDF_CONFIRMED: no`.
- Tracker status will be `Evaluada`, matching the Spanish canonical state requested by the batch prompt.

## Risks and Blockers

- Posting freshness and live apply state remain unverified in batch mode.
- Sponsorship support is positive only from local enrichment, not official JD body language.
- Salary max is above the candidate minimum, but lower half of the range falls below target.

## Final Outcome

Completed. Report written to `reports/318-akamai-technologies-2026-04-23.md`; tracker addition written to `batch/tracker-additions/W7PkMzzNVx2eHeWM3Oyuz.tsv`; PDF not generated.
