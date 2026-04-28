# Modo: cover-letter — Single-Page Cover Letter PDF

When the user runs `/career-ops cover-letter` (or auto-pipeline triggers
this at score ≥ 4.5), produce a one-page cover letter PDF that mirrors
the CV's visual identity and uses the "I'm choosing you" tone defined
in `modes/auto-pipeline.md`.

This mode REQUIRES `_shared.md` to be loaded first.

## Inputs Required

| Source | Used for |
|--------|----------|
| JD text or URL (from user or report) | Quote selection, archetype detection, tone calibration |
| `cv.md` | Real proof points, real metrics, real project names |
| `config/profile.yml` | Candidate name, email, LinkedIn, location, proof_points |
| `modes/_profile.md` | Archetype-specific framing, exit narrative |
| `article-digest.md` (if exists) | Detailed proof point metrics (overrides cv.md) |
| Most recent matching report in `reports/` (if exists) | Section B match table, archetype already detected |

## Tone Rules (from auto-pipeline.md lines 44-60)

**Position: "I'm choosing you."** The candidate has options and is choosing this company for concrete reasons.

- **Confident, not arrogant**
- **Selective, not haughty**
- **Specific and concrete** — always reference something REAL from JD AND something REAL from CV
- **Direct, no fluff** — see `_shared.md` lines 113-121 for the cliché ban list (do NOT use those words)
- **The hook is the proof, not the claim** — "I built X that does Y" beats "I'm great at X"

## Structure (4 Paragraphs, ~250-350 words total, max 1 page)

| # | Paragraph | What it does |
|---|-----------|--------------|
| 1 | **Hook + position** | One sentence on what you've been building (real, specific, recent), one sentence positioning this role as the next step. Reference the stack or domain of the JD. |
| 2 | **JD quote → proof point** | Quote 1-2 sentences from the JD verbatim. Map each quote to a specific project/metric from `cv.md`. Include a project link (`github.com/...` or `proof_points[].url`). |
| 3 | **Why this fit beyond stack match** | One paragraph on the engineering judgment / archetype-specific value the candidate brings. Use the archetype framing from `modes/_profile.md`. |
| 4 | **Selective close + soft CTA** | Mention something concrete about the company (their public work, product, blog, GitHub). Soft call-to-action: "Happy to walk through X in a call." NO "I would love the opportunity to..." |

**Word budget:** 60-90 words per paragraph. Total under 350. The template's `max-height: 9.5in` + `overflow: hidden` will silently truncate overflow — verify the rendered PDF reports `Pages: 1`.

## Workflow

```
1. LOAD CONTEXT  → cv.md, profile.yml, _profile.md, JD, matching report (if any)
2. DETECT        → archetype from JD (per _shared.md)
3. SELECT        → quote 1-2 JD sentences worth referencing
4. MAP           → pair each quote to a real proof point from cv.md/profile.yml
5. COMPOSE       → 4 paragraphs following the structure table above
6. BUILD JSON    → write content JSON to /tmp/cover-letter-{slug}.json
7. RUN SCRIPT    → node generate-cover-letter.mjs {json} output/cover-letter-{slug}-{date}.pdf
8. APPEND        → "## H) Cover Letter" section to the report .md
9. VERIFY        → confirm PDF reports "Pages: 1" — if not, shorten paragraphs and re-run
```

## Content JSON Shape

The agent must produce a JSON file matching this shape:

```json
{
  "lang": "en",
  "format": "letter",
  "candidate": {
    "name": "...from profile.yml",
    "email": "...from profile.yml",
    "linkedin_url": "https://linkedin.com/in/...",
    "linkedin_display": "linkedin.com/in/...",
    "location": "...from profile.yml"
  },
  "letter": {
    "company": "Detected from JD",
    "role": "Detected from JD",
    "date": "YYYY-MM-DD (today)",
    "salutation": "Dear {Company} hiring team,",
    "closing": "Best,",
    "paragraphs": [
      "Paragraph 1 (hook + position)...",
      "Paragraph 2 (JD quote → proof)...",
      "Paragraph 3 (engineering judgment)...",
      "Paragraph 4 (selective close + soft CTA)..."
    ]
  }
}
```

**Format selection rule (same as `pdf.md`):**
- US/Canada companies → `"format": "letter"`, `"page_width": "8.5in"`
- Rest of world → `"format": "a4"`, `"page_width": "210mm"`

**Language rule:** English by default. Use another language only when the user explicitly asks.

## Output Path

Save the PDF to:
```
output/cover-letter-{candidate-slug}-{company-slug}-{YYYY-MM-DD}.pdf
```

Example: `output/cover-letter-jane-doe-acme-ai-2026-04-09.pdf`

## Post-Generation

1. **Append to report .md** — add a `## H) Cover Letter` section with:
   - Path to the generated PDF
   - Plain-text version of the 4 paragraphs (so the user can copy-paste into a textarea field if the form does not accept PDF upload)
   - List of JD quotes used
2. **Update tracker note** — add `cover_letter:✅` to the Notes column of the corresponding `applications.md` row (only if the row already exists; use Edit, not Write).
3. **Report to user** — show: PDF path, page count, paragraph word counts, list of JD quotes used.

## When NOT to Generate

- Score < 4.5 in auto-pipeline → skip silently. Cover letters waste energy on weak fits.
- JD has no clear company name → ask user before proceeding (the salutation depends on it).
- Form explicitly says "no cover letter accepted" → skip and note in report.

## Failure Modes

| Symptom | Fix |
|---------|-----|
| `Pages: 2` reported | Paragraphs too long. Cut to 60-70 words each and re-run. |
| `Unreplaced placeholders` error | JSON missing a required field. Check the content shape above. |
| `generate-pdf.mjs` not found | Run from project root, not from `modes/`. |
| Cliché word warning | The user's `_shared.md` flagged a banned word. Rewrite. |
