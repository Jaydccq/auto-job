# Twitch Chat Evaluation

## Background

Batch worker run `-aKsBYxyPEPo9j4SfeUK6` evaluates the cached Jobright JD for Twitch's `Software Engineer I, Twitch Chat` role.

## Goal

Create a complete A-G job evaluation report, add one tracker TSV line for later merge, and skip PDF generation because `PDF_CONFIRMED: no`.

## Scope

- Read local sources: `cv.md`, `article-digest.md`, `config/profile.yml`, `modes/_profile.md`, cached JD, `data/applications.md`, `data/scan-history.tsv`, and `templates/states.yml`.
- Write `reports/264-twitch-2026-04-21.md`.
- Write `batch/tracker-additions/-aKsBYxyPEPo9j4SfeUK6.tsv`.
- Do not edit `cv.md`, `i18n.ts`, or `data/applications.md`.

## Assumptions

- The cached JD is the primary source of truth for this batch run.
- `llms.txt` is optional and absent in this repository.
- The candidate requires sponsorship or work authorization support per `config/profile.yml`.
- `H1B Sponsor Likely` in the cached JD is a positive signal, but not a role-specific guarantee.

## Implementation Steps

1. Read local truth sources and cached JD.
   Verify: source files were read and no web calls were needed.
2. Evaluate A-G using JD requirements against CV and article proof points.
   Verify: report includes role summary, match table, gaps, strategy, compensation, personalization, interview plan, legitimacy, score, and ATS keywords.
3. Add tracker TSV line.
   Verify: line has 9 tab-separated columns, canonical status alias, report link, no PDF marker.
4. Run targeted file verification.
   Verify: report and tracker files exist, tracker column count is 9, final JSON can report success.

## Verification Approach

- Check report path exists.
- Check tracker addition path exists.
- Use `awk -F '\t'` to verify tracker line has exactly 9 columns.
- Do not generate PDF because explicit confirmation is absent.

## Progress Log

- 2026-04-21: Read repository instructions, local profile, CV, article digest, cached JD, state labels, tracker, and scan history.
- 2026-04-21: Confirmed `llms.txt` is absent, cached JD has frontmatter, and no WebFetch/WebSearch is needed.
- 2026-04-21: Determined this is a legitimate but non-AI consumer-facing full-stack chat role with strong real-time/distributed systems overlap and sponsorship as the main unresolved risk.
- 2026-04-21: Wrote report `reports/264-twitch-2026-04-21.md` and tracker addition `batch/tracker-additions/-aKsBYxyPEPo9j4SfeUK6.tsv`.
- 2026-04-21: Bridge artifact recovery finalized the evaluation from report 264 because the Codex process did not emit terminal JSON, then moved the tracker addition to `batch/tracker-additions/merged/-aKsBYxyPEPo9j4SfeUK6.tsv`.
- 2026-04-21: Tracker merge skipped the new Twitch Chat row because `merge-tracker.mjs` treated existing Twitch Commerce Engineering tracker row #97 at `4.05/5` as a fuzzy duplicate with a higher score than the new `3.85/5` row.

## Key Decisions

- Use company `Twitch` from JD frontmatter and write report slug `twitch`.
- Score the role `3.85/5`: strong early-career SWE and compensation fit, weaker AI north-star alignment and gaps in Go/Kotlin/Objective-C/AWS serverless.
- Mark legitimacy `High Confidence` based on detailed JD content, salary transparency, coherent requirements, and no exact prior repost pattern in local scan history.
- Leave `pdf: null` because the prompt explicitly says `PDF_CONFIRMED: no`.

## Risks and Blockers

- Exact live apply-button state is unverified in batch mode.
- Role-specific sponsorship is not guaranteed despite H1B-likely signal.
- The JD is from Jobright cache rather than an official ATS URL.

## Final Outcome

Report 264 was generated successfully and the bridge job completed. The tracker
addition was valid and processed, but `data/applications.md` was not changed
because merge deduplication skipped it as a lower-scored fuzzy duplicate of the
existing Twitch row.
