/**
 * @auto-job/auto-apply — public exports.
 *
 * Surface:
 *   const flow = applyFlowFor("greenhouse");           // factory
 *   const data = loadApplicationData();                // profile reader
 *   const result = await runApplyFlow(ctrl, request);  // orchestrator
 *
 * Default mode: fill-only / dry-run. submit() throws SubmitNotPermittedError
 * unless { allowSubmit: true } is passed (and the runner does NOT pass it
 * in this change).
 */

export { applyFlowFor, APPLY_FLOWS } from "./registry.js";
export { runApplyFlow, type RunOptions, type RunResult } from "./run.js";
export { loadApplicationData, type LoadOptions } from "./profile.js";
export { writeReviewSnapshot, type SnapshotInputs } from "./snapshot.js";

export { greenhouseApplyFlow } from "./greenhouse/apply.js";
export { leverApplyFlow } from "./lever/apply.js";
export { ashbyApplyFlow } from "./ashby/apply.js";
export { workdayApplyFlow } from "./workday/apply.js";

export type {
  ApplicationData,
  ApplyFlow,
  ApplyRequest,
  FillResult,
  FormSchema,
  FormSchemaField,
  StandardFieldKey,
  SubmitOptions,
  SubmitResult,
  SupportedATS,
} from "./types.js";

export {
  SubmitNotPermittedError,
  MissingProfileFieldError,
  MissingResumeError,
  UnsupportedATSError,
  FormFillError,
  DetectionSignalError,
} from "./errors.js";
