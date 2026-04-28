# Akamai Python Software Engineer Evaluation

## Background

Bridge batch run `I4L_-CECQ-VkYWfXCVAiT` requests report `322` for Akamai Technologies / Software Engineer from a cached local JD file. PDF generation is explicitly disabled for this run.

## Goal

Produce a complete A-G job evaluation report and a tracker-addition TSV line without modifying `cv.md`, `i18n.ts`, or `data/applications.md`.

## Scope

- Read local truth sources: `cv.md`, `article-digest.md`, `config/profile.yml`, local JD cache, `data/applications.md`, and `data/scan-history.tsv`.
- Create `reports/322-akamai-technologies-2026-04-23.md`.
- Create `batch/tracker-additions/I4L_-CECQ-VkYWfXCVAiT.tsv`.
- Skip PDF generation because `PDF_CONFIRMED: no`.

## Assumptions

- The cached JD file is the primary source because it exists and contains role metadata and JD text.
- The local JD has no YAML frontmatter delimiters, so frontmatter usage is false.
- The candidate requires sponsorship based on `config/profile.yml`.
- The Akamai report already present in `data/applications.md` is a prior related evaluation, but this bridge run still needs its requested artifacts.

## Implementation Steps

1. Read required sources.
   Verify: source files are present or absence is explicitly noted.
2. Evaluate the JD against repository evidence.
   Verify: report includes A-G blocks, global score, legitimacy tier, and keywords.
3. Write tracker-addition TSV.
   Verify: TSV has exactly 9 tab-separated columns and next number is max tracker number + 1.
4. Run lightweight artifact checks.
   Verify: report and TSV exist; report header and TSV shape match expected contract.

## Verification Approach

- Use local file checks for report and TSV existence.
- Use `awk` to validate TSV column count.
- Use `rg`/`sed` to confirm report header, score, legitimacy, PDF skip, and no direct edit to tracker.

## Progress Log

- 2026-04-23: Read cached JD. It identifies Akamai Technologies, Software Engineer, Cambridge on-site, `$75700-$136300/yr`, sponsorship-supported enrichment, and Python/REST/database/CI-CD requirements.
- 2026-04-23: Read `cv.md`, `article-digest.md`, `config/profile.yml`, `templates/states.yml`, `data/applications.md`, and `data/scan-history.tsv`. `llms.txt` is absent.
- 2026-04-23: Found prior Akamai Technologies / Software Engineer tracker row for report 318; treat this run as a duplicate bridge artifact request rather than editing existing tracker data.

## Key Decisions

- Use `AI Platform / LLMOps Engineer` as the closest required archetype by adjacency, with the role itself described as general backend/platform software engineering.
- Use `Evaluada` in the tracker-addition status because the batch prompt explicitly requires Spanish canonical values for additions.
- Do not use WebFetch/WebSearch because the cached JD contains enough role, salary, location, and sponsorship-enrichment data for this evaluation.

## Risks And Blockers

- Official posting freshness and apply-button state remain unverified in batch mode.
- Sponsorship support is from local enrichment, not official JD body language.
- The role is on-site in Cambridge, MA and may conflict with the candidate's current Durham / San Francisco profile details.

## Final Outcome

Pending artifact creation and verification.
