# FanDuel Software Engineer Evaluation

## Background

Bridge batch run `PTiGN2WdXq2oJtHZ5ReXK` requests report `323` for FanDuel's `Software Engineer` role from the cached local JD file at `/var/folders/ly/sdg_pj9x6xb8b89q5yytyhdw0000gn/T/career-ops-bridge-jd-PTiGN2WdXq2oJtHZ5ReXK.txt`.

## Goal

Produce a complete A-G job evaluation report and a tracker-addition TSV line without generating a PDF and without modifying `cv.md`, `i18n.ts`, or `data/applications.md`.

## Scope

- Read required repository sources: `cv.md`, `article-digest.md`, `config/profile.yml`, `data/applications.md`, `data/scan-history.tsv`, and local JD cache.
- Create `reports/323-fanduel-2026-04-23.md`.
- Create `batch/tracker-additions/PTiGN2WdXq2oJtHZ5ReXK.tsv`.
- Skip PDF generation because `PDF_CONFIRMED: no`.

## Assumptions

- The cached JD file is the primary source because it exists and includes company, role, location, salary, sponsorship-enrichment signals, requirements, responsibilities, and a description excerpt.
- The local JD has no YAML frontmatter delimiters, so frontmatter usage is false.
- The candidate requires sponsorship based on `config/profile.yml`.
- The role is a general backend/full-stack software engineering role; among the required six archetypes, the closest match is `AI Platform / LLMOps Engineer` by platform-systems adjacency.

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

- 2026-04-23: Read cached JD. It identifies FanDuel, Software Engineer, Atlanta on-site, `$116000-$152250/yr`, `H1B Sponsor Likely`, and requirements around Java backend APIs, React/React Native, AWS, Docker/Kubernetes/IaC, testing, ownership, and operational excellence.
- 2026-04-23: Read `cv.md`, `article-digest.md`, `config/profile.yml`, `templates/states.yml`, `data/applications.md`, and `data/scan-history.tsv`. `llms.txt` is absent.
- 2026-04-23: Checked local tracker/history for prior FanDuel or token matches; none found.

## Key Decisions

- Score the role as a strong generic software-engineering target, not a top AI-north-star target.
- Do not use WebFetch/WebSearch because the cached JD contains enough role, salary, location, and sponsorship-enrichment data for evaluation and compensation scoring.
- Use `Evaluada` in the tracker-addition status because the batch prompt explicitly requires Spanish canonical values for additions.

## Risks and Blockers

- Official posting freshness and apply-button state remain unverified in batch mode.
- Sponsorship support is from local enrichment, not the official JD body.
- React Native and formal Infrastructure as Code proof are weaker than Java/React/Docker/AWS/backend evidence.
- On-site Atlanta logistics need recruiter confirmation.

## Final Outcome

Pending artifact creation and verification.
