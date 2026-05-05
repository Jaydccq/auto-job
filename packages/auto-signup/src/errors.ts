/**
 * Named errors. Branchable via instanceof.
 */

export class RiskAckMissingError extends Error {
  readonly name = "RiskAckMissingError";
  constructor(public readonly path: string, public readonly reason: string) {
    super(
      `auto-signup refused: ${reason}. Phase 4 requires a signed RISK_ACK.md ` +
        `(see RISK_ACK.example.md). Path checked: ${path}`,
    );
  }
}

export class SignupQuotaExceededError extends Error {
  readonly name = "SignupQuotaExceededError";
  constructor(public readonly ats: string, public readonly used: number, public readonly limit: number) {
    super(
      `auto-signup quota exceeded for ${ats}: ${used}/${limit} this week. ` +
        `Increase signup_quota.per_ats_per_week.${ats} in config/auto-apply-policy.yml ` +
        `if you really want more, but read RISK_ACK.md again first.`,
    );
  }
}

export class SignupCooldownError extends Error {
  readonly name = "SignupCooldownError";
  constructor(public readonly ats: string, public readonly endsAt: string, public readonly reason: string) {
    super(`auto-signup blocked: ATS ${ats} in cooldown until ${endsAt} (${reason})`);
  }
}

export class RequiresPhoneVerificationError extends Error {
  readonly name = "RequiresPhoneVerificationError";
  constructor(public readonly ats: string, public readonly snapshotDir: string) {
    super(
      `auto-signup blocked on ${ats}: page demands phone/SMS verification, which we don't automate. ` +
        `See snapshot at ${snapshotDir}.`,
    );
  }
}

export class SignupSubmitFailedError extends Error {
  readonly name = "SignupSubmitFailedError";
  constructor(public readonly ats: string, message: string) {
    super(`auto-signup submit failed on ${ats}: ${message}`);
  }
}

export class UnsupportedSignupATSError extends Error {
  readonly name = "UnsupportedSignupATSError";
  constructor(public readonly ats: string) {
    super(
      `auto-signup does not support "${ats}". Supported: greenhouse, lever, ashby, workday. ` +
        `LinkedIn is intentionally excluded; iCIMS is deferred.`,
    );
  }
}

export class SignupSubmitNotPermittedError extends Error {
  readonly name = "SignupSubmitNotPermittedError";
  constructor() {
    super(
      "signup submit blocked: opts.allowSubmit must be the literal boolean `true`. " +
        "This is intentional defense-in-depth — only runSignupFlow inside the gated " +
        "orchestrator should ever lift this.",
    );
  }
}
