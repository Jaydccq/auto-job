/**
 * Named errors for email-bot. All branchable via `instanceof`.
 */

export class EmailBotDisabledError extends Error {
  readonly name = "EmailBotDisabledError";
  constructor() {
    super(
      "email-bot disabled: no allowlist found. " +
        "Copy config/email-verification-allowlist.example.yml to " +
        "config/email-verification-allowlist.yml and add at least one host.",
    );
  }
}

export class LinkHostNotAllowedError extends Error {
  readonly name = "LinkHostNotAllowedError";
  constructor(public readonly host: string, public readonly url: string) {
    super(
      `email-bot refuses URL: host "${host}" is not in the allowlist. ` +
        `Add it to config/email-verification-allowlist.yml if you trust it.`,
    );
  }
}

export class MultiLinkAmbiguousError extends Error {
  readonly name = "MultiLinkAmbiguousError";
  constructor(public readonly candidates: readonly string[]) {
    super(
      `email-bot refuses: ${candidates.length} allowlisted-host links found in body. ` +
        `Real verification emails have exactly one prominent CTA. Candidates: ${candidates.join(", ")}`,
    );
  }
}

export class ConfirmButtonNotFoundError extends Error {
  readonly name = "ConfirmButtonNotFoundError";
  constructor(public readonly host: string, public readonly trySelectors: readonly string[]) {
    super(
      `email-bot: no confirm button matched on ${host}. Tried: ${trySelectors.join(", ")}. ` +
        `Add a per-host \`confirm_button_selector\` to the allowlist for this host.`,
    );
  }
}

export class GmailAuthError extends Error {
  readonly name = "GmailAuthError";
  constructor(message: string) {
    super(`email-bot Gmail auth failed: ${message}; run \`npm run gmail:auth\` first`);
  }
}
