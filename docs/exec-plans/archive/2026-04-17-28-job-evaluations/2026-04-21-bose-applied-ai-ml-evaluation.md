# Bose Applied AI / ML Engineer Evaluation

## Background

The bridge batch worker received a cached JD for Bose Corporation's Applied AI
& ML Engineer role from the local newgrad scan pipeline. PDF generation is
explicitly disabled for this run.

## Goal

Generate report 291 and a tracker-addition TSV row for the cached Bose Applied
AI & ML Engineer posting.

## Scope

- Read the cached JD plus required local sources: `cv.md`, `article-digest.md`,
  optional `llms.txt`, profile, tracker, state, and scan-history files.
- Produce `reports/291-bose-corporation-2026-04-21.md`.
- Produce `batch/tracker-additions/CJunrFLfBFhQFrHl8Yfrs.tsv`.
- Do not generate a PDF and do not edit `cv.md`, `i18n.ts`, or
  `data/applications.md`.

## Assumptions

- The cached JD is sufficient for the evaluation because it includes company,
  role, requirements, responsibilities, skill tags, sponsorship recommendation
  tags, and source metadata.
- `llms.txt` is optional and absent in this checkout.
- The cached `salary` field is scanner/job-board marketing copy, not
  compensation, so it should not be used as pay data.
- The role URL indicates Framingham, MA, but remote/hybrid status is not
  specified in the cached JD.
- Because the frontmatter says `h1b: unknown` while the body says `H1B Sponsor
  Likely`, sponsorship is a verification risk, not an automatic hard no.

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
  `article-digest.md`, `config/profile.yml`, states, tracker tail, and scan
  history.
- 2026-04-21: Confirmed `llms.txt` is absent and PDF is not confirmed.

## Key Decisions

- Classify as AI Platform / LLMOps Engineer plus AI Solutions Architect because
  the JD emphasizes RAG, GenAI product integration, ML/data pipelines,
  deployment, monitoring, and stakeholder translation.
- Keep compensation score moderate because no reliable pay band is present in
  the cached JD and no external research was required for the bridge run.
- Treat posting legitimacy as High Confidence because the URL is official Bose
  Workday and the JD is specific enough, while noting batch freshness is
  unverified.

## Risks and Blockers

- Sponsorship must be confirmed manually before heavy tailoring because the
  frontmatter says `h1b: unknown` while the body recommends `H1B Sponsor
  Likely`.
- Batch mode cannot verify live apply-button state or exact posting freshness.
- Compensation cannot be benchmarked precisely without reliable salary data.

## Final Outcome

Pending.
