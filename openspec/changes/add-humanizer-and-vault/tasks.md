## 1. Workspace skeleton

- [ ] 1.1 Create `packages/humanize/` with `src/`, `test/`, `package.json`, `tsconfig.json`, `vitest.config.ts`, `.gitignore`
- [ ] 1.2 Create `packages/credentials/` with same skeleton
- [ ] 1.3 Both packages declare `@auto-job/browser` as dependency and re-use existing TS conventions
- [ ] 1.4 Run `npm install` in each package; `npm --prefix <pkg> run typecheck` passes on empty src

## 2. Humanizer

- [ ] 2.1 `packages/humanize/src/random.ts` — seeded RNG (Mulberry32) so per-session personality is deterministic with explicit seed
- [ ] 2.2 `packages/humanize/src/mouse.ts` — `bezierPath(from, to, rng)` returning 30-60 (x,y) waypoints; `humanizedMove(page, to, rng)` walks the path
- [ ] 2.3 `packages/humanize/src/keyboard.ts` — `humanizedType(page, selector, text, rng)` with log-normal dwell + ~1% typo+correction
- [ ] 2.4 `packages/humanize/src/reading.ts` — `readingDelay(text)` returning `clamp(text.length * 60, 200, 3000)` ms
- [ ] 2.5 `packages/humanize/src/session.ts` — `Personality` factory: typing-speed bias, reading-speed bias, jitter intensity, all derived from seed
- [ ] 2.6 `packages/humanize/src/humanized-tab.ts` — `HumanizedTab implements Tab`, decorates click/fill/navigate/press; passthrough for fetch/evaluate/snapshot
- [ ] 2.7 `packages/humanize/src/index.ts` — exports `humanize(tab, opts?)`, `HumanizedTab`, `Personality`, types
- [ ] 2.8 Unit tests: bezier path determinism, log-normal dwell distribution, reading clamp, personality stability within session
- [ ] 2.9 Integration test (gated by `RUN_HUMANIZER_INTEGRATION=1`): real Tab + HumanizedTab against `data:text/html,<input id=q>...`, assert ≥30 mouse events for a click

## 3. Credentials vault

- [ ] 3.1 `packages/credentials/src/keychain.ts` — `securityRun(args)` wrapper around `child_process.execFile("security", args)`
- [ ] 3.2 `packages/credentials/src/vault.ts` — `vaultPut`, `vaultGet`, `vaultDelete`, `vaultGenerate` + `vaultKey(ats, tenant)` helper
- [ ] 3.3 `packages/credentials/src/errors.ts` — `KeychainNotAvailableError`, `KeychainEntryNotFoundError`, `KeychainAccessDeniedError`
- [ ] 3.4 `packages/credentials/src/password-gen.ts` — `generatePassword(opts?)` ≥20 chars, mixed case + digits + symbols
- [ ] 3.5 `packages/credentials/src/index.ts` — public exports
- [ ] 3.6 Unit tests with mocked `securityRun`: round-trip put/get, missing key throws, password strength, value-never-logged contract
- [ ] 3.7 Integration test (gated by `KEYCHAIN_INTEGRATION=1`): real Keychain write/read/delete under `auto-job-test:*` prefix; cleanup on teardown
- [ ] 3.8 New npm script `vault:cli` — list keys (names only, no values)

## 4. Apply queue + gate

- [ ] 4.1 `apps/server/src/apply-queue/types.ts` — `ApplyQueueEntry`, `ApplyStatus`, `Evaluation` (subset of EvaluationResult)
- [ ] 4.2 `apps/server/src/apply-queue/queue.ts` — `enqueue`, `readQueue`, `markStatus` against `data/apply-queue.jsonl`
- [ ] 4.3 `apps/server/src/apply-queue/policy.ts` — `loadPolicy()` reads `config/auto-apply-policy.yml`; throws if missing OR returns sentinel disabled
- [ ] 4.4 `apps/server/src/apply-queue/gate.ts` — `applyGate(evaluation, policy, queue)` returns `{enqueue, reason}`
- [ ] 4.5 Unit tests for gate decision matrix (disabled / threshold / quota / cooldown / ATS-supported)
- [ ] 4.6 Unit tests for queue persistence (append-only, latest-line-wins projection)

## 5. Config + gitignore + scripts

- [ ] 5.1 `config/auto-apply-policy.example.yml` with disabled defaults + inline comments documenting each field
- [ ] 5.2 `.gitignore` adds `data/apply-queue.jsonl`, `config/auto-apply-policy.yml`
- [ ] 5.3 `package.json` adds `vault:cli` npm script

## 6. Verify + commit + push to PRIVATE remote + private PR

- [ ] 6.1 `npm --prefix packages/humanize run typecheck && test` pass
- [ ] 6.2 `npm --prefix packages/credentials run typecheck && test` pass
- [ ] 6.3 `npm run verify` passes (extends verify-pipeline to cover the two new packages)
- [ ] 6.4 Commit on `feat/humanizer-and-vault` branch
- [ ] 6.5 Push to `private` remote (NOT origin)
- [ ] 6.6 Open PR against `Jaydccq/auto-job-private`
