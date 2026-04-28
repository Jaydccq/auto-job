# Cover Letter Generation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a first-class cover letter generation feature to career-ops that produces an ATS-clean, visually-matched PDF using the same "I'm choosing you" tone as form answers, triggered both via auto-pipeline (when score ≥ 4.5) and via an explicit `/career-ops cover-letter` command.

**Architecture:** Three-layer extension that mirrors the existing `pdf` mode:
1. **Mode layer** (`modes/cover-letter.md`) — natural-language instructions the agent reads to know *what* to write and *how* to invoke the script.
2. **Template layer** (`templates/cover-letter-template.html`) — single-page HTML template with `{{...}}` placeholders, sharing the CV's fonts/colors/header styles for visual consistency.
3. **Script layer** (`generate-cover-letter.mjs`) — thin Node.js wrapper that fills the template from a JSON content file and shells out to the existing `generate-pdf.mjs` (no changes needed there). The script's `selectJdQuotesAndProofs()` function is left as a TODO for the user to implement (Learning Mode contribution).

The mode is wired into routing (`SKILL.md` + `_shared.md` + `auto-pipeline.md`) so that auto-pipeline triggers it automatically at score ≥ 4.5 alongside the existing Section G logic.

**Tech Stack:** Node.js (ESM), Playwright (via existing `generate-pdf.mjs`), Markdown mode files, HTML/CSS template.

---

## Context for the Implementing Engineer

**You are about to extend an AI-driven job search tool called career-ops.** Read these files first to understand the conventions you must follow:

| File | Why you need it |
|------|-----------------|
| `CLAUDE.md` (project root) | Contains the data contract rule: user-layer files (cv.md, profile.yml, _profile.md) NEVER auto-updated, system-layer files OK to modify. Cover letter files go in **system layer**. |
| `DATA_CONTRACT.md` | Confirms which files are system vs user layer. |
| `modes/_shared.md` | Has line 75: `**Cover letter:** If the form allows it, ALWAYS include one. Same visual design as CV. JD quotes mapped to proof points. 1 page max.` This is the rule we are implementing. |
| `modes/pdf.md` | The reference mode this plan parallels. Read it end-to-end to understand mode file structure, placeholder syntax, ATS rules, post-generation steps. |
| `generate-pdf.mjs` | The PDF renderer you will reuse unchanged. Read `normalizeTextForATS` (lines 30-71) and the args parser (lines 73-100). It accepts any HTML — that's why we don't modify it. |
| `templates/cv-template.html` | Shows the design language: Space Grotesk + DM Sans, gradient header, cyan/purple accents. The cover letter template MUST share fonts and gradient header for visual consistency. |
| `modes/auto-pipeline.md` lines 28-62 | Defines the "I'm choosing you" tone (decision Y in user's brainstorm). The cover letter prose MUST follow this exact tone. |
| `config/profile.yml` | Has `candidate.full_name`, `email`, `linkedin`, `proof_points[]`. The script will read these. |
| `cv.md` | Source of truth for skills and project bullets. |

**Hard rules you cannot break (from `_shared.md` and `CLAUDE.md`):**

1. **NEVER edit user-layer files** (`cv.md`, `config/profile.yml`, `modes/_profile.md`, `data/applications.md` for new rows). Cover letter files all go in system layer.
2. **ATS compatibility** — let `generate-pdf.mjs` handle Unicode normalization. Don't reinvent it.
3. **Tone discipline** — avoid clichés listed in `_shared.md` lines 113-121: "passionate about", "results-oriented", "leveraged", "spearheaded", "facilitated", "synergies", "robust", "seamless", "cutting-edge", "innovative", "demonstrated ability to".
4. **Single page max** — 4 paragraphs, ~250-350 words total. Enforce in template CSS via `max-height` + `overflow: hidden` as a safety net.
5. **Frequent commits** — one commit per task. Conventional commit format (`feat:`, `docs:`, etc.).

**The user's stack reality:** This project has NO unit test framework (no jest/vitest in `package.json`). The existing `test-all.mjs` is a smoke test runner that auto-discovers `*.mjs` files via `node --check` (line 48-56). Don't introduce a unit test framework — use end-to-end smoke tests that produce a real PDF and verify file existence + size, matching the project's style.

---

## Decisions Already Made (do NOT relitigate)

Captured during brainstorming with the user. These are locked:

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Output format** | PDF (full pipeline) | User wants visual parity with CV; `_shared.md` line 75 says "Same visual design as CV". |
| **Trigger** | Option D = auto-pipeline at score ≥ 4.5 + explicit command | Aligns with existing Section G threshold. Both invocation paths supported. |
| **Tone/structure** | Style Y = "I'm choosing you" 4-paragraph | Reuses tone already defined in `auto-pipeline.md` lines 44-60. Consistent with form-answer voice. |
| **Quote-selection algorithm** | User implements `selectJdQuotesAndProofs()` themselves | Learning Mode contribution. Function signature, JSDoc, and TODO marker provided in script. |

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│  User says: /career-ops cover-letter                            │
│        OR: pastes JD → auto-pipeline → score ≥ 4.5 → triggers   │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│  Agent reads modes/cover-letter.md                              │
│  Steps:                                                          │
│   1. Read JD text + cv.md + profile.yml + _profile.md           │
│   2. Detect archetype (per _shared.md)                          │
│   3. Compose 4-paragraph prose using "I'm choosing you" tone    │
│   4. Build content JSON: {paragraphs[], company, role, archetype}│
│   5. Write JSON to /tmp/cover-letter-{slug}.json                │
│   6. Run: node generate-cover-letter.mjs {json} {output.pdf}    │
│   7. Append "## H) Cover Letter" section to report .md          │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│  generate-cover-letter.mjs                                      │
│   1. Read JSON content file                                     │
│   2. Read cover-letter-template.html                            │
│   3. Substitute {{...}} placeholders                            │
│   4. Write filled HTML to /tmp/cover-letter-{slug}.html         │
│   5. spawnSync('node', ['generate-pdf.mjs', html, pdf])         │
│   6. Print: ✅ PDF: {path} | size: {kb} KB | pages: {n}         │
│                                                                  │
│   ★ Contains TODO: selectJdQuotesAndProofs() — user implements  │
└─────────────────────────────────────────────────────────────────┘
```

**Key insight: `generate-pdf.mjs` is NOT modified.** It already accepts any HTML input and does font injection + ATS normalization. This is the open/closed principle in action — extend by composition, not modification.

---

## File Inventory (Everything This Plan Creates or Modifies)

### Created (5 new files)

| Path | Purpose | Layer |
|------|---------|-------|
| `modes/cover-letter.md` | Agent instructions for what to write | System |
| `templates/cover-letter-template.html` | Visual template with `{{...}}` placeholders | System |
| `generate-cover-letter.mjs` | Node script: JSON+template → HTML → PDF | System |
| `examples/sample-cover-letter.json` | Example content JSON for smoke testing | System |
| `docs/plans/2026-04-09-cover-letter-generation.md` | This plan (already exists by the time you read this) | System |

### Modified (4 existing files)

| Path | What changes |
|------|--------------|
| `.claude/skills/career-ops/SKILL.md` | Add `cover-letter` row to mode routing table; add to discovery menu; add to context-loading section |
| `modes/auto-pipeline.md` | Add "Paso 4b — Generate Cover Letter (si score ≥ 4.5)" between Paso 4 and Paso 5 |
| `package.json` | Add `"cover-letter": "node generate-cover-letter.mjs"` to scripts |
| `README.md` | Add `cover-letter` row to the feature table and modes list |

### NOT modified (verify after implementation)

| Path | Why it should NOT change |
|------|--------------------------|
| `generate-pdf.mjs` | We compose, not modify. Verify zero diff. |
| `cv.md`, `config/profile.yml`, `modes/_profile.md` | User layer. Verify zero diff. |
| `templates/cv-template.html` | Visual reference only. Verify zero diff. |
| `modes/_shared.md` | Already has the rule (line 75). No edit needed. |

---

## Pre-flight Checks (before Task 1)

Run these commands first. If any fails, stop and investigate before starting.

```bash
cd "$(git rev-parse --show-toplevel)"  # Run from career-ops project root

# Check 1: We're on a clean branch
git status                                  # Expected: clean working tree (or only the plan file)

# Check 2: Node and Playwright work
node --version                              # Expected: v18+
node generate-pdf.mjs 2>&1 | head -1        # Expected: "Usage: node generate-pdf.mjs..."

# Check 3: The CV template renders cleanly (sanity baseline)
ls templates/cv-template.html && wc -l templates/cv-template.html
                                            # Expected: 416 lines

# Check 4: test-all suite passes BEFORE we touch anything
node test-all.mjs --quick 2>&1 | tail -5    # Expected: failed=0
```

If `test-all.mjs --quick` fails on baseline, **fix the failure first** — don't add new code on top of broken baseline.

---

## Task 1: Create the HTML template

**Why this task is first:** The template defines the placeholder names that everything else depends on. Lock the contract first, then build script + mode against it.

**Files:**
- Create: `templates/cover-letter-template.html`

**Step 1: Write the template**

Create the file with this exact content. Pay attention to: (a) it shares the gradient header from `cv-template.html` for visual consistency, (b) `max-height: 9.5in` + `overflow: hidden` is a safety net to enforce single-page, (c) all placeholders use `{{UPPERCASE_SNAKE}}`.

```html
<!DOCTYPE html>
<html lang="{{LANG}}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{{NAME}} — Cover Letter — {{COMPANY}}</title>
<style>
  @font-face {
    font-family: 'Space Grotesk';
    src: url('./fonts/space-grotesk-latin.woff2') format('woff2');
    font-weight: 300 700;
    font-style: normal;
    font-display: swap;
  }
  @font-face {
    font-family: 'DM Sans';
    src: url('./fonts/dm-sans-latin.woff2') format('woff2');
    font-weight: 100 1000;
    font-style: normal;
    font-display: swap;
  }

  * { margin: 0; padding: 0; box-sizing: border-box; }

  html {
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  body {
    font-family: 'DM Sans', sans-serif;
    font-size: 11.5px;
    line-height: 1.65;
    color: #1a1a2e;
    background: #ffffff;
  }

  .page {
    width: 100%;
    max-width: {{PAGE_WIDTH}};
    max-height: 9.5in;
    overflow: hidden;
    margin: 0 auto;
    padding: 2px 0;
  }

  /* === HEADER (matches CV visual identity) === */
  .header { margin-bottom: 22px; }

  .header h1 {
    font-family: 'Space Grotesk', sans-serif;
    font-size: 26px;
    font-weight: 700;
    color: #1a1a2e;
    letter-spacing: -0.02em;
    margin-bottom: 6px;
    line-height: 1.1;
  }

  .header-gradient {
    height: 2px;
    background: linear-gradient(to right, hsl(187, 74%, 32%), hsl(270, 70%, 45%));
    border-radius: 1px;
    margin-bottom: 10px;
  }

  .contact-row {
    display: flex;
    flex-wrap: wrap;
    gap: 8px 14px;
    font-size: 10.5px;
    line-height: 1.4;
    color: #555;
  }

  .contact-row a { color: #555; text-decoration: none; }
  .contact-row .separator { color: #ccc; }

  /* === LETTER META === */
  .letter-meta {
    margin-bottom: 18px;
    font-size: 11px;
    color: #555;
  }

  .letter-meta .recipient {
    font-weight: 600;
    color: #333;
    margin-bottom: 2px;
  }

  /* === SALUTATION === */
  .salutation {
    font-size: 11.5px;
    margin-bottom: 14px;
    color: #1a1a2e;
  }

  /* === BODY PARAGRAPHS === */
  .letter-body p {
    margin-bottom: 12px;
    text-align: left;
    color: #2f2f2f;
  }

  .letter-body p:last-child { margin-bottom: 16px; }

  /* === SIGN-OFF === */
  .sign-off {
    margin-top: 14px;
  }

  .sign-off .closing {
    margin-bottom: 18px;
    color: #1a1a2e;
  }

  .sign-off .signature-name {
    font-family: 'Space Grotesk', sans-serif;
    font-size: 13px;
    font-weight: 600;
    color: hsl(270, 70%, 45%);
  }

  /* Links should not break across lines */
  a { white-space: nowrap; }

  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .page { padding: 0; }
  }
</style>
</head>
<body>
<div class="page">

  <!-- HEADER -->
  <div class="header">
    <h1>{{NAME}}</h1>
    <div class="header-gradient"></div>
    <div class="contact-row">
      <span>{{EMAIL}}</span>
      <span class="separator">|</span>
      <a href="{{LINKEDIN_URL}}">{{LINKEDIN_DISPLAY}}</a>
      <span class="separator">|</span>
      <span>{{LOCATION}}</span>
    </div>
  </div>

  <!-- LETTER META -->
  <div class="letter-meta">
    <div class="recipient">{{COMPANY}}</div>
    <div>{{ROLE}}</div>
    <div>{{DATE}}</div>
  </div>

  <!-- SALUTATION -->
  <div class="salutation">{{SALUTATION}}</div>

  <!-- BODY (4 paragraphs from JSON) -->
  <div class="letter-body">
    {{PARAGRAPHS_HTML}}
  </div>

  <!-- SIGN-OFF -->
  <div class="sign-off">
    <div class="closing">{{CLOSING}}</div>
    <div class="signature-name">{{NAME}}</div>
  </div>

</div>
</body>
</html>
```

**Step 2: Verify the file exists and has the expected size**

Run:
```bash
wc -l templates/cover-letter-template.html
ls -la templates/cover-letter-template.html
```

Expected: ~170 lines, ~5-7 KB.

**Step 3: Smoke test — render the template raw to ensure no HTML errors**

This catches typos before we add the script layer. Use the existing `generate-pdf.mjs` directly with placeholder text just to confirm Playwright can parse it.

```bash
# Make a copy with placeholders replaced by literal strings
sed -e 's|{{LANG}}|en|g' \
    -e 's|{{PAGE_WIDTH}}|8.5in|g' \
    -e 's|{{NAME}}|Test Name|g' \
    -e 's|{{EMAIL}}|test@example.com|g' \
    -e 's|{{LINKEDIN_URL}}|https://linkedin.com/in/test|g' \
    -e 's|{{LINKEDIN_DISPLAY}}|linkedin.com/in/test|g' \
    -e 's|{{LOCATION}}|Test City|g' \
    -e 's|{{COMPANY}}|Test Co|g' \
    -e 's|{{ROLE}}|Test Role|g' \
    -e 's|{{DATE}}|2026-04-09|g' \
    -e 's|{{SALUTATION}}|Dear hiring team,|g' \
    -e 's|{{PARAGRAPHS_HTML}}|<p>Para 1.</p><p>Para 2.</p><p>Para 3.</p><p>Para 4.</p>|g' \
    -e 's|{{CLOSING}}|Best,|g' \
    templates/cover-letter-template.html > /tmp/cover-letter-smoke.html

node generate-pdf.mjs /tmp/cover-letter-smoke.html /tmp/cover-letter-smoke.pdf --format=letter
```

Expected output ends with:
```
✅ PDF generated: /tmp/cover-letter-smoke.pdf
📊 Pages: 1
📦 Size: ~30-60 KB
```

**Critical:** `Pages: 1`. If it's 2+, the template's spacing is wrong — fix the CSS before continuing. If `Pages: 1` is reported, delete `/tmp/cover-letter-smoke.{html,pdf}`.

**Step 4: Commit**

```bash
git add templates/cover-letter-template.html
git commit -m "feat: add cover letter HTML template

Single-page A4/Letter template that mirrors CV visual identity
(Space Grotesk + DM Sans, gradient header, cyan/purple accents).
Uses {{...}} placeholders matching the existing pdf.md convention.
Includes max-height + overflow safety net for single-page enforcement."
```

---

## Task 2: Create the example content JSON (smoke fixture)

**Why before the script:** The script reads JSON. Having a known-good fixture lets us write the script as a simple file-reader and verify it end-to-end without depending on agent reasoning.

**Files:**
- Create: `examples/sample-cover-letter.json`

**Step 1: Write the example JSON**

```json
{
  "lang": "en",
  "page_width": "8.5in",
  "format": "letter",
  "candidate": {
    "name": "Jane Doe",
    "email": "jane@example.com",
    "linkedin_url": "https://www.linkedin.com/in/jane-doe-12345",
    "linkedin_display": "linkedin.com/in/jane-doe-12345",
    "location": "San Francisco, CA"
  },
  "letter": {
    "company": "Acme AI",
    "role": "Full-Stack AI Engineer",
    "date": "2026-04-09",
    "salutation": "Dear Acme AI hiring team,",
    "closing": "Best,",
    "paragraphs": [
      "I've spent the past year building production AI agent systems on a stack that looks a lot like yours — TypeScript, Postgres + pgvector, BullMQ, and Vercel AI SDK. Your role is where I want to apply that experience next.",
      "Your job description mentions building reliable retrieval pipelines with hybrid dense and sparse search. That maps directly to RetrievalLab, the open-source retrieval platform I built: a configurable multi-stage RAG stack with Reciprocal Rank Fusion and metadata-aware filtering, sustaining sub-300ms retrieval latency over a 50k-document corpus. Code at github.com/jane-doe/retrieval-lab.",
      "What makes me a fit beyond the stack match is the engineering judgment I bring around AI tool orchestration: I designed a broker-agnostic execution layer with a three-phase stage/commit/execute lifecycle backed by atomic Redis Lua transitions, exactly the kind of reliability work your platform team is hiring for.",
      "I'm being intentional about where I apply. Acme AI is on the short list because of the public work your team has shipped on retrieval observability. Happy to walk through the RetrievalLab architecture in a call."
    ]
  }
}
```

**Step 2: Validate the JSON**

```bash
node -e "console.log(JSON.parse(require('fs').readFileSync('examples/sample-cover-letter.json','utf8')).letter.paragraphs.length)"
```

Expected: `4`

**Step 3: Commit**

```bash
git add examples/sample-cover-letter.json
git commit -m "docs: add sample cover letter content fixture

Example JSON used by generate-cover-letter.mjs for smoke testing
and as a reference shape for agents producing cover letter content."
```

---

## Task 3: Create `generate-cover-letter.mjs` — the script

**Why this task third:** With template + fixture in place, we can build the script and do a full end-to-end smoke test. The script is intentionally thin: it composes existing pieces rather than reinventing PDF rendering.

**Files:**
- Create: `generate-cover-letter.mjs`

**Step 1: Write the failing test (smoke)**

We have no test framework. The "test" is: run the script on the fixture and check that a PDF lands in the expected place. Add this to a temporary shell script first to formalize the expectation:

```bash
cat > /tmp/cover-letter-smoke-test.sh << 'EOF'
#!/bin/bash
set -e
rm -f /tmp/test-cover-letter.pdf
node generate-cover-letter.mjs examples/sample-cover-letter.json /tmp/test-cover-letter.pdf
test -f /tmp/test-cover-letter.pdf || { echo "FAIL: PDF not created"; exit 1; }
SIZE=$(stat -f%z /tmp/test-cover-letter.pdf 2>/dev/null || stat -c%s /tmp/test-cover-letter.pdf)
test "$SIZE" -gt 5000 || { echo "FAIL: PDF too small ($SIZE bytes)"; exit 1; }
echo "PASS: PDF generated ($SIZE bytes)"
EOF
chmod +x /tmp/cover-letter-smoke-test.sh
```

**Step 2: Run the test to verify it FAILS (no script yet)**

```bash
bash /tmp/cover-letter-smoke-test.sh
```

Expected: error like `Cannot find module ... generate-cover-letter.mjs` or `node: command failed`. This confirms the test is wired to detect the missing implementation.

**Step 3: Write the script**

Create `generate-cover-letter.mjs` with this exact content. Read every comment — the `selectJdQuotesAndProofs` function is the user's contribution point and is intentionally a stub.

```javascript
#!/usr/bin/env node

/**
 * generate-cover-letter.mjs — Cover letter content JSON → HTML → PDF
 *
 * Thin composition layer over generate-pdf.mjs. Reads a JSON content file
 * (produced by the agent following modes/cover-letter.md), substitutes it
 * into templates/cover-letter-template.html, then shells out to the existing
 * generate-pdf.mjs renderer for ATS normalization and Playwright PDF output.
 *
 * Usage:
 *   node generate-cover-letter.mjs <content.json> <output.pdf> [--format=letter|a4]
 *
 * The JSON shape is documented in examples/sample-cover-letter.json.
 *
 * Why this script exists:
 *   - The cover letter mode (modes/cover-letter.md) tells the agent WHAT to write.
 *   - This script handles the deterministic plumbing (template fill + invoke renderer)
 *     so the agent does not have to deal with file I/O or HTML escaping.
 *   - generate-pdf.mjs is reused unchanged — open/closed principle.
 */

import { readFile, writeFile } from 'fs/promises';
import { resolve, dirname, basename } from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * HTML-escape a string so it is safe to inject into the template body.
 * We only escape the four characters that matter inside <p> elements;
 * generate-pdf.mjs handles Unicode normalization separately.
 */
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Render the 4 paragraphs as <p> elements.
 * Each paragraph becomes one <p>...</p>; nothing else is wrapped.
 */
function paragraphsToHtml(paragraphs) {
  if (!Array.isArray(paragraphs) || paragraphs.length === 0) {
    throw new Error('content.letter.paragraphs must be a non-empty array');
  }
  if (paragraphs.length > 5) {
    throw new Error(`Cover letter has ${paragraphs.length} paragraphs; max is 5 for single-page constraint`);
  }
  return paragraphs.map(p => `<p>${escapeHtml(p)}</p>`).join('\n    ');
}

/**
 * ★ USER CONTRIBUTION POINT — Learning Mode TODO
 *
 * Select 1-3 quotes from the JD text and pair each with the strongest
 * matching proof point from profile.yml. This function defines the
 * "personality" of the cover letter — what the agent emphasizes.
 *
 * The function is OPTIONAL — the script works without it. The agent in
 * modes/cover-letter.md does the actual prose generation. This function
 * is here as a deterministic helper if you (the user) want to encode
 * a specific selection strategy that overrides agent improvisation.
 *
 * Decisions you must make if you implement it:
 *   1. Which JD sentences are worth quoting?
 *      - longest responsibility bullet?
 *      - sentences containing archetype keywords?
 *      - sentences marked "required" or "must have"?
 *   2. How to score proof point match?
 *      - keyword overlap count?
 *      - hardcoded preference order?
 *      - delegated to LLM?
 *   3. How many quotes is right?
 *      - 1 strong vs 3 medium?
 *      - adaptive based on JD length?
 *
 * @param {string} jdText - Full job description text
 * @param {Array<{name: string, url: string, hero_metric: string}>} proofPoints - From profile.yml
 * @returns {Array<{quote: string, proof: object, why: string}>}
 *
 * Default implementation: returns empty array (script falls back to using
 * paragraphs as-is from the JSON). The agent calling this script should
 * have already incorporated quote selection during prose generation.
 */
// eslint-disable-next-line no-unused-vars
function selectJdQuotesAndProofs(jdText, proofPoints) {
  // TODO (user): implement your quote-selection strategy here.
  // See JSDoc above for the design questions to answer.
  return [];
}

/**
 * Substitute {{PLACEHOLDER}} tokens in the template with values from content.
 * Mirrors the convention in modes/pdf.md (placeholder table).
 */
function fillTemplate(template, content) {
  const c = content.candidate;
  const l = content.letter;

  const replacements = {
    LANG: content.lang || 'en',
    PAGE_WIDTH: content.page_width || '8.5in',
    NAME: escapeHtml(c.name),
    EMAIL: escapeHtml(c.email),
    LINKEDIN_URL: escapeHtml(c.linkedin_url),
    LINKEDIN_DISPLAY: escapeHtml(c.linkedin_display),
    LOCATION: escapeHtml(c.location),
    COMPANY: escapeHtml(l.company),
    ROLE: escapeHtml(l.role),
    DATE: escapeHtml(l.date),
    SALUTATION: escapeHtml(l.salutation),
    CLOSING: escapeHtml(l.closing),
    PARAGRAPHS_HTML: paragraphsToHtml(l.paragraphs),
  };

  let out = template;
  for (const [key, value] of Object.entries(replacements)) {
    out = out.split(`{{${key}}}`).join(value);
  }

  // Sanity check: any unreplaced placeholders are a bug
  const leftover = out.match(/\{\{[A-Z_]+\}\}/g);
  if (leftover) {
    throw new Error(`Unreplaced placeholders in template: ${leftover.join(', ')}`);
  }

  return out;
}

async function main() {
  const args = process.argv.slice(2);
  let inputJson, outputPdf, format = 'letter';

  for (const arg of args) {
    if (arg.startsWith('--format=')) {
      format = arg.split('=')[1].toLowerCase();
    } else if (!inputJson) {
      inputJson = arg;
    } else if (!outputPdf) {
      outputPdf = arg;
    }
  }

  if (!inputJson || !outputPdf) {
    console.error('Usage: node generate-cover-letter.mjs <content.json> <output.pdf> [--format=letter|a4]');
    process.exit(1);
  }

  inputJson = resolve(inputJson);
  outputPdf = resolve(outputPdf);

  console.log(`📄 Content: ${inputJson}`);
  console.log(`📁 Output:  ${outputPdf}`);
  console.log(`📏 Format:  ${format.toUpperCase()}`);

  // Read content + template
  const content = JSON.parse(await readFile(inputJson, 'utf-8'));
  const templatePath = resolve(__dirname, 'templates/cover-letter-template.html');
  const template = await readFile(templatePath, 'utf-8');

  // Override page_width based on format flag if not set in JSON
  if (!content.page_width) {
    content.page_width = format === 'a4' ? '210mm' : '8.5in';
  }

  // Fill template
  const filled = fillTemplate(template, content);

  // Write filled HTML to /tmp
  const slug = (content.letter.company || 'unknown').toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const tmpHtml = `/tmp/cover-letter-${slug}.html`;
  await writeFile(tmpHtml, filled);
  console.log(`📝 Filled HTML: ${tmpHtml}`);

  // Shell out to generate-pdf.mjs (reuse, do not reinvent)
  const renderer = resolve(__dirname, 'generate-pdf.mjs');
  const result = spawnSync('node', [renderer, tmpHtml, outputPdf, `--format=${format}`], {
    stdio: 'inherit',
  });

  if (result.status !== 0) {
    console.error(`❌ generate-pdf.mjs exited with status ${result.status}`);
    process.exit(result.status || 1);
  }

  console.log(`✅ Cover letter ready: ${outputPdf}`);
}

main().catch((err) => {
  console.error('❌ Cover letter generation failed:', err.message);
  process.exit(1);
});
```

**Step 4: Run the smoke test to verify it PASSES**

```bash
bash /tmp/cover-letter-smoke-test.sh
```

Expected output:
```
📄 Content: ...examples/sample-cover-letter.json
📁 Output:  /tmp/test-cover-letter.pdf
📏 Format:  LETTER
📝 Filled HTML: /tmp/cover-letter-acme-ai.html
📄 Input:  ...
📁 Output: /tmp/test-cover-letter.pdf
...
✅ PDF generated: /tmp/test-cover-letter.pdf
📊 Pages: 1
📦 Size: ~40-80 KB
✅ Cover letter ready: /tmp/test-cover-letter.pdf
PASS: PDF generated (XXXXX bytes)
```

**Critical checks:**
- `Pages: 1` — if 2+, template overflows. Reduce paragraph length in fixture OR tighten template CSS.
- `Size > 5000 bytes` — confirms PDF is real, not a 0-byte stub.

**Step 5: Run `test-all.mjs --quick` to confirm we didn't break the project**

```bash
node test-all.mjs --quick 2>&1 | tail -10
```

Expected: `failed: 0`. The new `.mjs` file should be auto-discovered by line 48 of `test-all.mjs` and pass `node --check`.

**Step 6: Verify `generate-pdf.mjs` was NOT modified**

```bash
git diff generate-pdf.mjs
```

Expected: empty (no changes). This is the open/closed verification.

**Step 7: Commit**

```bash
git add generate-cover-letter.mjs
git commit -m "feat: add generate-cover-letter.mjs script

Thin composition layer over generate-pdf.mjs that fills the cover
letter template from a JSON content file. Reuses the existing PDF
renderer unchanged. Includes a TODO stub for selectJdQuotesAndProofs
as a Learning Mode contribution point for the user."
```

---

## Task 4: Create `modes/cover-letter.md` — agent instructions

**Why this task fourth:** The script and template work. Now teach the agent how to produce the JSON that feeds the script.

**Files:**
- Create: `modes/cover-letter.md`

**Step 1: Write the mode file**

```markdown
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

## Tone Rules (from auto-pipeline.md)

**Position: "I'm choosing you."** The candidate has options and is choosing this company for concrete reasons.

- **Confident, not arrogant**
- **Selective, not haughty**
- **Specific and concrete** — always reference something REAL from JD AND something REAL from CV
- **Direct, no fluff** — see `_shared.md` clichés to avoid (lines 113-121)
- **The hook is the proof, not the claim** — "I built X that does Y" beats "I'm great at X"

**Hard bans (from `_shared.md`):**
- "passionate about" / "results-oriented" / "proven track record"
- "leveraged" → use "used" or name the tool
- "spearheaded" → use "led" or "ran"
- "facilitated" → use "ran" or "set up"
- "synergies" / "robust" / "seamless" / "cutting-edge" / "innovative"
- "demonstrated ability to" / "best practices" (name the practice)

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

The agent must produce a JSON file matching `examples/sample-cover-letter.json`:

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

**Language rule:** Same language as the JD (EN default). For German JDs, use `modes/de/` translations and salutation "Sehr geehrtes Team von {Company},".

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
| `Unreplaced placeholders` error | JSON missing a required field. Check shape against `examples/sample-cover-letter.json`. |
| `generate-pdf.mjs` not found | Run from project root, not from `modes/`. |
| Cliché word warning | The user's `_shared.md` flagged a banned word. Rewrite. |
```

**Step 2: Verify the file is well-formed Markdown**

```bash
wc -l modes/cover-letter.md
head -3 modes/cover-letter.md
```

Expected: ~140 lines, starts with `# Modo: cover-letter`.

**Step 3: Commit**

```bash
git add modes/cover-letter.md
git commit -m "feat: add cover-letter mode instructions for the agent

Defines the workflow, structure (4 paragraphs), tone rules, and JSON
shape the agent must produce. Tone follows the 'I'm choosing you'
framework already established in auto-pipeline.md. References
_shared.md cliché bans and the existing pdf.md placeholder convention."
```

---

## Task 5: Wire `cover-letter` into the SKILL.md routing table

**Files:**
- Modify: `.claude/skills/career-ops/SKILL.md`

**Step 1: Read the file to find the exact insertion points**

```bash
cat .claude/skills/career-ops/SKILL.md
```

Identify three insertion points:
1. The mode routing table (around line 14-32) — add a `cover-letter` row
2. The discovery menu (around line 43-64) — add a line for the new command
3. The argument-hint frontmatter (line 6) — add `cover-letter` to the hint
4. The "Modes that require `_shared.md`" list (line 75) — add `cover-letter`

**Step 2: Edit the routing table**

Find the row `| `patterns` | `patterns` |` and add a new row immediately after:

Old:
```markdown
| `patterns` | `patterns` |
```

New:
```markdown
| `patterns` | `patterns` |
| `cover-letter` / `cover` / `cl` | `cover-letter` |
```

The three aliases (`cover-letter`, `cover`, `cl`) match what users actually type.

**Step 3: Edit the discovery menu**

Find the line `  /career-ops patterns  → Analyze rejection patterns and improve targeting` and add immediately after:

Old:
```
  /career-ops patterns  → Analyze rejection patterns and improve targeting
```

New:
```
  /career-ops patterns  → Analyze rejection patterns and improve targeting
  /career-ops cover-letter → Generate single-page cover letter PDF (matches CV design)
```

**Step 4: Edit the argument-hint frontmatter**

Find line 6:
```yaml
argument-hint: "[scan | deep | pdf | oferta | ofertas | apply | batch | tracker | pipeline | contacto | training | project | interview-prep | update]"
```

Replace with:
```yaml
argument-hint: "[scan | deep | pdf | cover-letter | oferta | ofertas | apply | batch | tracker | pipeline | contacto | training | project | interview-prep | update]"
```

**Step 5: Edit the context-loading section**

Find the line:
```
Applies to: `auto-pipeline`, `oferta`, `ofertas`, `pdf`, `contacto`, `apply`, `pipeline`, `scan`, `batch`
```

Replace with:
```
Applies to: `auto-pipeline`, `oferta`, `ofertas`, `pdf`, `cover-letter`, `contacto`, `apply`, `pipeline`, `scan`, `batch`
```

This tells the router that `cover-letter` mode requires loading `modes/_shared.md` first (for the cliché ban list and tone rules).

**Step 6: Verify all four edits are present**

```bash
grep -n "cover-letter\|cover.*cl" .claude/skills/career-ops/SKILL.md
```

Expected: 4 matches (frontmatter, routing table, discovery menu, context-loading).

**Step 7: Commit**

```bash
git add .claude/skills/career-ops/SKILL.md
git commit -m "feat: route cover-letter command in career-ops SKILL.md

Adds 'cover-letter' (with 'cover' and 'cl' aliases) to the mode
routing table, discovery menu, argument hint, and context-loading
list (so _shared.md gets loaded for tone/cliché rules)."
```

---

## Task 6: Wire cover letter into auto-pipeline at score ≥ 4.5

**Files:**
- Modify: `modes/auto-pipeline.md`

**Step 1: Read the file to find the exact insertion point**

```bash
sed -n '60,70p' modes/auto-pipeline.md
```

Identify line 64-65 — `## Paso 5 — Actualizar Tracker`. We will insert a new "Paso 4b" between Paso 4 and Paso 5.

**Step 2: Insert the new section**

Find this exact text:

```markdown
**Idioma**: Siempre en el idioma del JD (EN default). Aplicar `/tech-translate`.

## Paso 5 — Actualizar Tracker
```

Replace with:

```markdown
**Idioma**: Siempre en el idioma del JD (EN default). Aplicar `/tech-translate`.

## Paso 4b — Generate Cover Letter (solo si score >= 4.5)

Si el score final es >= 4.5, generar también un cover letter PDF de 1 página.

**Workflow:**
1. Cargar `modes/cover-letter.md` (ya con `_shared.md` cargado)
2. Seguir el workflow definido ahí (LOAD → DETECT → SELECT → MAP → COMPOSE → BUILD JSON → RUN SCRIPT → APPEND → VERIFY)
3. Output: `output/cover-letter-{candidate-slug}-{company-slug}-{YYYY-MM-DD}.pdf`
4. Append `## H) Cover Letter` section to the report .md (path + plain-text fallback + JD quotes used)
5. Si la generación falla, continuar con Paso 5 y marcar `cover_letter: pending` en las notas del tracker

**Cuándo NO generar (override del trigger ≥4.5):**
- JD dice explícitamente "no cover letter accepted"
- Score >= 4.5 pero el formulario no tiene campo de cover letter Y tampoco un campo de free-text donde pegarlo

## Paso 5 — Actualizar Tracker
```

**Step 3: Verify the edit is in place**

```bash
grep -n "Paso 4b" modes/auto-pipeline.md
```

Expected: one match.

```bash
grep -n "Paso 5" modes/auto-pipeline.md
```

Expected: one match (the original Paso 5, now appearing after our new Paso 4b).

**Step 4: Commit**

```bash
git add modes/auto-pipeline.md
git commit -m "feat: trigger cover-letter generation in auto-pipeline at score >=4.5

Adds Paso 4b between Paso 4 (Section G draft answers) and Paso 5
(tracker update). Cover letter only generates when score >= 4.5,
matching the existing Section G threshold. Failure is non-fatal —
pipeline continues and marks 'cover_letter: pending' in tracker notes."
```

---

## Task 7: Add `cover-letter` script to `package.json`

**Files:**
- Modify: `package.json`

**Step 1: Read the current scripts block**

```bash
sed -n '5,17p' package.json
```

**Step 2: Add the new script entry**

Find the line:
```json
    "liveness": "node check-liveness.mjs"
```

Replace with:
```json
    "liveness": "node check-liveness.mjs",
    "cover-letter": "node generate-cover-letter.mjs"
```

(Note the comma added to `liveness` and the new line.)

**Step 3: Verify JSON validity**

```bash
node -e "JSON.parse(require('fs').readFileSync('package.json','utf8')); console.log('valid')"
```

Expected: `valid`

```bash
bun run cover-letter 2>&1 | head -3
```

Expected: `Usage: node generate-cover-letter.mjs <content.json> <output.pdf> ...` (the script's own usage message — confirms it's wired but rejects empty args).

**Step 4: Commit**

```bash
git add package.json
git commit -m "chore: add cover-letter package script

Lets users run 'bun run cover-letter -- input.json output.pdf'
as a more discoverable alias for the underlying node command."
```

---

## Task 8: Update README.md to advertise the feature

**Files:**
- Modify: `README.md`

**Step 1: Find the features table**

```bash
sed -n '60,75p' README.md
```

You'll see a table starting with `| Feature | Description |`. Add a new row.

**Step 2: Insert the feature row**

Find this row in the features table:

```markdown
| **Negotiation Scripts** | Salary negotiation frameworks, geographic discount pushback, competing offer leverage |
```

Insert immediately after:

```markdown
| **Cover Letter PDF** | Single-page cover letter PDF that matches CV design, auto-generated for offers scoring ≥ 4.5 (or on-demand via `/career-ops cover-letter`) |
```

**Step 3: Find the usage commands list**

```bash
sed -n '110,130p' README.md
```

You'll see a code block with `/career-ops` commands.

**Step 4: Add the cover-letter command**

Find this line:

```
/career-ops pdf            → Generate ATS-optimized CV
```

Insert immediately after:

```
/career-ops cover-letter   → Generate single-page cover letter PDF
```

**Step 5: Verify**

```bash
grep -n "cover.letter\|Cover Letter" README.md
```

Expected: 2 matches (table row + command list).

**Step 6: Commit**

```bash
git add README.md
git commit -m "docs: document cover letter feature in README

Adds the feature table row and usage command. Mentions that the
cover letter PDF auto-generates for high-fit offers (>=4.5) and is
available on-demand via /career-ops cover-letter."
```

---

## Task 9: End-to-end verification

**Why a final dedicated task:** Multiple files are now wired together. We need one explicit pass that confirms the entire chain works as a system, not just as isolated parts.

**Files:** none (verification only)

**Step 1: Run the full smoke test from a clean state**

```bash
cd "$(git rev-parse --show-toplevel)"  # Run from career-ops project root
rm -f /tmp/test-cover-letter.pdf /tmp/cover-letter-acme-ai.html

# Via package script
bun run cover-letter -- examples/sample-cover-letter.json /tmp/test-cover-letter.pdf
```

Expected: full output ending with `✅ Cover letter ready: /tmp/test-cover-letter.pdf` and `Pages: 1`.

**Step 2: Visually inspect the PDF**

```bash
open /tmp/test-cover-letter.pdf   # macOS
```

Manual check:
- [ ] Single page
- [ ] Header has the gradient line
- [ ] 4 paragraphs visible
- [ ] Name appears in purple at the bottom
- [ ] Fonts loaded (not Times New Roman fallback)
- [ ] No `{{...}}` placeholders visible anywhere

If the PDF looks broken, **stop and fix** — do not proceed to Step 3.

**Step 3: Run the full test suite**

```bash
node test-all.mjs --quick 2>&1 | tail -15
```

Expected: `failed: 0`, `warnings: 0` (or only pre-existing warnings unrelated to cover-letter files).

**Step 4: Verify zero changes to user-layer files**

```bash
git diff cv.md config/profile.yml modes/_profile.md 2>&1
```

Expected: empty output. If anything appears, **revert it immediately** — the data contract was violated.

**Step 5: Verify zero changes to `generate-pdf.mjs`**

```bash
git diff generate-pdf.mjs
```

Expected: empty.

**Step 6: Show git log of the feature**

```bash
git log --oneline -10
```

Expected: 8 commits in order (Task 1 through Task 8), all with conventional commit prefixes.

**Step 7: Test the discovery flow**

Start a new session (or simulate by reading the SKILL.md as the agent would):

```bash
grep -A1 "cover-letter\|cover.*cl" .claude/skills/career-ops/SKILL.md
```

Expected: confirms the routing entries are present in all four locations.

**Step 8: Final commit (verification only — no code changes)**

If everything passes, no commit needed. If the visual inspection in Step 2 required CSS tweaks to `cover-letter-template.html`, commit those:

```bash
git add templates/cover-letter-template.html
git commit -m "fix(cover-letter): visual tweaks from end-to-end review

[Describe what was adjusted, e.g., 'reduced paragraph margin to fit
single-page constraint when content is at the upper word budget']"
```

---

## Acceptance Criteria

The feature is complete when ALL of the following are true:

- [ ] `node generate-cover-letter.mjs examples/sample-cover-letter.json /tmp/test.pdf` produces a 1-page PDF
- [ ] `bun run cover-letter -- examples/sample-cover-letter.json /tmp/test.pdf` does the same
- [ ] `node test-all.mjs --quick` reports `failed: 0`
- [ ] `git diff generate-pdf.mjs cv.md config/profile.yml modes/_profile.md` is empty
- [ ] `grep -c "cover-letter\|Cover Letter" .claude/skills/career-ops/SKILL.md` returns ≥ 4
- [ ] `modes/auto-pipeline.md` contains exactly one `## Paso 4b` heading
- [ ] `README.md` mentions cover letter in the features table AND command list
- [ ] Visually opening the generated PDF shows: gradient header + 4 paragraphs + purple signature, no placeholder leakage
- [ ] `git log --oneline -10` shows 8 task commits with conventional prefixes

---

## Out of Scope (Do NOT do these)

These were considered and intentionally excluded. If the implementing engineer feels tempted, the answer is **no**.

| Tempted to | Why no |
|------------|--------|
| Implement `selectJdQuotesAndProofs()` properly | This is the user's Learning Mode contribution. Leave the TODO. |
| Add a unit test framework (jest/vitest) | Project has none. Smoke test via `test-all.mjs` is the project convention. |
| Modify `generate-pdf.mjs` to know about cover letters | Open/closed principle. The renderer is generic; keep it generic. |
| Translate `cover-letter.md` to German/French/Portuguese | Out of scope for v1. Add only when user asks. |
| Make cover letter generation triggerable from `modes/apply.md` | Phase 2. Apply mode already identifies cover letter form fields — wiring is more complex. |
| Auto-upload the PDF to the application form via Playwright | Violates the "never submit" rule in CLAUDE.md. The user always reviews and submits. |
| Add cover letter analytics to `analyze-patterns.mjs` | No data yet. Add when there are 10+ cover letters in `output/`. |
| Create a Canva variant of the cover letter | Phase 2. The HTML/PDF flow is the canonical path. |

---

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| Template overflows to page 2 when content is at word budget upper bound | `max-height: 9.5in` + `overflow: hidden` in CSS. Step 2 of Task 9 visually verifies. |
| Agent hallucinates project metrics not in cv.md | `_shared.md` rule "NEVER hardcode metrics from proof points. Read them from cv.md + article-digest.md at evaluation time." Mode file restates this. |
| Cliché words slip through | `_shared.md` lists banned words; mode file restates them; agent self-checks during composition. |
| User-layer files accidentally edited | Step 4 of Task 9 explicitly diffs them. Plan reminds at the top. |
| Format mismatch (a4 vs letter) for non-US companies | Mode file's "Format selection rule" mirrors `pdf.md` exactly. |
| Multilingual JDs get English cover letter | Mode file says "Language rule: same as JD". Agent must detect language before composing. |
| `generate-pdf.mjs` accidentally modified | Step 5 of Task 9 explicitly diffs it. Out-of-scope table forbids it. |

---

## Reference: How This Plan Maps to the User's Decisions

| User decision | Where in the plan |
|---------------|-------------------|
| Output = PDF | Tasks 1, 3 (template + script + reuse generate-pdf.mjs) |
| Trigger D = auto-pipeline ≥4.5 + explicit command | Task 5 (routing) + Task 6 (auto-pipeline integration) |
| Style Y = "I'm choosing you" 4-paragraph | Task 4 (mode file structure table) |
| User implements `selectJdQuotesAndProofs()` themselves | Task 3 (function stub with JSDoc TODO) |

---

## Suggested Execution Order

Tasks have implicit dependencies. Execute in this order:

```
Task 1 (template) ──► Task 2 (fixture) ──► Task 3 (script + smoke test)
                                                    │
                                                    ▼
                                            Task 4 (mode file)
                                                    │
                                                    ▼
                                            Task 5 (SKILL.md routing)
                                                    │
                                                    ▼
                                            Task 6 (auto-pipeline)
                                                    │
                                                    ▼
                                            Task 7 (package.json)
                                                    │
                                                    ▼
                                            Task 8 (README)
                                                    │
                                                    ▼
                                            Task 9 (end-to-end verify)
```

Each task ends with a commit. Total: 8 feature commits + optional 1 fix commit from Task 9 = 8-9 commits.
