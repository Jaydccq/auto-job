# Wonderschool Applied AI Evaluation

## Background

Bridge batch run `oBOS7GwIaC-LaF27hVAMy` requests report `330` for Wonderschool,
Early Career Software Engineer – Applied AI. The temporary JD cache at
`/var/folders/ly/sdg_pj9x6xb8b89q5yytyhdw0000gn/T/career-ops-bridge-jd-oBOS7GwIaC-LaF27hVAMy.txt`
is the primary source, and the repository already contains a prior quick-screen
artifact for the same role (`reports/329-wonderschool-2026-04-23.md`) that was
explicitly called out in `docs/exec-plans/active/2026-04-19-newgrad-scan-run.md`
as incomplete because structured signals were lost during a retry.

## Goal

Create a complete A-G evaluation report from repository sources, write one
tracker-addition TSV row, and return a valid bridge JSON summary.

## Scope

- Read-only sources: `cv.md`, optional `llms.txt`, `article-digest.md`,
  `config/profile.yml`, `data/applications.md`, `data/scan-history.tsv`,
  `templates/states.yml`, the cached JD file, and existing Wonderschool report
  context as needed.
- Write targets:
  `reports/330-wonderschool-2026-04-23.md`,
  `batch/tracker-additions/oBOS7GwIaC-LaF27hVAMy.tsv`, and this plan file.
- No edits to `cv.md`, `i18n.ts`, `data/applications.md`, or portfolio files.
- No PDF generation because explicit confirmation is absent.

## Assumptions

- The cached JD is sufficient for a full evaluation because it contains company,
  role, salary, work-model language, responsibilities, requirements, benefits,
  and an H1B-likely enrichment note.
- `llms.txt` is optional and currently absent, so evaluation will rely on
  `cv.md`, `article-digest.md`, and `config/profile.yml`.
- Unknown sponsorship is a risk to call out, but not an automatic skip because
  the repository profile minimum is `$90K`, the role band starts at `$100K`,
  and the local cache also notes some H1B history.
- The tracker-addition row should use the batch-prompt alias `Evaluada`; the
  repository merge flow normalizes it to `Evaluated`.

## Implementation Steps

1. Read the required repository sources and the cached JD.
   Verify: all role requirements, candidate constraints, prior artifacts, and
   tracker numbering are grounded in files already in the repo or temp cache.
2. Re-score the role with a full A-G evaluation.
   Verify: each major JD requirement maps to exact `cv.md` or
   `article-digest.md` evidence, and risks are stated explicitly.
3. Write the markdown report.
   Verify: the report exists at the required path and contains A-G, global
   score, legitimacy, URL, batch ID, and extracted keywords.
4. Write the tracker addition.
   Verify: the TSV row has 9 tab-separated columns, status before score, next
   tracker number `321`, and the required report link.
5. Run targeted verification.
   Verify: artifacts are non-empty, the tracker row has 9 columns, and
   `git diff --check` passes for touched files.

## Verification Approach

- `test -s` on the new report and tracker-addition files.
- `awk -F '\t' 'NR==1 { print NF }'` on the TSV row.
- `git diff --check -- <touched files>` for whitespace and patch hygiene.

## Progress Log

- 2026-04-23: Read `AGENTS.md`, `CLAUDE.md`, `docs/CODEX.md`, ran
  `node update-system.mjs check`, and confirmed the required repo files exist
  except optional `llms.txt`.
- 2026-04-23: Read `config/profile.yml`, `cv.md`, `article-digest.md`, the
  cached Wonderschool JD, `templates/states.yml`, `data/applications.md`, and
  `data/scan-history.tsv`.
- 2026-04-23: Confirmed the current tracker max is `320`, so the new
  tracker-addition row must use `321`.

## Key Decisions

- Re-evaluate Wonderschool deeply instead of trusting report `329` because the
  prior quick-screen was explicitly documented as incomplete.
- Keep the entire evaluation local-source-first; no web fetch or web search is
  needed because the cached JD already contains salary, company, role, and
  enough detail for a legitimacy judgment.
- Skip PDF generation and set the final JSON `pdf` field to `null`.

## Risks and Blockers

- Official sponsorship support for this specific role is still unconfirmed.
- The salary band is acceptable but not exciting for a hybrid San Francisco
  applied-AI role.
- Posting freshness and live apply state remain unverified in batch mode.

## Final Outcome

In progress.
