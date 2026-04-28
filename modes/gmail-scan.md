# Mode: gmail-scan — Gmail Application Pipeline Scanner

Scans Gmail through either the Codex Gmail connector or the standalone Gmail
OAuth CLI, extracts derived hiring facts, updates the local Gmail signal
artifact, and refreshes the dashboard pipeline.

This is the repeatable Career-Ops skill entry point for Gmail scanning,
analogous to `newgrad-scan`.

## Prerequisites

- Codex session with the Gmail connector available, or local OAuth credentials
  at `config/gmail-oauth-credentials.json` plus token from `bun run gmail:auth`.
- Existing dashboard signal support from `docs/GMAIL_SIGNALS.md`.

If the Gmail connector is unavailable, stop and tell the user:

> "Run `bun run gmail:auth` once, then `bun run gmail:scan` or `bun run dashboard`."

## Safety Rules

- Read Gmail only. Never send, forward, archive, delete, label, or mark emails.
- Store derived hiring facts only. Do not store full raw email bodies.
- Keep `data/gmail-signals.jsonl` and `data/gmail-refresh-status.json`
  gitignored.
- Do not mutate `data/applications.md` from Gmail alone. Gmail-only rows stay
  display-only until the normal tracker review/merge path is used.
- If a thread contains unrelated sensitive content, extract only the hiring fact
  needed for the pipeline and omit the rest.

## Default Search Scope

Use Gmail-native search with `in:anywhere newer_than:12m`.

Start with broad ATS/recruiting senders:

```text
in:anywhere newer_than:12m {from:hire.lever.co from:greenhouse-mail.io from:ashbyhq.com from:smartrecruiters.com from:talent.icims.com from:myworkday.com from:greenhouse.io from:lever.co from:workday.com}
```

Then run targeted keyword searches for missed direct-recruiter messages. Keep
these phrase-based and exclude obvious promotional/social categories; do not
scan for bare words like `offer` or `application` because those match ordinary
marketing mail:

```text
in:anywhere newer_than:12m -category:promotions -category:social {"thank you for applying" "received your application" "your application" "application status" "application for" "interview invitation" "schedule interview" "your interview" "online assessment" "coding challenge" hackerrank codesignal "offer letter" "job offer" "employment offer" "not moving forward" "not selected" "talent acquisition"}
```

Use company-specific searches when the dashboard already has partial rows or the
user names examples.

## Execution

### Connector-assisted path

1. Read `docs/GMAIL_SIGNALS.md`, `web/README.md`, and existing
   `data/gmail-signals.jsonl` if present.
2. Search Gmail with the default scope. Prefer `search_emails` for summaries.
3. Expand high-signal conversations with `read_email_thread` or
   `batch_read_email_threads`.
4. Extract one signal per hiring event:
   - application confirmation
   - recruiter response
   - OA or assessment
   - interview scheduling or meeting update
   - offer
   - rejection or closed role
   - explicit action required
5. Normalize company, role, recent contact, event type, event date, received
   timestamp, short summary, message id, thread id, confidence, and optional
   recommended action.
   Before writing, require a real hiring context such as `your application`,
   `thank you for applying`, `interview invitation`, `online assessment`,
   `offer letter`, `job offer`, a rejection phrase tied to the application, or
   a trusted ATS/recruiting sender. Promotional offers, newsletters, Reddit
   digests, utility alerts, rent/payment notices, and shopping mail must not
   produce signals.
6. Merge with existing signals by stable id:

```text
messageId:eventType
threadId:eventType
company+role+eventType+eventDate
```

7. Write the merged output to `data/gmail-signals.jsonl`, one JSON object per
   line. Keep snippets short and omit full body text.
8. Run:

```bash
bun run gmail:update
```

This records the latest refresh status and validates the current signal file
summary. It does not fetch Gmail by itself.

9. Run or refresh the dashboard:

```bash
bun run dashboard
```

The Tracker tab should show synced signals, Gmail-only application rows, recent
contacts, attention state, and expandable short email evidence.

### OAuth CLI path

Create a Google Cloud OAuth client with Application type `Desktop app`, not
`Web application`, and save it as `config/gmail-oauth-credentials.json`.

Run once:

```bash
bun run gmail:auth
```

Then scan:

```bash
bun run gmail:scan
```

`bun run dashboard` runs `scripts/refresh-gmail-signals.mjs`, which defaults to
`scripts/gmail-oauth-refresh.mjs`, so the dashboard startup will pull Gmail
again after OAuth is configured.

## Signal Schema

Use the schema in `docs/GMAIL_SIGNALS.md`. Recommended event types:

- `applied`
- `responded`
- `online_assessment`
- `interview`
- `offer`
- `rejected`
- `action_required`

Recommended fields:

```json
{"id":"message-id:interview","company":"Example Co","role":"Software Engineer","eventType":"interview","eventDate":"2026-04-25","receivedAt":"2026-04-25T15:00:00Z","recentContact":"Recruiter Name","sender":"Recruiter Name <recruiting@example.com>","subject":"Interview invitation","summary":"Recruiter sent a scheduling link for a technical interview.","messageId":"...","threadId":"...","confidence":0.9}
```

## Verification

After every Gmail scan:

```bash
node --check web/build-dashboard.mjs
bun run gmail:update
bun run dashboard:build
git diff --check
```

Then browser-test the private local dashboard and confirm:

- Tracker shows the configured Gmail account.
- Synced signal count is nonzero when signals exist.
- A known recent company appears with the correct stage/contact/attention.
- Static `web/index.html` does not contain private Gmail account text, message
  ids, or recruiter snippets.

If `node test-all.mjs --quick` is run, report any pre-existing absolute-path
failures separately from Gmail-scan changes.
