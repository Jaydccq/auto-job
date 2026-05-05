/**
 * @auto-job/email-bot — Phase 3 surface.
 *
 *   const allowlist = loadAllowlist();
 *   const result = await processNextVerificationEmail(controller, { allowlist });
 *
 * The bot processes ONE email per call (intentional: easier to reason about,
 * each call gets its own snapshot, the runner is the loop).
 */

export { loadAllowlist, type Allowlist, type AllowlistEntry, type LoadOptions } from "./allowlist.js";
export { extractVerificationLink } from "./extract-link.js";
export { GmailClient, extractBody, headerValue, type GmailMessage, type GmailOptions } from "./gmail.js";
export {
  buildPollQuery,
  pollVerificationEmails,
  PROCESSED_LABEL_NAME,
  type PendingVerification,
  type PollOptions,
} from "./poll.js";
export {
  verifyLink,
  MIN_READING_DELAY_MS,
  type VerifyLinkOptions,
  type VerifyLinkResult,
} from "./verify-link.js";
export {
  processNextVerificationEmail,
  runOne,
  type RunOptions,
  type RunOutcome,
} from "./run.js";

export {
  EmailBotDisabledError,
  LinkHostNotAllowedError,
  MultiLinkAmbiguousError,
  ConfirmButtonNotFoundError,
  GmailAuthError,
} from "./errors.js";
