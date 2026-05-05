/**
 * @auto-job/auto-signup — public type contracts.
 *
 * The shape mirrors @auto-job/auto-apply: a SignupFlow per ATS, an orchestrator
 * runSignupFlow, and a combined runSignupThenApply that hands off to email-bot
 * and the apply queue.
 */

import type { Tab } from "@auto-job/browser";
import type { HumanizedTab } from "@auto-job/humanize";

export type SupportedSignupATS = "greenhouse" | "lever" | "ashby" | "workday";

export interface SignupFormData {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  /** Optional phone — many ATS make this required on signup. */
  phone?: string;
}

export interface SignupFormSchema {
  /** Selectors discovered for each canonical field; entry omitted when missing. */
  standardFields: Partial<Record<SignupStandardField, string>>;
  /** Submit button selector. */
  submitSelector?: string;
  pageUrl: string;
}

export type SignupStandardField =
  | "email"
  | "password"
  | "passwordConfirm"
  | "firstName"
  | "lastName"
  | "phone"
  | "termsCheckbox";

export interface SignupRequest {
  /** Stable id (matches the apply-queue entry id when invoked through the queue). */
  id: string;
  ats: SupportedSignupATS;
  tenant: string;
  /** Page that opens the signup form (typically the apply URL). */
  signupUrl: string;
  /** When set: use this password. Otherwise: vaultGenerate(). */
  passwordOverride?: string;
}

export interface SignupResult {
  vaultRef: string;
  accountCreatedAt: string;
  /** True when the post-submit page contains "verify your email" or similar text. */
  requiresEmailVerification: boolean;
  /** Hint passed to the email-bot to find the right verification email. */
  expectedFromHostPattern?: string;
  /** Final URL after submit. */
  finalUrl: string;
  /** Snapshot directory (gitignored). */
  snapshotDir: string;
}

export interface SignupSubmitOptions {
  /** Must be the literal boolean true. Otherwise: SignupSubmitNotPermittedError. */
  allowSubmit?: boolean;
}

export interface SignupSubmitResult {
  submittedAt: string;
  finalUrl: string;
  appearsSuccessful: boolean;
  requiresEmailVerification: boolean;
}

export interface SignupFlow {
  ats: SupportedSignupATS;
  detectsUrl(url: string): boolean;
  identifyForm(tab: Tab): Promise<SignupFormSchema>;
  fillForm(tab: HumanizedTab, schema: SignupFormSchema, data: SignupFormData): Promise<void>;
  submit(tab: HumanizedTab, opts: SignupSubmitOptions): Promise<SignupSubmitResult>;
}

export interface SignupQuotaPolicy {
  total_per_week: number;
  per_ats_per_week: Record<string, number>;
}

export const DISABLED_SIGNUP_QUOTA: SignupQuotaPolicy = {
  total_per_week: 0,
  per_ats_per_week: {},
};
