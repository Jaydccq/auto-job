/**
 * @auto-job/auto-signup — Phase 4 surface.
 *
 *   verifyRiskAck()                                — gate primitive
 *   signupGate({ats, policy, history})              — chain: risk-ack + quota + cooldown
 *   runSignupFlow(controller, request, opts)        — vault-first orchestrator
 *   signupFlowFor(ats)                              — per-ATS adapter factory
 *
 * Phase 4 is gated by RISK_ACK.md — without a signed file, runSignupFlow
 * refuses. See RISK_ACK.example.md in the repo root for the template.
 */

export {
  greenhouseSignupFlow,
  leverSignupFlow,
  ashbySignupFlow,
  workdaySignupFlow,
  signupFlowFor,
  SIGNUP_FLOWS,
} from "./adapters.js";

export { verifyRiskAck, hasValidRiskAck, type RiskAckOptions, type RiskAckInfo } from "./risk-ack.js";

export {
  signupGate,
  type GateOptions,
  type GateInput,
  type SignupHistoryEntry,
} from "./signup-gate.js";

export { runSignupFlow, type RunSignupOptions } from "./run.js";

export {
  RiskAckMissingError,
  SignupQuotaExceededError,
  SignupCooldownError,
  RequiresPhoneVerificationError,
  SignupSubmitFailedError,
  UnsupportedSignupATSError,
  SignupSubmitNotPermittedError,
} from "./errors.js";

export {
  type SignupFlow,
  type SignupFormData,
  type SignupFormSchema,
  type SignupRequest,
  type SignupResult,
  type SignupSubmitOptions,
  type SignupSubmitResult,
  type SupportedSignupATS,
  type SignupQuotaPolicy,
  DISABLED_SIGNUP_QUOTA,
} from "./types.js";

export {
  makeSignupSnapshotDir,
  type SnapshotPaths,
  type MetaInput,
} from "./snapshot.js";
