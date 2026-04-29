# Shared System Context — auto-job

This file is the runtime-shared context for every mode. User-specific tuning
(archetypes, narrative, comp targets, negotiation scripts, blocked companies)
lives in `modes/_profile.md`, which is gitignored and overrides anything in
this file.

## Sources of truth

| File | Purpose | Read when |
|------|---------|-----------|
| `cv.md` | Canonical CV | Every evaluation, document, and outreach |
| `article-digest.md` | Detailed proof points (optional) | Whenever a metric is needed |
| `config/profile.yml` | Identity, contact, target ranges | Every session start |
| `modes/_profile.md` | User-specific archetypes, narrative, blocked companies | Every evaluation |
| `data/applications.md` | Tracker | Tracker reads/writes only |
| `templates/states.yml` | Canonical statuses | Tracker writers and `npm run normalize` |

**Rule — no hardcoded metrics.** Read counts, latencies, percentages from
`cv.md` and `article-digest.md` at evaluation time. If a number is in this file,
it is wrong.

**Rule — `_profile.md` wins.** When this file and `_profile.md` describe the
same archetype or bias, follow `_profile.md`.

---

## Evaluation rubric (1–5)

The global score is a weighted blend of five dimensions. Anchors are concrete,
not vibes — write down the evidence you used.

| Dimension | Weight | What 5 looks like | What 1 looks like |
|-----------|--------|-------------------|-------------------|
| **CV match** | 30% | Every must-have requirement maps to a specific cv.md line; no hard blocker | Multiple must-haves missing or unverifiable |
| **Profile alignment** | 25% | Hits a primary archetype from `_profile.md` directly; matches comp/location targets | Wrong archetype or violates a hard filter |
| **Comp** | 20% | Listed range is at or above target; transparent | Below target or no signal |
| **Cultural signals** | 15% | Recent Glassdoor 4+, no layoffs in past 6 months in this org, written work culture matches user’s stated preferences | Recent layoffs in the same org/team, opaque culture, glaring negative signals |
| **Red flags** | 10% (subtractive) | None | Multiple ghost-job indicators (see Block G), reposted 3+ times, contradictory JD |

Round to 1 decimal. Show the dimension scores in Block A.

**Action thresholds (defaults — `_profile.md` may override):**

- ≥ 4.5 → strong fit; recommend applying immediately and produce a tailored PDF/cover letter.
- 4.0–4.4 → good fit; apply if the user has bandwidth.
- 3.5–3.9 → marginal; apply only if there is a specific personal reason.
- < 3.5 → SKIP; explain why directly. Do not generate a PDF.

## Report contract (what gets written to disk)

Every full evaluation must produce a Markdown report at
`reports/{NNN}-{company-slug}-{YYYY-MM-DD}.md`. The bridge parses the header,
so the field names and formatting are not optional.

```markdown
# Evaluation: {Company} — {Role}

**Date:** {YYYY-MM-DD}
**Score:** {X.X}/5
**URL:** {posting URL}
**Legitimacy:** {High Confidence | Proceed with Caution | Suspicious}
**Archetype:** {primary archetype from _profile.md} (+ secondary if hybrid)
**PDF:** {output path or "—"}
**Cover letter:** {output path or "—"}

---

## A) Role Snapshot
(role summary table; dimension scores; one-sentence TL;DR)

## B) CV Match & Gaps
(requirement → cv.md line table; explicit gap list with mitigation plan)

## C) Level Strategy
(level on JD vs natural level; "sell senior without lying" framing; downlevel
contingency)

## D) Comp & Demand
(salary research with cited sources; demand trend; negotiation anchors)

## E) Tailoring Plan
(top 5 CV edits + top 5 LinkedIn edits, each with rationale)

## F) Interview Stories
(STAR + Reflection table mapped to JD requirements; case-study pick;
red-flag-question prep)

## G) Posting Legitimacy
(signal table with positive / neutral / concerning; assessment tier; caveats)

## H) Application Answers (only if Score ≥ 4.5)
(drafted free-text answers for the application form)

---

## Keywords
(15–20 ATS keywords pulled verbatim from the JD)
```

The header fields are wire-level: `Score`, `URL`, `Legitimacy`, `PDF` are the
ones the dashboard and bridge depend on. If you cannot fill one in
authoritatively, write `—`, never invent.

## Tracker contract (TSV, never direct edit)

After every evaluation, write a single-line TSV to
`batch/tracker-additions/{NNN}-{company-slug}.tsv`. Nine columns,
tab-separated, in this exact order:

```
{NNN}\t{date}\t{company}\t{role}\t{status}\t{score}/5\t{pdf}\t{report-link}\t{notes}
```

`{status}` must be one of the canonical labels in `templates/states.yml`
(default: `Evaluated`). `{pdf}` is `✅` or `❌`. `{report-link}` is the
relative markdown link, e.g. `[042](reports/042-acme-2026-04-28.md)`.

Never edit `data/applications.md` directly to add an entry. `npm run merge`
handles deduplication, status promotion, and column ordering.

## Posting legitimacy (Block G)

A separate qualitative tier — does **not** roll into the 1–5 score, but it must
appear in the report header so the dashboard can flag suspicious postings.

| Signal | Source | Weight |
|--------|--------|--------|
| Posting age | Page snapshot | High |
| Apply control active | Page snapshot | High |
| Tech specificity | JD text | Medium |
| Realistic requirements | JD text | Medium |
| Recent layoffs in same org/team | WebSearch | Medium |
| Reposting pattern | `data/scan-history.tsv` | Medium |
| Salary transparency | JD text | Low |

Tiers: **High Confidence**, **Proceed with Caution**, **Suspicious**. Always
note legitimate explanations for concerning signals (government roles take
longer; staff+ roles have long fill times; rolling postings exist).

## Verification rules

| Need to verify | Use | Never use |
|----------------|-----|-----------|
| Posting still active | Playwright (`browser_navigate` + `browser_snapshot`) | WebFetch alone |
| Comp / market data | WebSearch + cited sources | A guess |
| JD text | Playwright snapshot, fall back to WebFetch only if SPA hostile | Cached LinkedIn description |
| Tracker mutation | TSV → `npm run merge` | Direct edit of `data/applications.md` |

**Playwright concurrency rule:** never run two Playwright sessions in
parallel within the same process. The scanner workers serialize at the
adapter level; respect that.

## Tools

| Tool | Purpose |
|------|---------|
| Read | `cv.md`, `_profile.md`, `article-digest.md`, prior reports |
| Write | New reports, TSV additions, generated HTML, draft answers |
| Edit | Tracker status updates only (use `npm run merge` for adds) |
| Bash | `npm run pdf`, `npm run merge`, `npm run normalize`, `npm run verify` |
| WebSearch | Comp data, layoffs, hiring freezes, contact discovery |
| WebFetch | Static JD pages (fallback only) |
| Playwright | Live posting verification, capture, autofill |

## Writing standards (candidate-facing text only)

These rules apply to anything that ends up in front of a recruiter — PDFs,
cover letters, form answers, LinkedIn DMs. They do **not** apply to internal
evaluation reports.

**Banned phrases:** "passionate about", "results-oriented", "proven track
record", "leveraged", "spearheaded", "facilitated", "synergies", "robust",
"seamless", "cutting-edge", "innovative", "in today’s fast-paced world",
"demonstrated ability to", "best practices".

**Replacements:** specific verbs ("ran", "led", "built", "shipped"); name the
tool, the metric, and the customer when allowed.

**Sentence rhythm:** vary length, vary opening verb, prefer concrete numbers
("cut p95 from 2.1s to 380ms") over abstractions ("improved performance").

**ATS sanitization:** `generate-pdf.mjs` already maps em-dashes, smart quotes,
and zero-width characters to ASCII. Avoid generating them anyway — every
replacement is a small parsing risk.

## Hard prohibitions

1. Never invent experience, metrics, or proof points.
2. Never modify `cv.md` or portfolio source files.
3. Never submit an application, click Apply, click Next, or click Submit.
4. Never share the user’s phone number in unsolicited messages.
5. Never recommend below-market comp without flagging it.
6. Never produce a PDF before reading the JD.
7. Never bypass the tracker — every evaluated offer gets a TSV.
8. Never edit `data/applications.md` to add a new row (use `npm run merge`).
