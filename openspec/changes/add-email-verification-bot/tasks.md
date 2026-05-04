## 1. Workspace skeleton

- [ ] 1.1 `packages/email-bot/` with `src/`, `test/`, `package.json` (deps on `@auto-job/browser` + `@auto-job/humanize` + `googleapis`), `tsconfig.json`, `vitest.config.ts`, `.gitignore`
- [ ] 1.2 pnpm install at root; verify workspace links

## 2. Gmail integration

- [ ] 2.1 `src/gmail.ts` — wrapper around the existing OAuth credentials (read from `config/gmail-oauth-token.json`)
- [ ] 2.2 `pollVerificationEmails(opts?)` — query: `newer_than:1h from:({allowlist hosts}) subject:(verify OR confirm OR activate OR "is this you") -label:auto-job/processed`
- [ ] 2.3 `addProcessedLabel(messageId)` — create label on first run if absent, then add to message
- [ ] 2.4 Unit tests with mocked Gmail client

## 3. Allowlist + link extraction

- [ ] 3.1 `src/allowlist.ts` — `loadAllowlist(opts?)` reads `config/email-verification-allowlist.yml`; missing file → empty allowlist
- [ ] 3.2 `config/email-verification-allowlist.example.yml` documents schema with disabled defaults
- [ ] 3.3 `src/extract-link.ts` — `extractVerificationLink(emailBody, allowlist)` returns single allowlisted-host URL or throws
- [ ] 3.4 Unit tests with synthetic email bodies (single link / multi link / no link)

## 4. verifyLink orchestrator

- [ ] 4.1 `src/verify-link.ts` — `verifyLink(controller, url, opts?)`:
  - Validate host via allowlist
  - Open tab, wait load, settle 1s
  - Capture pre-click snapshot
  - Resolve confirm button (per-host selector → generic fallbacks)
  - Apply minimum 8s + reading delay
  - Click via HumanizedTab
  - Capture post-click snapshot
  - Return result with selector matched, click timing, final URL
- [ ] 4.2 Errors: `EmailBotDisabledError`, `LinkHostNotAllowedError`, `MultiLinkAmbiguousError`, `ConfirmButtonNotFoundError`
- [ ] 4.3 Snapshot writer to `data/email-bot-snapshots/`

## 5. Orchestrator + runner

- [ ] 5.1 `src/run.ts` — `processNextVerificationEmail(controller, opts?)`:
  - Poll → pick first matching email
  - Extract link
  - Call verifyLink
  - On success: addProcessedLabel
  - On detection signal: per-host cooldown registered (Phase 5 hook)
- [ ] 5.2 `src/index.ts` public exports

## 6. CLI

- [ ] 6.1 `scripts/email-bot.ts` with `list / run / sweep / allowlist` subcommands
- [ ] 6.2 npm script `email-bot` in root package.json

## 7. Tests

- [ ] 7.1 Unit tests: gmail (mocked), allowlist load, link extraction, snapshot writer
- [ ] 7.2 verifyLink tests with fakeTab — host validation, missing button, timing assertion (8s+ delay)
- [ ] 7.3 processNextVerificationEmail integration test with mocked Gmail + fakeTab
- [ ] 7.4 CLI smoke (--help, list with no allowlist, list with allowlist)

## 8. Verify + commit + push private + open private PR

- [ ] 8.1 npm run verify passes (extends pipeline for new package)
- [ ] 8.2 .gitignore: `data/email-bot-snapshots/`, `config/email-verification-allowlist.yml`, package node_modules/dist
- [ ] 8.3 Commit on branch `feat/email-verification-bot` (private)
- [ ] 8.4 Push private; open PR
