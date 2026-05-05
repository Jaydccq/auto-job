/**
 * @auto-job/risk-telemetry — Phase 5 surface.
 *
 *   recordEvent(event)
 *   recordScanResult / recordFillOutcome / recordSubmitOutcome /
 *   recordVerifyLinkOutcome / recordDetectionSignal
 *   loadEvents({ ats, kind, sinceMs })
 *   isInCooldown(ats) → { active, endsAt, reason, origin }
 *   evaluateCooldowns({ windowHours, threshold }) → { triggered, scannedEvents }
 *   recordCooldown(entry)  // manual / force
 *   loadCooldowns()
 *   analyzeForDetection(snapshot) → { signal, evidence } | null
 */

export {
  recordEvent,
  loadEvents,
  recordScanResult,
  recordFillOutcome,
  recordSubmitOutcome,
  recordVerifyLinkOutcome,
  recordDetectionSignal,
  DEFAULT_EVENTS_PATH,
  type EventOptions,
  type LoadFilter,
  type FillOutcomeOptions,
  type SubmitOutcomeOptions,
  type VerifyLinkOutcomeOptions,
  type DetectionSignalOptions,
} from "./events.js";

export {
  recordCooldown,
  loadCooldowns,
  isInCooldown,
  evaluateCooldowns,
  cooldownHoursForSignal,
  DEFAULT_COOLDOWNS_PATH,
  type CooldownOptions,
  type IsInCooldownOptions,
  type CooldownInfo,
  type EvaluateOptions,
  type EvaluateResult,
} from "./cooldowns.js";

export {
  analyzeForDetection,
  type AnalyzeSnapshot,
  type DetectionResult,
} from "./analyze.js";

export {
  DEFAULT_SIGNAL_COOLDOWNS,
  type CooldownEntry,
  type DetectionSignal,
  type EventKind,
  type EventSource,
  type RiskEvent,
  type RiskSeverity,
  type SignalCooldownConfig,
} from "./types.js";
