/**
 * Named errors. Branchable via instanceof.
 */

import type { SupportedATS } from "./types.js";

export class SubmitNotPermittedError extends Error {
  readonly name = "SubmitNotPermittedError";
  constructor() {
    super(
      "submit blocked: opts.allowSubmit must be the literal boolean `true` to enable. " +
        "This is intentional: Phase 2B ships fill-only by default to prevent accidental submits.",
    );
  }
}

export class MissingProfileFieldError extends Error {
  readonly name = "MissingProfileFieldError";
  constructor(
    public readonly field: string,
    public readonly source: string,
  ) {
    super(`config/profile.yml is missing required field "${field}" (source: ${source})`);
  }
}

export class MissingResumeError extends Error {
  readonly name = "MissingResumeError";
  constructor(public readonly path: string) {
    super(`resume file not found at "${path}"; verify config/profile.yml resume_path`);
  }
}

export class UnsupportedATSError extends Error {
  readonly name = "UnsupportedATSError";
  constructor(public readonly attempted: string) {
    super(
      `ATS "${attempted}" is not supported by add-auto-apply-fill-simulation. ` +
        `Supported: greenhouse, lever, ashby, workday. ` +
        `iCIMS is deferred pending URL-pattern reverse engineering.`,
    );
  }
}

export class FormFillError extends Error {
  readonly name = "FormFillError";
  constructor(
    message: string,
    public readonly ats: SupportedATS,
    public readonly fieldKey?: string,
  ) {
    super(`auto-apply[${ats}]${fieldKey ? `[${fieldKey}]` : ""}: ${message}`);
  }
}

export class DetectionSignalError extends Error {
  readonly name = "DetectionSignalError";
  constructor(
    message: string,
    public readonly ats: SupportedATS,
    public readonly signal: "captcha" | "login_redirect" | "http_403" | "http_429" | "other",
  ) {
    super(`auto-apply[${ats}] detection signal "${signal}": ${message}`);
  }
}
