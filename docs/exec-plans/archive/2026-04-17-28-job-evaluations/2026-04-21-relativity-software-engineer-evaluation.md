# Relativity Software Engineer Evaluation

## Background

Bridge batch run `8lSGN_5CRgGxDhANxnJOy` requested a complete A-G evaluation for Relativity's `Software Engineer` role from the cached JD file at `/var/folders/ly/sdg_pj9x6xb8b89q5yytyhdw0000gn/T/career-ops-bridge-jd-8lSGN_5CRgGxDhANxnJOy.txt`.

PDF generation is explicitly disabled for this run (`PDF_CONFIRMED: no`).

## Goal

Create a repository-backed job evaluation report and tracker-addition line for report number `284`.

## Scope

- Read the cached JD, `cv.md`, `article-digest.md`, `config/profile.yml`, tracker state, and scan history.
- Write `reports/284-relativity-2026-04-21.md`.
- Write `batch/tracker-additions/8lSGN_5CRgGxDhANxnJOy.tsv`.
- Do not edit `cv.md`, `i18n.ts`, `data/applications.md`, or portfolio files.
- Do not generate a PDF.

## Assumptions

- The cached JD is the primary source of truth for this bridge run.
- The cached JD has structured text but no YAML frontmatter block.
- The "H1B Sponsor Likely" tag is a positive sponsorship signal, not a guarantee.
- Missing salary data should lower confidence but does not require external research for this run.

## Implementation Steps

1. Read required repository sources.
   Verify: cached JD, candidate profile, CV, article digest, tracker, and scan history are inspected.
2. Evaluate the role against the candidate using blocks A-G.
   Verify: report includes role summary, CV match, level strategy, comp, customization, interview plan, legitimacy, score, and keywords.
3. Write the tracker-addition TSV.
   Verify: TSV has exactly one line and 9 tab-separated columns.
4. Run targeted file checks.
   Verify: report path exists, tracker path exists, and no PDF was generated.

## Verification Approach

- Use shell checks for file existence.
- Use `awk` to validate tracker TSV column count.
- Use `rg` to confirm required report header fields.

## Progress Log

- 2026-04-21: Started evaluation and confirmed cached JD is present.
- 2026-04-21: Read `cv.md`, `article-digest.md`, `config/profile.yml`, `templates/states.yml`, `data/applications.md`, and `data/scan-history.tsv`.
- 2026-04-21: Confirmed `llms.txt` is not present in the repository.

## Key Decisions

- Use `AI Platform / LLMOps Engineer` as the closest forced archetype, while clearly noting the JD is a general product/platform software engineering role with weak AI signal.
- Treat sponsorship as a recruiter-screen validation item because the cache says `H1B Sponsor Likely` but the JD text itself does not guarantee sponsorship.
- Score below the draft-answers threshold, so Block H is omitted.

## Risks and Blockers

- Posting freshness and apply-button state are unverified in batch mode.
- Salary is not reliably supplied in the cache; the visible `Salary` field is unrelated ad text.
- Direct C#/.NET, Azure Functions, Azure Service Bus, and Azure DevOps evidence is weaker than Java/Spring/AWS evidence.

## Final Outcome

Pending.
