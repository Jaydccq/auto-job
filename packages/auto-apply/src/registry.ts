/**
 * applyFlowFor(ats) factory — dispatches to the correct adapter, throws for unsupported.
 */

import { UnsupportedATSError } from "./errors.js";
import { ashbyApplyFlow } from "./ashby/apply.js";
import { greenhouseApplyFlow } from "./greenhouse/apply.js";
import { leverApplyFlow } from "./lever/apply.js";
import { workdayApplyFlow } from "./workday/apply.js";
import type { ApplyFlow, SupportedATS } from "./types.js";

export const APPLY_FLOWS: Record<SupportedATS, ApplyFlow> = {
  greenhouse: greenhouseApplyFlow,
  lever: leverApplyFlow,
  ashby: ashbyApplyFlow,
  workday: workdayApplyFlow,
};

export function applyFlowFor(ats: string): ApplyFlow {
  if (ats in APPLY_FLOWS) {
    return APPLY_FLOWS[ats as SupportedATS];
  }
  throw new UnsupportedATSError(ats);
}
