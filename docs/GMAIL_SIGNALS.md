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

Recommended fields:

```json
{"id":"gmail-message-id:event","applicationNum":123,"company":"Example Co","role":"Software Engineer","eventType":"interview","eventDate":"2026-04-25","priority":"attention","summary":"Recruiter sent an interview scheduling link","recommendedAction":"Schedule interview","messageId":"...","threadId":"...","confidence":0.9}
```

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

## Dashboard Refresh

Run the connector-assisted scan inside Codex with:

```text
/career-ops gmail-scan
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
CAREER_OPS_GMAIL_REFRESH_COMMAND='["node","scripts/gmail-oauth-refresh.mjs"]' bun run dashboard
```

The command must be a JSON array so it can run without a shell. Set
`CAREER_OPS_DASHBOARD_REFRESH_GMAIL=0` to skip the startup refresh hook.

`data/gmail-refresh-status.json` records the latest attempt status and is also
gitignored.
