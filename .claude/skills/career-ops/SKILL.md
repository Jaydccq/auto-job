---
name: career-ops
description: Local-first AI job-search runtime — evaluate offers, generate CVs, scan portals, scan Gmail signals, track applications, draft outreach. Use whenever the user pastes a JD, a posting URL, or asks for tracker / scan / followup / cover-letter / interview-prep work.
---

# career-ops skill

Routes the user's intent into the right mode under `modes/`. Always read
`modes/_shared.md` before doing anything substantive — it owns the rubric,
the report contract, and the tracker contract.

## When to invoke

Trigger on any of:

- A pasted job posting URL or JD body.
- "Evaluate this", "score this offer", "should I apply".
- "Generate a CV", "tailor the resume", "make a PDF".
- "Cover letter for {company}".
- "Scan portals", "scan LinkedIn", "scan Indeed", "scan Built In", "scan Gmail".
- "Tracker", "what's in flight", "rejection patterns".
- "Follow up on {company}", "draft a follow-up".
- "LinkedIn outreach", "DM the recruiter", "ping the hiring manager".

If none of these match, do not invoke. The skill is opinionated about its
scope and should not be used as a generic helper.

## Mode router

| User intent | Mode | Bridge endpoint (if relevant) |
|-------------|------|-------------------------------|
| Pastes JD or URL with no subcommand | `auto-pipeline` | `/v1/evaluate` |
| "Evaluate" / "score" only | `oferta` | `/v1/evaluate` |
| "Tailor my CV" / "make a PDF" | continue from `auto-pipeline` step 3 | — |
| "Cover letter" | `cover-letter` | — |
| "Scan portals" | `scan` | `/v1/scan` |
| "Scan Built In" | `builtin-scan` | `/v1/scan/builtin` |
| "Scan LinkedIn" | `linkedin-scan` | `/v1/scan/linkedin` |
| "Scan Indeed" | `indeed-scan` | `/v1/scan/indeed` |
| "Scan newgrad" | `newgrad-scan` | `/v1/scan/newgrad` |
| "Scan Gmail" | `gmail-scan` | `/v1/gmail/scan` |
| "Tracker" / "what's in flight" | read `data/applications.md` and the dashboard | — |
| "Follow up" | `followup` | — |
| "LinkedIn outreach" | `contacto` | — |
| "Interview prep for {company}" | append to `interview-prep/{company}-{role}.md` | — |

## Required reads at session start

1. `cv.md` — confirm it exists and isn't a placeholder. If missing, run the
   onboarding flow: ask the user to paste a CV or share a LinkedIn URL.
2. `config/profile.yml` — confirm name / email / location are set. If
   missing or contains "Jane Smith"-style placeholders, ask the user.
3. `modes/_profile.md` — read for archetypes, blocked companies, comp
   targets, narrative tone. If missing, prompt the user.
4. `portals.yml` — needed only for scan modes. Copy from
   `templates/portals.example.yml` if absent and the user wants to scan.

## Hard rules (override everything else)

- **Never submit, click Apply, click Next, or click Submit** on the user's
  behalf.
- **Never invent metrics or experience.**
- **Never put user-specific personalization into the owned-runtime layer.**
  See `DATA_CONTRACT.md`.
- **Never edit `data/applications.md` to add a row.** Write a TSV under
  `batch/tracker-additions/` and let `bun run merge` apply it.
- **Always include `**URL:**` in the report header** so the dashboard can
  link out.
- **Score < 3.5 → recommend SKIP.** Do not generate a PDF for sub-4.5
  scores unless the user overrides explicitly.

## Tools

| Tool | Use |
|------|-----|
| Read | `cv.md`, `_profile.md`, `article-digest.md`, prior reports, JD captures |
| Write | New reports, TSV additions, generated HTML, draft answers |
| Edit | Tracker status promotions only |
| Bash | `bun run pdf`, `bun run merge`, `bun run normalize`, `bun run verify`, `bun run liveness` |
| WebSearch | Comp data, layoffs, company news, contact discovery |
| WebFetch | Static JD pages (fallback) |
| Playwright | Live posting verification, capture, autofill (one session at a time) |

## Tone

Direct and operator-style. Short sentences, concrete numbers, no
"passionate about" / "spearheaded" / "leveraged". Match the language of the
JD; default to English. Never share the user's phone number in unsolicited
messages.
