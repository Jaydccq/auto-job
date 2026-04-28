# Salesforce Slack AI Platform Evaluation

## Background

Bridge batch run `cLRpv4r28IA1S9FPhPAZz` requested a repository-backed evaluation for Salesforce's `Software Engineer (SWE/SWE II), AI Platform- Slack` posting. The cached JD file is the primary source.

## Goal

Generate report `reports/321-salesforce-2026-04-23.md` and tracker addition `batch/tracker-additions/cLRpv4r28IA1S9FPhPAZz.tsv` without generating a PDF.

## Scope

- Read local sources: cached JD, `cv.md`, `article-digest.md`, `config/profile.yml`, `data/applications.md`, `data/scan-history.tsv`, and canonical states.
- Evaluate blocks A-G and include block H only if the global score is at least 4.5.
- Do not edit `cv.md`, `i18n.ts`, `data/applications.md`, or portfolio files.

## Assumptions

- The cached JD is sufficient because it contains title, company, location, salary range, requirements, responsibilities, sponsorship enrichment, and match tags.
- No PDF is generated because `PDF_CONFIRMED: no`.
- `llms.txt` is optional and absent in this checkout.
- The tracker row number is `316`, calculated as max existing `data/applications.md` row plus one.

## Implementation Steps

1. Read source files and prior local history.
   Verify: source commands complete and no web search is needed.
2. Classify the role and score the fit.
   Verify: report includes all required sections and exact CV line references.
3. Write report and tracker addition.
   Verify: files exist at required paths and tracker row has 9 tab-separated columns.
4. Record final outcome in this plan.
   Verify: progress log and final outcome are updated.

## Verification Approach

- Check report file exists and contains the required header fields.
- Check tracker addition exists and has exactly one line with 9 TSV columns.
- Confirm no PDF was generated for this batch run.

## Progress Log

- 2026-04-23: Read `CLAUDE.md`, cached JD, `cv.md`, `article-digest.md`, `config/profile.yml`, tracker, states, and scan history.
- 2026-04-23: Confirmed no YAML frontmatter delimiter in the cached JD; used it as local cache metadata and JD text.
- 2026-04-23: Classified the role as `AI Platform / LLMOps Engineer`, with `Agentic Workflows / Automation` as secondary.

## Key Decisions

- Use a high-priority apply score because the role directly buys AI platform tooling, LLM operationalization, developer tooling, AI quality evaluation, CI/CD, Python, cloud APIs, and reliability.
- Cap the match below perfect because the CV does not show PHP/Hack or direct Slack platform work, and LLM evaluation framework experience is adjacent rather than exact enterprise platform ownership.
- Treat sponsorship as a caution rather than a blocker because the local enrichment says `sponsorship_supported` and `H1B Sponsor Likely`; official Workday text still needs recruiter confirmation.

## Risks and Blockers

- Batch mode cannot verify apply-button state or posting age.
- `llms.txt` is absent, so evaluation relies on `cv.md`, `article-digest.md`, profile, and cached JD.
- On-site Bellevue logistics and work authorization support need confirmation before heavy interview preparation.

## Final Outcome

Pending file write and verification.
