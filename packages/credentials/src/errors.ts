/**
 * Named error classes for @auto-job/credentials.
 *
 * Branchable via `instanceof` — never parse error messages to identify
 * a failure mode. Same contract as @auto-job/browser/errors.
 */

export class KeychainNotAvailableError extends Error {
  readonly name = "KeychainNotAvailableError";
  constructor(public readonly platform: string) {
    super(
      `macOS Keychain not available on platform "${platform}". The credentials vault is macOS-only. ` +
        `Linux/Windows credential backends are not implemented.`,
    );
  }
}

export class KeychainEntryNotFoundError extends Error {
  readonly name = "KeychainEntryNotFoundError";
  constructor(public readonly key: string) {
    super(`Keychain entry "${key}" not found`);
  }
}

export class KeychainAccessDeniedError extends Error {
  readonly name = "KeychainAccessDeniedError";
  constructor(public readonly key: string) {
    super(
      `Keychain entry "${key}" access denied. The user clicked Deny on the macOS confirmation dialog, ` +
        `or the Keychain is locked. Unlock Keychain Access.app and retry.`,
    );
  }
}

export class KeychainCommandFailedError extends Error {
  readonly name = "KeychainCommandFailedError";
  constructor(
    message: string,
    public readonly exitCode: number | null,
    public readonly stderr: string,
  ) {
    super(`security command failed (exit ${exitCode}): ${message}`);
  }
}
