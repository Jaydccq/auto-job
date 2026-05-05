## Context

Phase 2C lifts the submit gate via human approval; Phase 3 lifts the email-verification gate via host allowlist + humanized click. The risk shape is different from Phase 2C because here we're not submitting an application — we're confirming a security/identity check that the user already implicitly initiated by applying.

Lower risk than Phase 4 (auto-signup) because:
1. Existing user account, existing identity
2. Action is "yes this was me" — no false negatives matter (ATS just resends)
3. No PII transmitted; just clicking a tokenized URL

Higher risk than fill-only because we're crossing into "automated identity ceremony" territory, which is exactly what bot detectors flag if done too fast / too predictably.

## Goals / Non-Goals

**Goals:**
- Read Gmail with narrow filters (allowlisted ATS domains only)
- Validate every link host against an explicit allowlist before clicking
- Use humanized navigation + click (8+ second reading delay before any action)
- Label processed emails so we never re-click
- Support per-host customization of confirm button selectors
- Respect cooldown — if any host throws detection signal, that host goes into 7-day cooldown (consistent with Phase 5 telemetry)

**Non-Goals:**
- Fill any form on the verification page (just click the obvious confirm button)
- Process emails older than 1h (avoids the "bot replaying historical links" pattern)
- New-account verification (Phase 4)
- Reply to emails / interact with content beyond click
- Click multiple links per email (just the most prominent)
- Process attachments

## Decisions

### D1 — Allowlist defaults empty; user opts in per host

Reason: shipping an allowlist with default ATS domains would auto-enable the bot for every install. Opt-in by host means the user sees the explicit list of "I trust this domain to send me legit verification links" and signs off.

Allowlist file is gitignored runtime config; `.example.yml` ships in repo with comments explaining each field.

### D2 — Single-link extraction per email; refuse multi-link

Real verification emails have ONE prominent CTA. If our extractor finds multiple plausible links to allowlisted hosts, the bot refuses (status: `multi-link-ambiguous`) and writes a notification artifact for manual review.

Defense against phishing: even if a real verification email gets compromised with extra phishing links, our refusal protects us.

### D3 — Reading delay minimum 8 seconds

Behavior-fingerprint detectors flag "open email link → click within 1 second" as bot. Humans take time to read at minimum. We force 8s + 60ms-per-character for the visible pre-click element text.

### D4 — Per-host selector override; generic fallback

Each allowlisted host can specify `confirm-button-selector`. If unset, generic fallbacks try (in order): `button:has-text("Confirm")`, `a:has-text("Confirm Your Email")`, `button[data-action="confirm"]`, etc. If neither matches: refuse (status: `confirm-button-not-found`).

### D5 — Gmail labels as idempotency primitive

Each processed email gets label `auto-job/processed` (created on first run if absent). The polling query excludes this label so we never re-process. If the label is later removed (manually, or by Gmail bug), the email becomes eligible again — that's accepted.

### D6 — Audit snapshots are mandatory (mirrors Phase 2B)

Pre-click HTML + screenshot + email sender/subject + extracted URL → `data/email-bot-snapshots/{messageId}-{timestamp}/`. After-click snapshot too. Available for forensic review if anything goes wrong.

## Risks / Trade-offs

- **Phishing email reaches Gmail and matches the allowlist** — phishing emails CAN spoof from-domains via SPF gaps. Mitigation: allowlist is host of LINK, not sender. Even if a phishing email lands, the link host is what matters and unknown hosts are refused.
- **Bot detection on identity ceremony** — clicking a verification link from automation is itself a signal. Mitigation: 8s+ reading delay, humanized click, low volume (typically <5 verification emails per week).
- **Gmail OAuth token expiry** — existing pipeline already handles refresh. Document that this bot fails closed if token is invalid.
- **Multi-account Gmail** — only the OAuth'd account is checked. Document this.
- **Race with Phase 4 new-account verification** — Phase 4 can call `verifyLink` directly with its own message id. The bot's polling skips messages that already have `auto-job/processed` label, so no double-click.

## Migration Plan

Pure additive. Revert removes the package + CLI; Gmail labels persist (harmless).

## Open Questions

None at design time.
