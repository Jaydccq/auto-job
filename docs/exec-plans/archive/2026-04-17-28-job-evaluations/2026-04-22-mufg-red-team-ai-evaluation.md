# MUFG Red Team AI Engineer Evaluation

## Background

The bridge MVP requested a batch evaluation for MUFG's Global Red Team AI Engineer, Analyst role. The cached JD file is the primary source, and local candidate artifacts are the only source of candidate facts.

## Goal

Generate a complete A-G evaluation report and tracker-addition TSV line without generating a PDF.

## Scope

- Read the cached JD, `cv.md`, `article-digest.md`, `llms.txt` if present, `config/profile.yml`, `data/applications.md`, and `data/scan-history.tsv`.
- Write `reports/300-mufg-2026-04-22.md`.
- Write `batch/tracker-additions/0xUM5CwVSQOZzGgnoYjeb.tsv`.
- Do not edit `cv.md`, `i18n.ts`, portfolio files, or `data/applications.md`.

## Assumptions

- The cached JD is short but sufficient for the bridge MVP because it contains company, role, location, work model, requirements, responsibilities, and skill tags.
- `PDF_CONFIRMED: no` means PDF generation must be skipped.
- The candidate requires sponsorship based on `config/profile.yml`.
- Tracker numbering follows `max(data/applications.md #) + 1`, not the report number.
- No external search is needed because the task says the cached JD is the primary source and the local metadata is enough for a directional score.

## Implementation Steps

1. Read local sources and identify role metadata.
   Verify: cache file, CV, article digest, profile, tracker, and scan history were read.
2. Evaluate A-G against the JD and candidate sources.
   Verify: report includes role summary, match table, gaps, strategy, comp, personalization, interview plan, legitimacy, score, and keywords.
3. Write report and tracker addition.
   Verify: files exist at the requested paths and tracker row has 9 tab-separated columns.
4. Validate output constraints.
   Verify: no PDF generated, no protected source files modified, final JSON can reference the generated report.

## Verification Approach

- Use shell checks for file existence.
- Count tracker TSV fields with `awk -F '\t'`.
- Inspect report header and key sections.
- Check git status to confirm protected files were not modified.

## Progress Log

- 2026-04-22: Read cached JD. It contains 53 lines of structured job metadata and no YAML frontmatter.
- 2026-04-22: Read `cv.md`, `article-digest.md`, `config/profile.yml`, `data/applications.md`, and `data/scan-history.tsv`. `llms.txt` was not present.
- 2026-04-22: Calculated next tracker number as 297 from `data/applications.md`.

## Key Decisions

- Classify the role as `AI Platform / LLMOps Engineer + Agentic Workflows / Automation` because the JD buys AI-enabled adversarial testing, prompt injection/misuse testing, LLM workflows, cloud AI tooling, API/security primitives, and controlled red-team execution.
- Treat sponsorship as a risk to confirm, not a hard blocker, because the candidate requires support but the cached enrich reason includes `sponsorship_supported`.
- Score below the auto-answer threshold because direct red-team, adversary simulation, PyTorch/TensorFlow/SageMaker, and enterprise cloud AI platform evidence are weaker than the candidate's AI systems and backend evidence.

## Risks and Blockers

- Salary is not available in the cached JD; the salary field is polluted by unrelated Jobright text.
- Exact posting freshness and apply-button state are unverified in batch mode.
- The candidate does not show direct professional red-team or purple-team experience in `cv.md`.

## Final Outcome

Report `reports/300-mufg-2026-04-22.md` was generated with score `4.15/5`,
merged into the tracker, and no PDF was generated.
