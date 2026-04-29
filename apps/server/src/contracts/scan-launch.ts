// apps/server/src/contracts/scan-launch.ts
/**
 * Wire format for the dashboard scan launcher.
 * Mirrored in web/scan-runner.mjs (catalog table) and the dashboard JS.
 */

export type ScanRunnerId =
  | "fake"
  | "real-claude"
  | "real-codex"
  | "real-openrouter"
  | "discovery-only";

export interface ScanInputField {
  /** Form field id, also the key used in run requests. */
  id: string;
  /** Visible label. */
  label: string;
  type: "text" | "url" | "number" | "checkbox";
  /** Default value rendered in the form. */
  default?: string | number | boolean;
  /** Optional help text rendered under the field. */
  help?: string;
  /** True when the field must be non-empty before Run is enabled. */
  required?: boolean;
}

export interface ScanCatalogEntry {
  /** Stable id, e.g. "linkedin-scan". Matches modes/*-scan.md filename without the .md. */
  id: string;
  /** Card title, e.g. "LinkedIn jobs". */
  label: string;
  /** One-line description. */
  description: string;
  /** package.json script name, e.g. "linkedin-scan". */
  npmScript: string;
  /** Primary runners — rendered as the main runner row. */
  runners: ScanRunnerId[];
  /** Optional advanced runners — rendered behind a small "Advanced" toggle.
   *  Today only "discovery-only" lives here for non-gmail/builtin/indeed scans. */
  advancedRunners?: ScanRunnerId[];
  /** Default selected runner (must be in `runners`, never in `advancedRunners`). */
  defaultRunner: ScanRunnerId;
  /** Input fields rendered as a form. */
  inputs: ScanInputField[];
  /** Last-result summary for the badge, or null when no runs exist.
   *  Merge of (a) data/scan-runs/*-summary.json and (b) in-memory job registry,
   *  whichever is more recent. Registry wins on crashes that prevent the script
   *  from writing its own summary file. */
  lastRun: ScanLastRun | null;
}

export interface ScanLastRun {
  startedAt: string; // ISO
  finishedAt: string | null;
  exitCode: number | null;
  status: "ok" | "failed" | "running";
  summaryPath: string | null;
}

export interface ScanRunRequest {
  skillId: string;
  runner: ScanRunnerId;
  inputs: Record<string, string | number | boolean>;
}

export interface ScanRunResponse {
  jobId: string;
  startedAt: string;
}

export interface ScanJobEvent {
  ts: string;
  type: "stdout" | "stderr" | "end";
  line?: string;
  exitCode?: number;
}
