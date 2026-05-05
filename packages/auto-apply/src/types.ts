/**
 * @auto-job/auto-apply — public type contracts.
 */

import type { Tab } from "@auto-job/browser";
import type { HumanizedTab } from "@auto-job/humanize";

/** ATS ids supported by Phase 2B. iCIMS deferred (URL pattern broken). */
export type SupportedATS = "greenhouse" | "lever" | "ashby" | "workday";

/** Person + role data used to fill any apply form. */
export interface ApplicationData {
  name: { first: string; last: string };
  email: string;
  phone: string;
  location: { city: string; state?: string; country?: string };
  links: { linkedin?: string; github?: string; portfolio?: string };
  /** Absolute path to PDF resume (must existsSync at load time). */
  resumePath: string;
  workAuthorization:
    | "us_citizen"
    | "permanent_resident"
    | "h1b"
    | "needs_sponsorship"
    | "other";
  requiresSponsorship: boolean;
  defaultCoverLetter?: string;
}

export interface FormSchemaField {
  /** Selector that found this field. */
  selector: string;
  /** Element tag (input/textarea/select). */
  tag: string;
  /** Visible label text (best-effort). */
  label: string;
  /** Field type (text/email/tel/file/...). */
  fieldType?: string;
  /** True when the field is marked required by the form. */
  required: boolean;
}

export interface FormSchema {
  /** Standard fields keyed by canonical name (firstName, lastName, email, ...). */
  standardFields: Partial<Record<StandardFieldKey, FormSchemaField>>;
  /** Anything we couldn't classify — likely custom per-job questions. */
  unknownFields: FormSchemaField[];
  /** Page URL when identification ran (for telemetry). */
  pageUrl: string;
}

export type StandardFieldKey =
  | "firstName"
  | "lastName"
  | "fullName"
  | "email"
  | "phone"
  | "city"
  | "state"
  | "country"
  | "linkedin"
  | "github"
  | "portfolio"
  | "resume"
  | "coverLetter"
  | "workAuthorization"
  | "requiresSponsorship";

export interface FillResult {
  /** Count of standard fields actually filled. */
  fieldsFilled: number;
  /** Standard field keys that the schema lacked (we couldn't fill them). */
  fieldsMissing: StandardFieldKey[];
  /** Custom/unknown fields we deliberately did NOT fill — for human review. */
  fieldsSkipped: FormSchemaField[];
  /** Filesystem path to the review snapshot directory. */
  reviewSnapshotPath: string;
  /** ISO timestamp when fill completed. */
  filledAt: string;
}

export interface SubmitOptions {
  /**
   * Must be the literal boolean `true` to enable submit. ANY other value
   * (false/undefined/"true") causes submit() to throw SubmitNotPermittedError.
   * Default behavior: submit blocked.
   */
  allowSubmit?: boolean;
}

export interface SubmitResult {
  submittedAt: string;
  /** Final URL after submit (often a confirmation page). */
  finalUrl: string;
  /** Best-effort detection of "thank you" / success indicator. */
  appearsSuccessful: boolean;
}

export interface ApplyRequest {
  /** Stable id (matches ApplyQueueEntry.id when called via runner). */
  id: string;
  ats: SupportedATS;
  jobUrl: string;
  /** Vault key (auto-job:<ats>-<tenant>) — only needed if the ATS form requires login. */
  vaultRef?: string;
}

export interface ApplyFlow<TFormData = ApplicationData> {
  ats: SupportedATS;
  detectsUrl(url: string): boolean;
  identifyForm(tab: Tab): Promise<FormSchema>;
  fillForm(
    tab: HumanizedTab,
    schema: FormSchema,
    data: TFormData,
  ): Promise<Omit<FillResult, "reviewSnapshotPath" | "filledAt">>;
  submit(tab: HumanizedTab, opts: SubmitOptions): Promise<SubmitResult>;
}
