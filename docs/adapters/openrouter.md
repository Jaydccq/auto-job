# OpenRouter adapter

The OpenRouter adapter routes auto-job bridge evaluations through the
[OpenRouter](https://openrouter.ai/) HTTP API instead of a local CLI
subprocess (`claude -p` or `codex exec`). It is the right choice when:

- You don't want to install or maintain Claude Code or the Codex CLI.
- You want to switch frontier models without changing local tooling.
- You're running the bridge on a machine that can't reach a CLI agent
  (e.g. a small server, a CI environment, or a sandboxed VM).

The trade-off is that the model has **no tool access** — no web search,
no file reads. The adapter must give the model everything it needs in
the prompt, which usually means the page text the extension captures
when you click Evaluate.

## Setup

### 1. Get an OpenRouter API key

Create an account at [openrouter.ai/keys](https://openrouter.ai/keys)
and generate a key. OpenRouter is pay-as-you-go; there is no monthly
minimum.

### 2. Make the key available to the bridge

The adapter resolves the key in this order:

1. `OPENROUTER_API_KEY` environment variable.
2. `~/.config/auto-job/openrouter.key` (the file is read verbatim and
   trimmed; recommended `chmod 600`).

If neither is set the bridge throws on startup with a message pointing
you here.

```sh
mkdir -p ~/.config/auto-job
printf '%s' "sk-or-v1-…" > ~/.config/auto-job/openrouter.key
chmod 600 ~/.config/auto-job/openrouter.key
```

### 3. Start the bridge in OpenRouter mode

```sh
AUTO_JOB_BACKEND=real-openrouter bun run server
```

Equivalent direct invocation:

```sh
AUTO_JOB_BRIDGE_MODE=real \
  AUTO_JOB_REAL_EXECUTOR=openrouter \
  bun run server
```

Verify with `/v1/health`:

```sh
curl -s -H "X-Auto-Job-Token: $(cat apps/server/.bridge-token)" \
  http://127.0.0.1:47319/v1/health | jq '.result.execution'
# { "mode": "real", "realExecutor": "openrouter" }
```

## Model selection

The adapter defaults to `anthropic/claude-3.5-sonnet`. Override with the
optional `model` field on `OpenRouterConfig` (currently this is wired
through `index.ts`; users wanting a non-default model can pass the
override in their own bootstrap).

Models worth considering for evaluation tasks:

| OpenRouter slug                  | Strengths                              |
|----------------------------------|----------------------------------------|
| `anthropic/claude-3.5-sonnet`    | Default. Best balance of quality + cost. |
| `anthropic/claude-3.5-haiku`     | Cheaper, faster, slightly lower quality. |
| `openai/gpt-4o`                  | Strong alternate; different style.       |
| `openai/gpt-4o-mini`             | Cheapest GPT-class option.               |
| `google/gemini-2.0-flash-001`    | Cheap, very fast, lower quality.         |

Browse the full list at
[openrouter.ai/models](https://openrouter.ai/models). Career-ops always
uses chat-completions style streaming, so any model that exposes
`/v1/chat/completions` with SSE works.

## Cost

OpenRouter prices each model independently and bills per token. As of
April 2026 a typical full evaluation (one A–G report) consumes roughly:

- 4–8k input tokens (system prompt + captured JD text)
- 1–3k output tokens (the report markdown)

At Claude 3.5 Sonnet rates that's approximately USD 0.03–0.06 per
evaluation. Cheaper models drop this 5–10x. Set spending limits in the
OpenRouter dashboard to cap your exposure.

## Operational notes

- **Streaming.** The adapter uses `stream=true` and reassembles SSE
  deltas. A 10-minute `AbortController` timeout protects against hung
  connections; tune it via `OpenRouterConfig.timeout`.
- **Attribution headers.** The bridge sends `HTTP-Referer:
  https://auto-job.local` and `X-Title: Auto Job` so OpenRouter
  can attribute usage. These are required by OpenRouter's API
  guidelines. Override with `httpReferer` / `xTitle` if you want your
  own attribution to appear in the OpenRouter dashboard.
- **No tool access.** Unlike the CLI adapters, OpenRouter cannot fetch
  URLs or read files. The adapter passes captured page text inline.
  If the extension didn't capture meaningful text (e.g. the JD is
  rendered after a login wall), the report quality drops. Consider
  pasting the JD into the popup before clicking Evaluate.
- **No PDF generation.** PDFs require Playwright + the `generate-pdf.mjs`
  script and are out of scope for this adapter. Reports are written as
  markdown only; use the Bun document-generation scripts afterward when you
  need PDFs.
- **Tracker.** The adapter writes `batch/tracker-additions/{jobId}.tsv`
  the same way the CLI adapters do, so `node merge-tracker.mjs` works
  unchanged.

## Troubleshooting

- `OPENROUTER_API_KEY is not set` on boot — set the env var or write
  the key file as shown above.
- `429 Too Many Requests` — OpenRouter has soft per-minute caps. Lower
  `AUTO_JOB_BRIDGE_EVAL_RPM` or upgrade your account.
- `model output was not a valid report` — the model didn't follow the
  instructed schema. This is rare with Sonnet/4o-class models but more
  common with Haiku/Flash. Switch to a stronger default model.
