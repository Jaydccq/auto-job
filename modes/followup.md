# Mode: followup — Follow-up cadence

Tracks active applications, surfaces ones that need a nudge, and drafts the
nudge message.

## What "needs follow-up" means

Pull rows from `data/applications.md` whose status is one of `Applied`,
`Responded`, or `Interview` and whose last-touch timestamp is older than the
default cadence:

| Status | Default cadence (days) | Notes |
|--------|------------------------|-------|
| Applied | 7 | First nudge to the recruiter. |
| Responded | 5 | Confirm next step or ask for a date. |
| Interview | 3 (post-interview) | Thank-you / waiting on decision. |

Cadence overrides may live in `modes/_profile.md` — read those first.

## Discovering touch dates

Last-touch is computed from the row's note column when present
(`last-touch:YYYY-MM-DD`), otherwise from the file mtime of the report.
`bun run followup` (the legacy CLI) prints structured JSON; this mode treats
that as the source of truth.

## Drafting the message

Use the `contacto` framework, but with one extra constraint: reference
something specific from the prior conversation or the report.

**Recruiter ping** (Applied, ≥ 7 days, no response):
- 1 sentence: warm callback to the role and date applied.
- 1 sentence: one new proof point (a shipped project, a metric update).
- 1 sentence: explicit ask — "is there a window this week to chat?".

**Status check** (Responded, ≥ 5 days):
- 1 sentence: thank for the prior reply.
- 1 sentence: ask about the next step or a target decision date.

**Post-interview** (Interview, ≥ 3 days):
- 1 sentence: reference one specific thing the interviewer said.
- 1 sentence: tie it to a follow-up artifact the user can offer (a note,
  a small demo, a link).
- Closing line: "Let me know if a decision date is firming up."

## Hard rules

- Maximum 90 words per message.
- No "I'm passionate about", no "circling back", no "just checking in".
- Never share the user's phone number.
- One follow-up per round. Two follow-ups is fine, three is harassment.
- After two follow-ups with no response, mark the row `Discarded` and move
  on. The user always overrides.

## After drafting

Append the draft and the date sent to the relevant `reports/*.md` under a
`## Follow-up log` section. Do **not** auto-send anything — the user
copy-pastes after review.
