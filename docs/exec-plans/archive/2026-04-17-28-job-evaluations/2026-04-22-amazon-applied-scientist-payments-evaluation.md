# Amazon Applied Scientist Payments Evaluation

## Background

Batch worker run `bLh4238-hln8_MwCgdwEE` evaluates Amazon's Applied Scientist I, Amazon Payments Team role for Hongxi Chen.

Primary local JD cache: `/var/folders/ly/sdg_pj9x6xb8b89q5yytyhdw0000gn/T/career-ops-bridge-jd-bLh4238-hln8_MwCgdwEE.txt`.

The cache contained structured role metadata, local enrichment, requirements, responsibilities, skill tags, and sponsorship signals. The Amazon official posting was opened once after the cache proved compact, to fill the full team description and official salary range.

## Goal

Create a complete A-G job evaluation report, add the required tracker-addition TSV line, and do not generate a PDF.

## Scope

In scope:
- Read `cv.md`, `article-digest.md`, `llms.txt` if present, `config/profile.yml`, JD cache, tracker data, states, scan history, and project instructions.
- Generate `reports/302-amazon-2026-04-22.md`.
- Generate `batch/tracker-additions/bLh4238-hln8_MwCgdwEE.tsv`.
- Verify report structure, tracker field count, and protected files.

Out of scope:
- PDF generation because `PDF_CONFIRMED: no`.
- Editing `cv.md`, `i18n.ts`, portfolio files, or `data/applications.md`.
- Deep company research beyond the JD cache, the official Amazon posting, and local repository signals.

## Assumptions

- Candidate is Hongxi Chen, read from `config/profile.yml`.
- Candidate requires sponsorship or work authorization support per `config/profile.yml`.
- The local enrichment signal `H1B Sponsor Likely` is useful but should still be confirmed before applying.
- No active security clearance requirement appears in the JD cache or official posting.
- The role is best framed as `AI Platform / LLMOps Engineer`, with `Agentic Workflows / Automation` as the secondary archetype because the Pi team owns production ML, GenAI, LLM, agentic AI, evaluation, and monitoring for Amazon Payments.

## Implementation Steps

1. Read required local sources.
   Verify: `cv.md`, `article-digest.md`, profile, JD cache, tracker, states, and scan history were inspected.
2. Complete A-G analysis.
   Verify: report includes all required sections, score table, legitimacy assessment, and ATS keywords.
3. Write tracker-addition TSV.
   Verify: one line, nine tab-separated columns, next number from `data/applications.md`, canonical status.
4. Run targeted checks.
   Verify: files exist, protected files unchanged, report contains required headings, tracker has nine columns.

## Verification Approach

- Use shell checks for report existence and required headings.
- Use `awk` field-count validation for the tracker TSV.
- Use `git diff -- cv.md i18n.ts` to ensure protected files were not modified.

## Progress Log

- 2026-04-22: Read `CLAUDE.md`, `cv.md`, `article-digest.md`, `config/profile.yml`, JD cache, tracker tail, canonical states, and scan-history matches.
- 2026-04-22: Confirmed update checker result `offline`; no update action needed.
- 2026-04-22: Confirmed `llms.txt` is absent.
- 2026-04-22: Opened official Amazon posting after compact cache to recover full team context and official salary range; used one web search after direct fetch failed.
- 2026-04-22: Drafted report 302 and tracker-addition line without generating a PDF.

## Key Decisions

- Do not generate PDF; explicit confirmation is absent.
- Score the role above apply threshold but below draft-answer threshold because the role strongly matches AI systems, RAG, agentic workflows, SQL, Python, C++, Java, and production monitoring, while the publication and formal applied-science research gaps are real.
- Mark legitimacy `High Confidence` because the official Amazon posting is accessible, has an Apply entry in text fetch, includes coherent responsibilities and compensation, and no exact prior appearance was found in local scan history.
- Use `Evaluated` as the tracker status because `templates/states.yml` is the repository source of truth.

## Risks and Blockers

- Apply-button state was not verified with Playwright in batch mode.
- Sponsorship should be confirmed early despite favorable local scan signal.
- The role prefers top-tier publications; Hongxi's proof is stronger in production AI systems than peer-reviewed ML research.
- The role is on-site in Seattle, which requires relocation from the current Durham/San Francisco profile context.

## Final Outcome

Report `reports/302-amazon-2026-04-22.md` was generated with score `4.15/5`,
merged into the tracker as an update to the existing Amazon Applied Scientist
row, and no PDF was generated.
