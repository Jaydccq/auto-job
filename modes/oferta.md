# Mode: oferta — Full A–G evaluation

When the user pastes a JD (text or URL), produce all seven blocks below.
Read `cv.md`, `_profile.md`, and `article-digest.md` first. The output
contract (header fields, file paths, tracker TSV) is defined in
`modes/_shared.md` and is not optional.

## Step 0 — Capture and verify the posting

1. If a URL was given, open it with Playwright (`browser_navigate` +
   `browser_snapshot`). Capture the JD text and the visible apply controls.
2. If the page is dead (no JD body, no apply control, redirect to a generic
   careers page), stop with a single-line "posting closed — no evaluation"
   summary and write a SKIP TSV with status `Discarded`.
3. Detect the archetype using the rules in `_profile.md`. If the JD spans two
   archetypes, name the primary and the secondary.

## Block A — Role Snapshot

Tabular summary plus the dimension scores from `_shared.md`.

| Field | Value |
|-------|-------|
| Archetype | primary (+ secondary if hybrid) |
| Domain | platform / agentic / LLMOps / ML infra / enterprise AI / other |
| Function | build / consult / manage / deploy |
| Seniority signal | exact phrasing the JD uses |
| Location / remote | full / hybrid / onsite + cities |
| Team size | as stated, or "not stated" |
| TL;DR | one sentence describing the bet this role is making |

| Dimension | Score (1–5) | Evidence |
|-----------|-------------|----------|
| CV match | | |
| Profile alignment | | |
| Comp | | |
| Cultural signals | | |
| Red flags (subtract) | | |
| **Global** | | |

## Block B — CV Match & Gaps

For every must-have in the JD, show the matching `cv.md` line — quote the
line, do not paraphrase. Flag gaps explicitly.

| JD requirement | CV evidence | Match strength |
|----------------|-------------|----------------|

For each gap, answer:

1. Hard blocker, soft blocker, or nice-to-have?
2. Adjacent experience that can be reframed?
3. Portfolio project that closes it?
4. One concrete mitigation (cover-letter sentence, fast project, citation).

## Block C — Level Strategy

1. Level the JD asks for vs. the level the user can credibly carry for this
   archetype (read `_profile.md` for self-assessment).
2. "Sell up without lying" — three lines reframing existing impact for the
   higher level. Cite the cv.md or article-digest.md source for each.
3. "If they downlevel" — minimum acceptable comp, 6-month review milestones,
   promotion criteria to negotiate.

## Block D — Comp & Demand

Use WebSearch. Cite every number.

| Source | Compensation data | Note |
|--------|-------------------|------|
| Levels.fyi | | |
| Glassdoor | | |
| Blind / public reports | | |

Demand trend in one paragraph. Negotiation anchor: target / minimum / walk
numbers, all aligned with `config/profile.yml`.

## Block E — Tailoring Plan

| # | Surface | Current | Proposed change | Why |
|---|---------|---------|-----------------|-----|
| 1 | CV summary | | | |
| 2 | CV bullet (highest-impact) | | | |
| 3 | LinkedIn headline | | | |
| 4 | LinkedIn About first line | | | |
| 5 | Cover letter opener | | | |

Top five for the CV, top five for LinkedIn. No more — pick the highest-leverage
edits.

## Block F — Interview Stories (STAR + Reflection)

6–10 stories, each mapped to a JD requirement.

| # | JD requirement | Story tag | S | T | A | R | Reflection |
|---|----------------|-----------|---|---|---|---|------------|

The Reflection column is what separates senior from junior — what was learned,
what you would do differently. If `interview-prep/story-bank.md` exists, dedupe
new stories against it and append fresh ones.

Add:

- One case-study pick (which portfolio project to walk through, in what order).
- 3 red-flag-question drafts the user should rehearse (e.g., "Why did you sell
  the company?", "Why a step down in title?").

## Block G — Posting Legitimacy

Run the signal checklist from `modes/_shared.md`:

| Signal | Source | Finding | Weight (positive / neutral / concerning) |
|--------|--------|---------|-------------------------------------------|

Tier: **High Confidence**, **Proceed with Caution**, or **Suspicious**.
Add a "Context notes" line when the JD is government, academic, evergreen,
staff+, or recruiter-sourced — those legitimately bend the thresholds.

This block does **not** roll into the 1–5 global score, but it goes in the
report header so the dashboard can surface suspicious postings.

## Block H — Application Answers (only if Global ≥ 4.5)

Draft answers for the public application-form free-text fields. Each answer:

- Quotes one JD phrase verbatim, then maps it to one cv.md proof point.
- Stays under the form word limit (default to 200 words if unstated).
- Ends with one specific question for the hiring manager (only on cover-letter
  drafts, not form answers).

---

## Post-evaluation tasks (always)

1. **Write the report** to `reports/{NNN}-{slug}-{YYYY-MM-DD}.md` using the
   header schema in `modes/_shared.md`. `{NNN}` is the next sequential number
   (3 digits, zero-padded — see existing files).
2. **Write a tracker TSV** to `batch/tracker-additions/{NNN}-{slug}.tsv`
   following the 9-column contract. Status defaults to `Evaluated`.
3. **PDF only on explicit request or auto-pipeline trigger.** Do not generate
   one for sub-4.5 scores.
4. **Update the user.** One-line summary: company, role, score, recommendation.
5. **Never run** `npm run merge` automatically — that is an operator action.
