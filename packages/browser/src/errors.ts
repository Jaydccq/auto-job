/**
 * Named error classes for @auto-job/browser.
 *
 * Consumer code MUST be able to branch on the class (instanceof) rather
 * than parsing message strings. This is the safety contract that lets
 * scan scripts decide retry vs abort vs prompt-user without scraping
 * error messages.
 */

export class ChromeNotFoundError extends Error {
  readonly name = "ChromeNotFoundError";
  constructor(message?: string) {
    super(
      message ??
        "No Chrome / Chrome for Testing / Chromium binary discoverable on PATH or in standard locations. Install Google Chrome from https://www.google.com/chrome/ or run `npx @puppeteer/browsers install chrome` for a managed install.",
    );
  }
}

export class ProfileLockedError extends Error {
  readonly name = "ProfileLockedError";
  constructor(
    public readonly profileDir: string,
    public readonly conflictPid?: number,
  ) {
    super(
      conflictPid
        ? `Chrome profile ${profileDir} is already in use by PID ${conflictPid}. Close that Chrome window before retrying.`
        : `Chrome profile ${profileDir} is already in use by another Chrome process not exposing the configured CDP port. Close it before retrying.`,
    );
  }
}

export class NotAuthenticatedError extends Error {
  readonly name = "NotAuthenticatedError";
  constructor(
    public readonly site: string,
    public readonly loginUrl?: string,
  ) {
    super(
      loginUrl
        ? `Not authenticated on ${site}. Open ${loginUrl} in the dedicated profile (npm run own-browser:login-helper) and log in.`
        : `Not authenticated on ${site}. Open the dedicated profile (npm run own-browser:login-helper) and log in.`,
    );
  }
}

export class TabClosedError extends Error {
  readonly name = "TabClosedError";
  constructor(message?: string) {
    super(message ?? "Tab has been closed; further operations are not allowed.");
  }
}

export class AdapterParseError extends Error {
  readonly name = "AdapterParseError";
  constructor(
    message: string,
    public readonly rawSnippet: string,
  ) {
    super(`${message} | raw[0..200]=${rawSnippet.slice(0, 200)}`);
  }
}
