/**
 * runSignupFlow — vault-FIRST signup orchestrator.
 *
 * Sequence:
 *   1. signupGate (RISK_ACK + quota + cooldown)
 *   2. open tab, identify form
 *   3. resolve password (override or vaultGenerate)
 *   4. **vaultPut(key, email, password)** — credential saved BEFORE submit
 *   5. capture pre-form snapshot
 *   6. humanized fill via HumanizedTab
 *   7. capture filled-form snapshot
 *   8. detect phone verification → RequiresPhoneVerificationError
 *   9. submit (single allowSubmit:true call site, defended by gate)
 *  10. capture post-submit snapshot
 *  11. recordSignupOutcome telemetry
 */

import type { BrowserController } from "@auto-job/browser";
import { humanize } from "@auto-job/humanize";
import {
  vaultGenerate,
  vaultKey,
  vaultPut,
} from "@auto-job/credentials";
import {
  recordDetectionSignal,
  recordEvent,
  type DetectionSignal,
} from "@auto-job/risk-telemetry";

import { signupFlowFor } from "./adapters.js";
import {
  RequiresPhoneVerificationError,
  SignupSubmitFailedError,
  UnsupportedSignupATSError,
} from "./errors.js";
import { signupGate, type GateOptions, type SignupHistoryEntry } from "./signup-gate.js";
import {
  capturePng,
  captureHtml,
  makeSignupSnapshotDir,
  writeMeta,
  writeRedactedData,
} from "./snapshot.js";
import type {
  SignupFormData,
  SignupQuotaPolicy,
  SignupRequest,
  SignupResult,
  SupportedSignupATS,
} from "./types.js";

export interface RunSignupOptions extends GateOptions {
  /** Override snapshot root (tests). */
  snapshotRoot?: string;
  /**
   * Provide pre-loaded user identity. When omitted, the caller's
   * email/name/phone defaults must be supplied via `loadApplicationData`
   * (we deliberately don't import @auto-job/auto-apply here to avoid a
   * cycle; orchestrator at apps/server/* layers passes it in).
   */
  identity: {
    email: string;
    firstName: string;
    lastName: string;
    phone?: string;
  };
  /** Quota policy to enforce. */
  quotaPolicy: SignupQuotaPolicy;
  /** Recent signup history; gate counts last-7d entries. */
  history: readonly SignupHistoryEntry[];
  /** Override vault writer (tests). */
  vaultWriter?: (key: string, email: string, password: string | undefined) => Promise<{ vaultRef: string; password: string }>;
}

const PHONE_VERIFICATION_PATTERNS = [
  /enter (?:the )?code (?:we )?sent (?:to )?your phone/i,
  /sms verification/i,
  /text message verification/i,
  /verify your phone/i,
  /6-digit code/i,
];

function detectPhoneVerification(html: string): boolean {
  return PHONE_VERIFICATION_PATTERNS.some((p) => p.test(html));
}

const ADAPTER_TO_TELEMETRY_SIGNAL: Record<string, DetectionSignal> = {
  captcha: "captcha",
  http_403: "http_403",
  http_429: "http_429",
  login_redirect: "login_redirect",
};

export async function runSignupFlow(
  controller: BrowserController,
  request: SignupRequest,
  opts: RunSignupOptions,
): Promise<SignupResult> {
  // Gate first — never open a browser tab if we're not authorized to sign up.
  signupGate(
    {
      ats: request.ats,
      policy: opts.quotaPolicy,
      history: opts.history,
    },
    {
      ...(opts.filePath !== undefined ? { filePath: opts.filePath } : {}),
      ...(opts.cooldownQuery ? { cooldownQuery: opts.cooldownQuery } : {}),
      ...(opts.nowMs !== undefined ? { nowMs: opts.nowMs } : {}),
    },
  );

  const flow = (() => {
    try {
      return signupFlowFor(request.ats);
    } catch {
      throw new UnsupportedSignupATSError(request.ats);
    }
  })();

  const key = vaultKey(request.ats, request.tenant);

  // Vault-FIRST: write credentials before any tab opens.
  const writer = opts.vaultWriter ?? defaultVaultWriter;
  const { vaultRef, password } = await writer(key, opts.identity.email, request.passwordOverride);
  const vaultPutAt = new Date().toISOString();

  const snapshotPaths = makeSignupSnapshotDir(request.ats, request.tenant, opts.snapshotRoot);

  const tab = await controller.openTab(request.signupUrl);
  try {
    await new Promise((r) => setTimeout(r, 1500));
    const schema = await flow.identifyForm(tab);

    await captureHtml(tab, snapshotPaths.preFormHtml);
    await capturePng(tab, snapshotPaths.preFormPng);

    const data: SignupFormData = {
      email: opts.identity.email,
      password,
      firstName: opts.identity.firstName,
      lastName: opts.identity.lastName,
      ...(opts.identity.phone ? { phone: opts.identity.phone } : {}),
    };
    writeRedactedData(snapshotPaths.data, data);

    const ht = humanize(tab);
    await flow.fillForm(ht, schema, data);
    const filledAt = new Date().toISOString();
    await captureHtml(tab, snapshotPaths.filledFormHtml);
    await capturePng(tab, snapshotPaths.filledFormPng);

    // Phone-verification check BEFORE submit — abort if the form already
    // demands SMS at the fill stage.
    const preSubmitHtml = await tab
      .evaluate<string>("document.documentElement.outerHTML")
      .catch(() => "");
    if (detectPhoneVerification(preSubmitHtml)) {
      writeMeta(snapshotPaths.meta, {
        ats: request.ats,
        tenant: request.tenant,
        signupUrl: request.signupUrl,
        vaultRef,
        vaultPutAt,
        filledAt,
      });
      recordDetectionSignal({
        ats: request.ats,
        tenant: request.tenant,
        signal: "verification_required",
        source: "signup",
        note: "phone/SMS verification required before submit",
        snapshotDir: snapshotPaths.dir,
      });
      throw new RequiresPhoneVerificationError(request.ats, snapshotPaths.dir);
    }

    // The single allowSubmit:true call site for signup flows.
    const submitResult = await flow.submit(ht, { allowSubmit: true });
    await captureHtml(tab, snapshotPaths.postSubmitHtml);
    await capturePng(tab, snapshotPaths.postSubmitPng);

    const postSubmitHtml = await tab
      .evaluate<string>("document.documentElement.outerHTML")
      .catch(() => "");
    if (detectPhoneVerification(postSubmitHtml)) {
      writeMeta(snapshotPaths.meta, {
        ats: request.ats,
        tenant: request.tenant,
        signupUrl: request.signupUrl,
        vaultRef,
        vaultPutAt,
        filledAt,
        submittedAt: submitResult.submittedAt,
        finalUrl: submitResult.finalUrl,
        appearsSuccessful: false,
      });
      recordDetectionSignal({
        ats: request.ats,
        tenant: request.tenant,
        signal: "verification_required",
        source: "signup",
        note: "phone/SMS verification required after submit",
        snapshotDir: snapshotPaths.dir,
      });
      throw new RequiresPhoneVerificationError(request.ats, snapshotPaths.dir);
    }

    if (!submitResult.appearsSuccessful) {
      writeMeta(snapshotPaths.meta, {
        ats: request.ats,
        tenant: request.tenant,
        signupUrl: request.signupUrl,
        vaultRef,
        vaultPutAt,
        filledAt,
        submittedAt: submitResult.submittedAt,
        finalUrl: submitResult.finalUrl,
        appearsSuccessful: false,
      });
      recordEvent({
        kind: "signup_outcome",
        source: "signup",
        ats: request.ats,
        tenant: request.tenant,
        severity: "warning",
        note: `submit failed; finalUrl=${submitResult.finalUrl}`,
        snapshotDir: snapshotPaths.dir,
      });
      throw new SignupSubmitFailedError(
        request.ats,
        `appearsSuccessful=false; finalUrl=${submitResult.finalUrl}`,
      );
    }

    writeMeta(snapshotPaths.meta, {
      ats: request.ats,
      tenant: request.tenant,
      signupUrl: request.signupUrl,
      vaultRef,
      vaultPutAt,
      filledAt,
      submittedAt: submitResult.submittedAt,
      finalUrl: submitResult.finalUrl,
      appearsSuccessful: true,
      requiresEmailVerification: submitResult.requiresEmailVerification,
    });

    recordEvent({
      kind: "signup_outcome",
      source: "signup",
      ats: request.ats,
      tenant: request.tenant,
      severity: "info",
      note:
        `account_created; finalUrl=${submitResult.finalUrl}; ` +
        `requiresEmailVerification=${submitResult.requiresEmailVerification}`,
      snapshotDir: snapshotPaths.dir,
    });

    const result: SignupResult = {
      vaultRef,
      accountCreatedAt: submitResult.submittedAt,
      requiresEmailVerification: submitResult.requiresEmailVerification,
      finalUrl: submitResult.finalUrl,
      snapshotDir: snapshotPaths.dir,
    };
    return result;
  } finally {
    await tab.close().catch(() => undefined);
  }
}

async function defaultVaultWriter(
  key: string,
  email: string,
  passwordOverride: string | undefined,
): Promise<{ vaultRef: string; password: string }> {
  if (passwordOverride && passwordOverride.length > 0) {
    await vaultPut(key, email, passwordOverride);
    return { vaultRef: key, password: passwordOverride };
  }
  const password = await vaultGenerate(key, email);
  return { vaultRef: key, password };
}

export type { SupportedSignupATS };
export { ADAPTER_TO_TELEMETRY_SIGNAL };
