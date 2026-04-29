# Gmail Signals

`data/gmail-signals.jsonl` is the optional dashboard input for read-only Gmail application tracking.

The file contains one JSON object per line. It should store derived hiring facts only, not raw email bodies.

Scanner rule: a signal must have real hiring context before it is written.
Bare words such as `offer`, `application`, `interview`, or `hiring` are not
enough by themselves. Valid evidence includes a personal application phrase,
interview/assessment scheduling, a job or employment offer phrase, rejection
language tied to an application, or a trusted ATS/recruiting sender. Marketing
offers, newsletters, Reddit digests, utility alerts, rent/payment notices, and
shopping mail should be ignored.

Sender policy:

- Trusted ATS senders (`*@ashbyhq.com`, `*@greenhouse.io` / `*@greenhouse-mail.io`,
  `*@hire.lever.co` / `*@lever.co`, `*@myworkday.com` / `*@workday.com`,
  `*@smartrecruiters.com`, `*@talent.icims.com`, `*@jobvite.com`) yield the
  highest-confidence company via the sender display name minus suffixes
  (`Hiring Team`, `Recruiting`, `Talent Acquisition`, `Talent Team`, `Careers`,
  `Candidate Experience`, `People Team`, `HR Team`, `Human Resources`).
- LinkedIn `*@linkedin.com` senders are restricted to `applied` or `responded`
  events only — they cannot produce `rejected`, `offer`, or `interview`
  signals because LinkedIn application-confirmation bodies frequently contain
  misleading phrasing.
- Rejection requires either a hard phrase (`not moving forward`,
  `decided not to proceed`, `position has been filled`, `not selected for`,
  `unable to move forward`, `not able to offer`) or a soft phrase
  (`unfortunately`, `not an ideal fit`, `other candidates`, `more aligned with`)
  combined with a hiring noun (`application` / `candidacy` / `interview` /
  `role` / `position`) AND no application-receipt phrase in the same body.

Recommended fields:

```json
{"id":"gmail-message-id:event","applicationNum":123,"company":"Example Co","role":"Software Engineer","eventType":"interview","eventDate":"2026-04-25","priority":"attention","summary":"Recruiter sent an interview scheduling link","recommendedAction":"Schedule interview","messageId":"...","threadId":"...","confidence":0.91}
```

`confidence` is computed from a weighted feature set: ATS-sender trust 0.30,
explicit company 0.20, explicit role 0.15, hard event phrase 0.15, weak event
phrase 0.05 (only when no hard phrase is present), explicit subject match
0.10, plus a 0.20 floor. Result is clamped to `[0, 1]` and rounded to two
decimals. Consumers may filter signals below a threshold (e.g., `>= 0.55`)
for noisier dashboards.

Stored-signal validation: legacy rows with hard event types
(`offer` / `rejected` / `interview` / `online_assessment`) are retained
without re-classifying as long as the current sender policy still permits
that event type. Rows with soft event types (`applied` / `responded` /
`action_required`) re-run through the classifier on each merge and must
still match.

Dashboard matching:

- `applicationNum` wins when present.
- Otherwise, the Tracker tab matches exact normalized `company` + `role`.
- Signals that do not match an existing tracker row are shown as Gmail-only
  application rows in the Tracker pipeline. They are display-only and do not
  mutate `data/applications.md`.
- Ambiguous new applications should stay in a review queue before they are
  routed through the canonical tracker flow.

Dashboard evidence:

- Compact rows show email count, recent contact, latest thread age, attention
  state, and updated date.
- Expanded email evidence may show sender, relative time, subject, and a short
  snippet/derived summary.
- Do not store full raw email bodies. Keep snippets short and focused on hiring
  facts needed for the tracker.

Attention signals:

- `action_required`
- `oa`
- `online_assessment`
- `interview`
- `offer`
- `responded`
- any record with `priority: "urgent"` or `priority: "attention"`
- any record with `recommendedAction`, `action`, or `dueDate`

Do not store OAuth tokens, raw mailbox exports, or full email bodies in this file.
`data/gmail-signals.jsonl` is gitignored because it contains user-specific
mailbox-derived facts.

## Applications layer

`data/gmail-applications.jsonl` is a derived per-thread aggregate of the
per-message signals. The scanner regenerates it on every scan; do not edit by
hand. The signals file remains the source of truth for raw email facts; the
applications file is the source of truth for tracker / dashboard consumers.

Schema:

```json
{"applicationKey":"whatnot|software-engineer-fraud","threadId":"...","company":"Whatnot","role":"Software Engineer, Fraud","currentState":"interview","firstSeenAt":"2026-04-10T10:00:00Z","lastUpdateAt":"2026-04-20T14:00:00Z","messageCount":2,"humanContact":"Sarah K. <sarah@whatnot.com>","timeline":[{"event":"applied","at":"2026-04-10T10:00:00Z","messageId":"...","subject":"...","summary":"..."}],"attention":{"level":"action","reason":"interview active","since":"2026-04-20T14:00:00Z","dueAt":""},"confidence":0.95}
```

State machine priority (highest first):
`offer > rejected > interview > online_assessment > responded > applied`.
Terminal states (`offer`, `rejected`) latch — once an application reaches a
terminal state, later non-terminal events do not change it. A higher-priority
terminal can supersede a lower one (an `offer` arriving after a `rejected`
overrides it).

Attention levels:

| Level | Trigger |
|-------|---------|
| `urgent` | `currentState ∈ {offer, rejected}` OR (`currentState ∈ action set` AND any timeline `dueAt` within 48h) |
| `action` | `currentState ∈ {interview, online_assessment, responded, action_required}` |
| `stale` | `currentState === 'applied'` AND `now − lastUpdateAt ≥ 14 days` |
| `info` | everything else |

Defaults `STALE_DAYS_THRESHOLD = 14` and `URGENT_DEADLINE_HOURS = 48` are
exported from `scripts/gmail-applications.mjs` for downstream consumers.

Deadlines are extracted by `parseDeadline(text, referenceDate)` from the full
message body during signal extraction (not from the 220-char stored snippet).
Supported phrasings:

- ISO date: `2026-05-05`, `2026/05/05`
- Relative: `complete within 5 days`, `due in 2 weeks`, `submit in 3 days`
- Named: `by May 5`, `before April 30`, `until June 1, 2026` (year defaults to
  reference year; if the resulting date is more than 30 days in the past, it
  rolls to the next year)

Signals on `interview` / `online_assessment` / `action_required` events carry
a `dueAt` ISO field when extraction succeeds.

`data/gmail-applications.jsonl` is gitignored alongside the signals file.

## Dashboard Refresh

Run the connector-assisted scan inside Codex with:

```text
/auto-job gmail-scan
```

For a standalone OAuth scanner, create a Google Cloud OAuth client with
Application type `Desktop app` and Gmail API enabled. Do not use a
`Web application` client; the scanner uses a random loopback port and Web
clients will fail with `redirect_uri_mismatch` unless every generated local
callback URL is pre-registered.

Save the downloaded Desktop app client JSON as
`config/gmail-oauth-credentials.json`, then run:

```bash
bun run gmail:auth
```

The same Google Cloud project must also have Gmail API enabled. If
`bun run gmail:scan` reports that Gmail API has not been used or is disabled,
enable Gmail API for the project shown in the error, wait a minute, then retry.

This requests `https://www.googleapis.com/auth/gmail.readonly` and stores the
local refresh token in `config/gmail-oauth-token.json`. Both files are
gitignored.

After auth, run a scan manually with:

```bash
bun run gmail:scan
```

`bun run dashboard` and `bun run dashboard` call
`scripts/refresh-gmail-signals.mjs` once before the local dashboard server
starts. That hook now defaults to `scripts/gmail-oauth-refresh.mjs`, so after
`bun run gmail:auth` every dashboard start attempts a fresh Gmail API scan.

To override the startup scanner command, set:

```bash
AUTO_JOB_GMAIL_REFRESH_COMMAND='["node","scripts/gmail-oauth-refresh.mjs"]' bun run dashboard
```

The command must be a JSON array so it can run without a shell. Set
`AUTO_JOB_DASHBOARD_REFRESH_GMAIL=0` to skip the startup refresh hook.

`data/gmail-refresh-status.json` records the latest attempt status and is also
gitignored.
