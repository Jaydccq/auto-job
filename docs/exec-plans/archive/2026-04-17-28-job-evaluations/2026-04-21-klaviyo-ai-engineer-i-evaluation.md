# Klaviyo AI Engineer I Evaluation

## Background

The bridge batch worker received a cached JD for Klaviyo AI Engineer I from the
local JobRight/newgrad pipeline. PDF generation is explicitly disabled for this
run.

## Goal

Generate report 287 and a tracker-addition TSV row for the cached Klaviyo AI
Engineer I posting.

## Scope

- Read the cached JD plus required local sources: `cv.md`, `article-digest.md`,
  optional `llms.txt`, and profile/tracker files needed for blockers and output.
- Produce `reports/287-klaviyo-2026-04-21.md`.
- Produce `batch/tracker-additions/hOHrdt7rgwB-CyefBymht.tsv`.
- Do not generate a PDF and do not edit `cv.md`, `i18n.ts`, or
  `data/applications.md`.

## Assumptions

- The cached JD is sufficient because it includes company, role, location,
  model, requirements, responsibilities, and sponsorship signal.
- `llms.txt` is optional and absent in this checkout.
- The current profile hard filters are authoritative for blocked companies:
  TikTok and ByteDance are blocked, while Klaviyo is not.
- A prior Klaviyo report noted historical sponsorship concern, so the new report
  should flag manual sponsorship verification without converting it into a hard
  blocker when the current JD says H1B Sponsor Likely.

## Implementation Steps

1. Read the cached JD and local candidate sources.
   Verify: line-numbered evidence is available for report citations.
2. Draft the A-G evaluation and omit H unless score reaches 4.5.
   Verify: report contains all requested sections and ATS keywords.
3. Write the tracker-addition TSV with max existing application number + 1.
   Verify: one tab-separated line with nine fields.
4. Run targeted file checks.
   Verify: report exists, tracker line has nine columns, and PDF remains absent.

## Verification Approach

- Shell checks for file existence.
- TSV column count check.
- Content checks for required report metadata and no PDF generation.

## Progress Log

- 2026-04-21: Read `CLAUDE.md`, cached JD, `cv.md`,
  `article-digest.md`, `config/profile.yml`, states, tracker tail, scan history,
  and prior Klaviyo report context.
- 2026-04-21: Confirmed `llms.txt` is absent and PDF is not confirmed.

## Key Decisions

- Classify as Agentic Workflows / Automation plus AI Platform / LLMOps because
  the JD emphasizes agentic architecture, model-serving reliability, evals,
  Python/backend systems, and Spark-scale data processing.
- Treat sponsorship as favorable but still worth confirming: the cached JD says
  H1B Sponsor Likely, while earlier repository history recorded a Klaviyo
  sponsorship concern.

## Risks and Blockers

- The cached JD salary field is JobRight marketing copy rather than compensation,
  so comp scoring must be lower-confidence without external research.
- Batch mode cannot verify live apply-button state or posting freshness.

## Final Outcome

Pending.
