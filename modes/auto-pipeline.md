# Mode: auto-pipeline — default JD flow

When the user pastes a JD (text or URL) without an explicit subcommand, run
this pipeline. It chains `oferta` evaluation, optional document generation,
and tracker registration. All file paths and report contracts come from
`modes/_shared.md`.

## Step 0 — Get the JD text

If the input is a URL:

1. **Playwright (preferred)** — `browser_navigate` + `browser_snapshot`.
   Greenhouse, Ashby, Lever, Workday, and most modern boards are SPAs.
2. **WebFetch (fallback)** — for static pages.
3. **Manual paste (last resort)** — ask the user to paste the JD body.

If the input is JD text, use it directly.

## Step 1 — Evaluation A–G

Run `modes/oferta.md` end-to-end. Produce all blocks A–G plus dimension
scores and the global score.

## Step 2 — Save the report

Write to `reports/{NNN}-{slug}-{YYYY-MM-DD}.md` using the header schema in
`modes/_shared.md`. The header must include `Score`, `URL`, `Legitimacy`,
`Archetype`, `PDF`, and `Cover letter` fields — these are wire-level for the
dashboard.

## Step 3 — PDF (only on explicit request)

Do **not** auto-generate a PDF. After the report is saved, summarize the
result for the user and wait for explicit confirmation ("yes, build the CV"
or "tailor the resume"). When confirmed, run `modes/cover-letter.md`'s sibling
PDF flow via `npm run pdf`.

## Step 4 — Application form drafts (only if Score ≥ 4.5)

Generate drafts for the application-form free-text fields under Block H of
the report.

1. Try to fetch the form questions with Playwright. If unreachable, use the
   generic prompts below.
2. Tone: **"I'm choosing you."** Confident, specific, not pleading.
3. Length: 2–4 sentences per answer, under the form word limit (default 200).
4. Structure: quote one JD phrase verbatim, then map to one cv.md proof
   point with a number.

Generic prompts to fall back on:

- Why are you interested in this role?
- Why this company?
- Tell us about a relevant project or achievement.
- What makes you a good fit for this position?
- How did you hear about this role?

Banned phrasing: "passionate about", "I would love the opportunity", "I am
excited to", "results-oriented". Use specific verbs and concrete metrics.

## Step 5 — Cover letter (only on explicit request)

Even at Score ≥ 4.5, do **not** auto-generate the cover letter. Ask first.
When confirmed, follow `modes/cover-letter.md` and emit
`output/cover-letter-{slug}-{YYYY-MM-DD}.pdf`. Append a `## Cover Letter`
section to the saved report with the file path and the JD quotes used.

Skip the cover letter even if the user asks when:

- The JD explicitly says "no cover letter accepted".
- The form has no cover-letter field and no free-text field where a letter
  could be pasted.

## Step 6 — Tracker TSV

Write `batch/tracker-additions/{NNN}-{slug}.tsv` with the 9-column contract
in `modes/_shared.md`. The user runs `npm run merge` later — never run it
inside this pipeline.

## Failure handling

If a step fails (Playwright timeout, WebSearch quota, PDF render error):

1. Continue to the next step.
2. Mark the failed step as pending in the tracker note column.
3. Surface the failure in the user-facing summary so the user can retry.
