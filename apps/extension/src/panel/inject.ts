/**
 * inject.ts — floating panel injected into the page via content script.
 *
 * Creates a shadow-DOM container with the auto-job panel UI.
 * Features:
 *   • Draggable by the header bar
 *   • Persists across focus changes (it's part of the page DOM)
 *   • Toggled by toolbar icon click (message from background)
 *   • Remembers position via chrome.storage.local
 *   • Shadow DOM isolates styles from the host page
 *
 * All communication with the bridge goes through chrome.runtime messages
 * to the background service worker, same as the old popup.
 */

import type { AutofillProfile, AutofillProfileField, JobPhase } from "../contracts/bridge-wire.js";
import {
  type BridgePreset,
  PHASE_ORDER,
  PHASE_LABEL,
  pct,
  presetDisplayName,
  presetFromHealth,
  scoreColor,
} from "../shared/utils.js";
import { AUTOFILL_CONTROL_SELECTOR } from "../shared/autofill-option-scoring.js";
import {
  autofillInputKind,
  controlLabel,
  isAutofillCandidate,
  normalizeAutofillLabel,
  type AutofillControl,
} from "../shared/autofill-dom.js";
import {
  bestSelectOption,
  checkboxShouldBeChecked,
  optionMatchesAnswer,
  resumeFileControls,
  scanAutofillMatches,
  type AutofillMatch,
} from "../shared/autofill-matcher.js";

declare const __EXTENSION_VERSION__: string;
const PANEL_ID = "auto-job-panel-root";
const STORAGE_POS_KEY = "careerOps.panelPos";
const PANEL_DEFAULT_TOP = 80;
const PANEL_DEFAULT_RIGHT = 20;
const PANEL_FALLBACK_WIDTH = 380;
const PANEL_MIN_VISIBLE = 100;
const EXTENSION_CONTEXT_INVALIDATED_CODE = "EXTENSION_CONTEXT_INVALIDATED";
const EXTENSION_CONTEXT_INVALIDATED_MESSAGE =
  "Extension was reloaded. Refresh this page and click the extension again.";

function getOrCreatePanel(): { root: HTMLElement; shadow: ShadowRoot; existed: boolean } {
  const existing = document.getElementById(PANEL_ID);
  if (existing) {
    return { root: existing, shadow: existing.shadowRoot!, existed: true };
  }

  const root = document.createElement("div");
  root.id = PANEL_ID;
  root.style.cssText = "all:initial; position:fixed; z-index:2147483647; top:80px; right:20px;";
  const shadow = root.attachShadow({ mode: "open" });
  document.body.appendChild(root);
  return { root, shadow, existed: false };
}

function parsePixelValue(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}

function keepPanelInViewport(root: HTMLElement): void {
  const rect = root.getBoundingClientRect();
  const panelWidth = rect.width || PANEL_FALLBACK_WIDTH;
  const panelHeight = rect.height || PANEL_MIN_VISIBLE;
  const maxLeft = Math.max(0, window.innerWidth - Math.min(PANEL_MIN_VISIBLE, panelWidth));
  const maxTop = Math.max(0, window.innerHeight - Math.min(PANEL_MIN_VISIBLE, panelHeight));
  const currentLeft = parsePixelValue(root.style.left)
    ?? Math.max(0, window.innerWidth - panelWidth - PANEL_DEFAULT_RIGHT);
  const currentTop = parsePixelValue(root.style.top) ?? PANEL_DEFAULT_TOP;

  root.style.left = clamp(currentLeft, 0, maxLeft) + "px";
  root.style.top = clamp(currentTop, 0, maxTop) + "px";
  root.style.right = "auto";
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }
  return String(error);
}

function isExtensionContextInvalidated(error: unknown): boolean {
  return errorMessage(error).toLowerCase().includes("extension context invalidated");
}

function runtimeErrorResponse(error: unknown): { ok: false; error: { code: string; message: string } } {
  if (isExtensionContextInvalidated(error)) {
    return {
      ok: false,
      error: {
        code: EXTENSION_CONTEXT_INVALIDATED_CODE,
        message: EXTENSION_CONTEXT_INVALIDATED_MESSAGE,
      },
    };
  }
  return {
    ok: false,
    error: {
      code: "EXTENSION_RUNTIME_ERROR",
      message: errorMessage(error),
    },
  };
}

function extensionContextInvalidatedResponse(): { ok: false; error: { code: string; message: string } } {
  return {
    ok: false,
    error: {
      code: EXTENSION_CONTEXT_INVALIDATED_CODE,
      message: EXTENSION_CONTEXT_INVALIDATED_MESSAGE,
    },
  };
}

function isExtensionRuntimeAvailable(): boolean {
  try {
    return Boolean(chrome.runtime?.id);
  } catch {
    return false;
  }
}

function addRuntimeMessageListener(listener: Parameters<typeof chrome.runtime.onMessage.addListener>[0]): void {
  if (!isExtensionRuntimeAvailable()) return;
  try {
    chrome.runtime.onMessage.addListener(listener);
  } catch (error) {
    if (!isExtensionContextInvalidated(error)) console.error(error);
  }
}

function newGradSkipReasonLabel(reason: string): string {
  switch (reason) {
    case "pipeline_threshold":
      return "below pipeline threshold";
    case "detail_value_threshold":
      return "below detail value threshold";
    case "below_threshold":
      return "below list threshold after detail";
    case "no_sponsorship":
      return "no sponsorship";
    case "no_sponsorship_support":
      return "no sponsorship support";
    case "active_clearance_required":
    case "active_security_clearance_required":
      return "active clearance required";
    case "experience_too_high":
    case "experience_requirement_above_limit":
      return "experience too high";
    case "seniority_too_high":
      return "seniority too high";
    case "salary_below_minimum":
      return "salary below minimum";
    case "negative_title":
      return "title excluded";
    case "already_evaluated_report":
      return "already evaluated";
    case "already_in_pipeline":
      return "already in pipeline";
    default:
      return reason.replace(/_/g, " ");
  }
}

function formatNewGradSkipBreakdown(breakdown: Readonly<Record<string, number>> | undefined): string {
  if (!breakdown) return "";
  return Object.entries(breakdown)
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([reason, count]) => count + " " + newGradSkipReasonLabel(reason))
    .join(", ");
}

function buildStyles(): string {
  return `
:host {
  all: initial;
  --bg: #f4f8f3;
  --surface: #ffffff;
  --surface-raised: #eef7ef;
  --surface-soft: #f7fbf6;
  --field: #fbfdf9;
  --border: #dce7d9;
  --border-strong: #c2d2bf;
  --text: #162015;
  --muted: #5f6f5d;
  --dim: #81907e;
  --accent: #16a765;
  --accent-strong: #0f8f56;
  --accent-soft: #e3f6ea;
  --accent-ink: #ffffff;
  --lime: #79b83f;
  --ok: #16a765;
  --warn: #b7791f;
  --err: #d8463f;
  --shadow: rgba(35,55,31,0.16);
  --font: "Aptos", "Fira Sans", "IBM Plex Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  --mono: "Fira Code", "SFMono-Regular", ui-monospace, Menlo, monospace;
  --r-sm: 4px;
  --r-md: 8px;
  font-family: var(--font);
}
* { box-sizing: border-box; }

.panel-container {
  width: 380px;
  background: var(--bg);
  color: var(--text);
  border: 1px solid var(--border-strong);
  border-radius: var(--r-md);
  box-shadow: 0 22px 64px var(--shadow);
  font-size: 13px;
  font-family: var(--font);
  line-height: 1.45;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  max-height: 80vh;
  color-scheme: light;
}

.drag-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 12px;
  background: rgba(255,255,255,0.96);
  cursor: grab;
  user-select: none;
  border-bottom: 1px solid var(--border);
}
.drag-bar:active { cursor: grabbing; }
.brand-lockup { min-width: 0; }
.brand-kicker {
  color: var(--lime);
  font-family: var(--mono);
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 0.14em;
  line-height: 1.1;
  text-transform: uppercase;
}
.drag-bar h1 {
  margin: 2px 0 0;
  color: var(--text);
  font-size: 15px;
  font-weight: 760;
  letter-spacing: 0;
  line-height: 1.1;
}
.drag-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.health {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 24px;
  padding: 3px 8px;
  color: var(--muted);
  background: var(--surface-soft);
  border: 1px solid var(--border);
  border-radius: 999px;
  font-size: 10px;
  box-shadow: 0 1px 2px rgba(35,55,31,0.08);
}
.health .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--dim); }
.health[data-state="ok"] .dot { background: var(--ok); }
.health[data-state="bad"] .dot { background: var(--err); }
.health[data-state="warn"] .dot { background: var(--warn); }

.close-btn {
  width: 24px;
  height: 24px;
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--r-sm);
  color: var(--muted);
  cursor: pointer;
  font-size: 16px;
  line-height: 1;
  padding: 0;
  transition: background 120ms ease, border-color 120ms ease, color 120ms ease;
}
.close-btn:hover { background: var(--surface-raised); border-color: var(--border); color: var(--text); }

.panel-body {
  padding: 10px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
  scrollbar-color: var(--border-strong) transparent;
}

.section {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  box-shadow: 0 8px 22px rgba(35,55,31,0.10);
}

.section-title {
  color: var(--dim);
  font-size: 10px;
  font-weight: 760;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.hidden { display: none !important; }

.capture-url {
  color: var(--muted);
  font-size: 11px;
  word-break: break-all;
  background: var(--surface-soft);
  border: 1px solid var(--border);
  border-radius: var(--r-sm);
  padding: 7px 8px;
}
.capture-title { color: var(--text); font-size: 13px; font-weight: 720; }
.capture-detection { color: var(--muted); font-size: 11px; }

.cta {
  appearance: none;
  min-height: 34px;
  background: var(--surface);
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: var(--r-sm);
  padding: 7px 10px;
  font-family: inherit;
  font-size: 12px;
  font-weight: 720;
  cursor: pointer;
  transition: background 120ms ease, border-color 120ms ease, color 120ms ease, transform 120ms ease;
}
.cta:hover {
  background: var(--surface-raised);
  border-color: var(--border-strong);
}
.cta:active {
  transform: translateY(1px);
}
.cta.primary {
  background: var(--accent);
  color: var(--accent-ink);
  border-color: var(--accent);
  box-shadow: 0 8px 18px rgba(22,167,101,0.22);
}
.cta.primary:hover {
  background: var(--accent-strong);
  border-color: var(--accent-strong);
}
.cta:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
}

.job-id { color: var(--dim); font-family: var(--mono); font-size: 11px; }
.phase-list {
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 12px;
  list-style: none;
}
.phase-list li {
  color: var(--muted);
  border-left: 2px solid var(--border);
  padding: 3px 0 3px 8px;
}
.phase-list li.active { color: var(--text); border-left-color: var(--accent); font-weight: 650; }
.phase-list li.completed { color: var(--ok); border-left-color: var(--ok); }
.phase-list li.failed { color: var(--err); border-left-color: var(--err); }

.result { font-size: 13px; font-weight: 500; }
.result .score { color: var(--accent); font-weight: 700; font-variant-numeric: tabular-nums; }
.result-tldr {
  color: var(--muted);
  font-size: 11px;
  line-height: 1.5;
  background: var(--surface-soft);
  border: 1px solid var(--border);
  border-radius: var(--r-sm);
  padding: 7px 8px;
}
.result-actions { display: flex; gap: 6px; flex-wrap: wrap; }

.error-code { color: var(--err); font-family: var(--mono); font-size: 11px; }
.error-message { font-size: 12px; }
.muted-body {
  margin: 0;
  color: var(--muted);
  font-size: 12px;
}

.offline-banner {
  background: #fff4f2;
  border: 1px solid #f0b8b2;
  border-radius: var(--r-sm);
  padding: 8px 10px;
  color: var(--err);
  font-size: 11px;
}
.offline-banner code { color: var(--text); }

.setup-hint { margin: 0; color: var(--muted); font-size: 11px; line-height: 1.5; }
.setup-cmd {
  background: var(--field);
  border: 1px solid var(--border);
  border-radius: 3px;
  color: var(--accent);
  font-family: var(--mono);
  padding: 2px 6px;
}
.setup-input {
  appearance: none;
  width: 100%;
  min-height: 34px;
  background: var(--field);
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: var(--r-sm);
  padding: 8px 10px;
  font-family: var(--mono);
  font-size: 11px;
  outline: none;
  transition: border-color 120ms ease, box-shadow 120ms ease;
}
.setup-input:focus { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }

.mode-summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.mode-current {
  color: var(--text);
  font-family: var(--mono);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.02em;
}
.mode-current[data-state="offline"] { color: var(--err); }
.mode-current[data-state="unknown"] { color: var(--muted); }

.recent-list { display: flex; flex-direction: column; gap: 3px; }
.recent-empty { color: var(--muted); font-size: 11px; }
.recent-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  border-bottom: 1px solid var(--border);
  border-radius: var(--r-sm);
  cursor: pointer;
  font-size: 11px;
  padding: 7px 8px;
  transition: background 120ms ease, color 120ms ease;
}
.recent-item:last-child { border-bottom: none; }
.recent-item:hover { background: var(--surface-soft); }
.recent-item:hover .company { color: var(--accent-strong); }
.recent-item .company { color: var(--text); font-weight: 650; }
.recent-item .role { color: var(--muted); margin-left: 4px; }
.recent-item .score {
  color: var(--accent);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.scanner-status,
.metric,
.help-text,
.fine-print {
  color: var(--muted);
  font-size: 11px;
  line-height: 1.45;
}
.scanner-status {
  min-height: 20px;
  background: var(--surface-soft);
  border: 1px solid var(--border);
  border-radius: var(--r-sm);
  padding: 7px 8px;
}
.metric.ok { color: var(--ok); }
.metric.warn { color: var(--warn); }

.keyword-search {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.source-card {
  background: var(--surface-soft);
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  padding: 8px;
}
.source-card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
}
.source-badge {
  display: inline-flex;
  align-items: center;
  min-height: 22px;
  padding: 3px 7px;
  background: var(--accent-soft);
  border: 1px solid #b9e8cb;
  border-radius: 999px;
  color: var(--accent-strong);
  font-family: var(--mono);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.04em;
}
.source-meta {
  color: var(--dim);
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}
.keyword-row { display: flex; gap: 6px; margin-bottom: 6px; }
.keyword-row .setup-input { flex: 1; min-width: 0; }
.keyword-chips { display: flex; gap: 5px; flex-wrap: wrap; margin-bottom: 7px; }
.keyword-chip {
  min-height: 28px;
  padding: 4px 7px;
  color: var(--muted);
  font-size: 11px;
  font-weight: 600;
}

.newgrad-promoted-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 4px;
  border-top: 1px solid var(--border);
  padding-top: 6px;
}
.newgrad-promoted-item {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  background: var(--surface-soft);
  border: 1px solid transparent;
  border-radius: var(--r-sm);
  font-size: 11px;
  line-height: 1.35;
  padding: 6px;
}
.newgrad-promoted-item a {
  color: var(--text);
  text-decoration: none;
  word-break: break-word;
}
.newgrad-promoted-item a:hover { color: var(--accent-strong); }
.newgrad-promoted-item .meta { color: var(--muted); }
.newgrad-promoted-item .score {
  color: var(--accent);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.newgrad-eval-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 6px;
}
.newgrad-eval-item {
  background: var(--surface-soft);
  border: 1px solid var(--border);
  border-radius: var(--r-sm);
  padding: 6px 8px;
  font-size: 11px;
}
.newgrad-eval-item .top {
  display: flex;
  justify-content: space-between;
  gap: 8px;
}
.newgrad-eval-item .title { color: var(--text); font-weight: 650; }
.newgrad-eval-item .phase { color: var(--accent); white-space: nowrap; }
.newgrad-eval-item .meta { color: var(--muted); margin-top: 2px; }
.newgrad-eval-item[data-status="completed"] .phase { color: var(--ok); }
.newgrad-eval-item[data-status="failed"] .phase { color: var(--err); }

.scan-results,
.pending-block,
.enrich-results {
  display: flex;
  flex-direction: column;
  gap: 5px;
  margin-top: 2px;
}
.action-row {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.autofill-summary {
  background: var(--surface-soft);
  border: 1px solid var(--border);
  border-radius: var(--r-sm);
  color: var(--muted);
  font-size: 11px;
  padding: 7px 8px;
}
.autofill-list {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}
.autofill-chip {
  background: var(--accent-soft);
  border: 1px solid var(--border);
  border-radius: 999px;
  color: var(--text);
  font-size: 10px;
  font-weight: 650;
  line-height: 1.2;
  padding: 4px 7px;
}
.autofill-chip[data-confidence="low"] {
  background: var(--surface-soft);
  color: var(--muted);
}
.footer {
  color: var(--dim);
  font-size: 10px;
  padding: 4px 0;
  text-align: center;
}
:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
@media (prefers-reduced-motion: reduce) {
  .cta,
  .close-btn,
  .recent-item {
    transition: none;
  }
}
`;
}

function buildHTML(): string {
  return `
<div class="panel-container">
  <div class="drag-bar" id="drag-bar">
    <div class="brand-lockup">
      <div class="brand-kicker">auto-job</div>
      <h1>Job assistant</h1>
    </div>
    <div class="drag-actions">
      <div class="health" id="health" data-state="unknown">
        <span class="dot"></span>
        <span class="label">checking…</span>
      </div>
      <button class="close-btn" id="close-btn" title="Close">&times;</button>
    </div>
  </div>
  <div class="panel-body">
    <div id="offline-banner" class="offline-banner hidden">
      Bridge not reachable. Run: <code>bun run server</code>
    </div>
    <div id="mode-panel" class="section">
      <div class="mode-summary">
        <div class="section-title">Bridge</div>
        <div class="mode-current" id="mode-current" data-state="unknown" aria-live="polite">Mode: unknown</div>
      </div>
    </div>
    <div id="setup" class="section hidden">
      <div class="section-title">First-time setup</div>
      <p class="setup-hint">Paste your bridge token:<br/><code class="setup-cmd">cat &lt;repo&gt;/apps/server/.bridge-token</code></p>
      <input type="password" id="setup-token" class="setup-input" placeholder="paste token…" />
      <button class="cta primary" id="setup-save-btn">Save token</button>
    </div>
    <div id="capture" class="section hidden">
      <div class="section-title">Detected page</div>
      <div class="capture-url" id="capture-url"></div>
      <div class="capture-title" id="capture-title"></div>
      <div class="capture-detection" id="capture-detection"></div>
      <button class="cta primary" id="evaluate-btn">Evaluate this job</button>
    </div>
    <div id="not-detected" class="section hidden">
      <div class="section-title">No job posting detected</div>
      <p class="muted-body">This page doesn't look like a job posting. If it is, you can still evaluate it.</p>
      <button class="cta" id="evaluate-anyway-btn">Evaluate anyway</button>
    </div>
    <div id="autofill" class="section hidden">
      <div class="section-title">Application autofill</div>
      <div class="autofill-summary" id="autofill-summary">Load your local profile to preview fillable fields.</div>
      <div class="autofill-list" id="autofill-list"></div>
      <div class="action-row">
        <button class="cta" id="autofill-refresh-btn">Preview fields</button>
        <button class="cta primary" id="autofill-fill-btn" disabled>Autofill current page</button>
      </div>
      <div class="fine-print">
        Click-to-fill only. It may attach your configured resume, but never submits or advances applications.
      </div>
    </div>
    <div id="running" class="section hidden">
      <div class="section-title">Running evaluation</div>
      <div class="job-id" id="job-id"></div>
      <ol class="phase-list" id="phase-list"></ol>
    </div>
    <div id="done" class="section hidden">
      <div class="section-title">Evaluation complete</div>
      <div class="result" id="result-header"></div>
      <div class="result-tldr" id="result-tldr"></div>
      <div class="result-actions">
        <button class="cta" id="open-report-btn">Open report</button>
        <button class="cta" id="copy-summary-btn">Copy summary</button>
        <button class="cta" id="merge-tracker-btn">Save to tracker</button>
      </div>
    </div>
    <div id="error" class="section hidden">
      <div class="section-title">Error</div>
      <div class="error-code" id="error-code"></div>
      <div class="error-message" id="error-message"></div>
      <button class="cta" id="retry-btn">Try again</button>
    </div>
    <div id="newgrad-scan" class="section hidden">
      <div id="ng-scan-title" class="section-title">newgrad-jobs.com Scanner</div>
      <div id="ng-status" class="scanner-status"></div>
      <div id="ng-builtin-search" class="keyword-search hidden">
        <div class="source-card">
          <div class="source-card-head">
            <span class="source-badge">Built In</span>
            <span class="source-meta">All locations</span>
          </div>
          <div class="keyword-row">
            <input id="ng-builtin-keyword" class="setup-input" value="Software Engineering" />
            <button class="cta" id="ng-builtin-open-btn">Open</button>
          </div>
          <div class="keyword-chips">
            <button class="cta keyword-chip" data-builtin-keyword="Software Engineering">Software Engineering</button>
            <button class="cta keyword-chip" data-builtin-keyword="Software Engineer">Software Engineer</button>
            <button class="cta keyword-chip" data-builtin-keyword="Full Stack Engineer">Full Stack</button>
            <button class="cta keyword-chip" data-builtin-keyword="Backend Engineer">Backend</button>
            <button class="cta keyword-chip" data-builtin-keyword="AI Engineer">AI Engineer</button>
            <button class="cta keyword-chip" data-builtin-keyword="Machine Learning Engineer">ML Engineer</button>
          </div>
          <div class="help-text">
            Opens Built In engineering results across all locations. Adjust filters there, then scan when ready.
          </div>
        </div>
      </div>
      <button class="cta primary" id="ng-scan-btn">Scan & Score</button>
      <div id="ng-results" class="scan-results hidden">
        <div id="ng-promoted" class="metric ok"></div>
        <div id="ng-filtered" class="metric"></div>
        <div id="ng-deduped" class="metric"></div>
        <div id="ng-promoted-list" class="newgrad-promoted-list hidden"></div>
        <button class="cta primary" id="ng-enrich-btn">Enrich detail pages</button>
      </div>
      <div id="ng-pending" class="pending-block">
        <div class="section-title">Pending candidates</div>
        <div id="ng-pending-status" class="metric">Not loaded</div>
        <div id="ng-pending-list" class="newgrad-promoted-list hidden"></div>
        <div class="action-row">
          <button class="cta" id="ng-load-pending-btn">Load pending</button>
          <button class="cta hidden" id="ng-warm-pending-btn">Warm legacy cache</button>
          <button class="cta primary hidden" id="ng-evaluate-pending-btn">Evaluate all pending</button>
        </div>
      </div>
      <div id="ng-enrich-progress" class="metric hidden"></div>
      <div id="ng-enrich-results" class="enrich-results hidden">
        <div id="ng-added" class="metric ok"></div>
        <div id="ng-skipped" class="metric"></div>
        <div id="ng-eval-progress" class="metric hidden"></div>
        <div id="ng-eval-list" class="newgrad-eval-list hidden"></div>
        <div class="fine-print">
          Promoted rows are evaluated directly and synced to the tracker automatically.
        </div>
      </div>
    </div>
    <div id="recent" class="section">
      <div class="section-title">Recent evaluations</div>
      <div class="recent-list" id="recent-list">
        <div class="recent-empty">No evaluations yet</div>
      </div>
    </div>
    <div class="footer">v${__EXTENSION_VERSION__} · Alt+Shift+C to toggle</div>
  </div>
</div>`;
}

/* -------------------------------------------------------------------------- */
/*  Panel controller (mirrors popup/index.ts logic)                            */
/* -------------------------------------------------------------------------- */

function initPanel(shadow: ShadowRoot, root: HTMLElement): void {
  const $ = (id: string) => shadow.getElementById(id)!;

  const dragBar = $("drag-bar");
  const closeBtn = $("close-btn");
  const healthEl = $("health");
  const offlineBanner = $("offline-banner");
  const modeCurrentEl = $("mode-current");
  const setupEl = $("setup");
  const setupTokenInput = $("setup-token") as HTMLInputElement;
  const setupSaveBtn = $("setup-save-btn") as HTMLButtonElement;
  const captureEl = $("capture");
  const notDetectedEl = $("not-detected");
  const autofillEl = $("autofill");
  const autofillSummaryEl = $("autofill-summary");
  const autofillListEl = $("autofill-list");
  const autofillRefreshBtn = $("autofill-refresh-btn") as HTMLButtonElement;
  const autofillFillBtn = $("autofill-fill-btn") as HTMLButtonElement;
  const runningEl = $("running");
  const doneEl = $("done");
  const errorEl = $("error");
  const captureUrlEl = $("capture-url");
  const captureTitleEl = $("capture-title");
  const captureDetectionEl = $("capture-detection");
  const evaluateBtn = $("evaluate-btn") as HTMLButtonElement;
  const jobIdEl = $("job-id");
  const phaseListEl = $("phase-list");
  const resultHeaderEl = $("result-header");
  const resultTldrEl = $("result-tldr");
  const openReportBtn = $("open-report-btn") as HTMLButtonElement;
  const mergeTrackerBtn = $("merge-tracker-btn") as HTMLButtonElement;
  const errorCodeEl = $("error-code");
  const errorMessageEl = $("error-message");
  const retryBtn = $("retry-btn") as HTMLButtonElement;
  const recentListEl = $("recent-list");
  const copySummaryBtn = $("copy-summary-btn") as HTMLButtonElement;
  const evaluateAnywayBtn = $("evaluate-anyway-btn") as HTMLButtonElement;
  const newgradScanEl = $("newgrad-scan");
  const ngScanTitleEl = $("ng-scan-title");
  const ngStatusEl = $("ng-status");
  const ngBuiltInSearchEl = $("ng-builtin-search");
  const ngBuiltInKeywordInput = $("ng-builtin-keyword") as HTMLInputElement;
  const ngBuiltInOpenBtn = $("ng-builtin-open-btn") as HTMLButtonElement;
  const ngScanBtn = $("ng-scan-btn") as HTMLButtonElement;
  const ngResultsEl = $("ng-results");
  const ngPromotedEl = $("ng-promoted");
  const ngFilteredEl = $("ng-filtered");
  const ngDedupedEl = $("ng-deduped");
  const ngPromotedListEl = $("ng-promoted-list");
  const ngEnrichBtn = $("ng-enrich-btn") as HTMLButtonElement;
  const ngEnrichProgressEl = $("ng-enrich-progress");
  const ngEnrichResultsEl = $("ng-enrich-results");
  const ngAddedEl = $("ng-added");
  const ngSkippedEl = $("ng-skipped");
  const ngEvalProgressEl = $("ng-eval-progress");
  const ngEvalListEl = $("ng-eval-list");
  const ngPendingStatusEl = $("ng-pending-status");
  const ngPendingListEl = $("ng-pending-list");
  const ngLoadPendingBtn = $("ng-load-pending-btn") as HTMLButtonElement;
  const ngWarmPendingBtn = $("ng-warm-pending-btn") as HTMLButtonElement;
  const ngEvaluatePendingBtn = $("ng-evaluate-pending-btn") as HTMLButtonElement;

  // --- Drag logic ---
  let isDragging = false;
  let dragOffsetX = 0;
  let dragOffsetY = 0;

  dragBar.addEventListener("mousedown", (e: Event) => {
    const me = e as MouseEvent;
    isDragging = true;
    dragOffsetX = me.clientX - root.offsetLeft;
    dragOffsetY = me.clientY - root.offsetTop;
    me.preventDefault();
  });

  document.addEventListener("mousemove", (e: MouseEvent) => {
    if (!isDragging) return;
    const x = Math.max(0, Math.min(e.clientX - dragOffsetX, window.innerWidth - 100));
    const y = Math.max(0, Math.min(e.clientY - dragOffsetY, window.innerHeight - 100));
    root.style.left = x + "px";
    root.style.top = y + "px";
    root.style.right = "auto";
  });

  document.addEventListener("mouseup", () => {
    if (!isDragging) return;
    isDragging = false;
    if (!isExtensionRuntimeAvailable()) return;
    try {
      chrome.storage.local.set({
        [STORAGE_POS_KEY]: { left: root.style.left, top: root.style.top },
      });
    } catch (error) {
      if (!isExtensionContextInvalidated(error)) console.error(error);
    }
  });

  // Restore saved position
  if (isExtensionRuntimeAvailable()) {
    try {
      chrome.storage.local.get(STORAGE_POS_KEY, (data) => {
        const lastError = chrome.runtime.lastError;
        if (lastError) {
          keepPanelInViewport(root);
          return;
        }
        const pos = data[STORAGE_POS_KEY];
        if (pos?.left && pos?.top) {
          root.style.left = pos.left;
          root.style.top = pos.top;
          root.style.right = "auto";
        }
        keepPanelInViewport(root);
      });
    } catch (error) {
      if (!isExtensionContextInvalidated(error)) console.error(error);
      keepPanelInViewport(root);
    }
  } else {
    keepPanelInViewport(root);
  }

  // --- Close ---
  closeBtn.addEventListener("click", () => {
    root.style.display = "none";
  });

  // --- State machine ---
  type UiState = "idle" | "setup" | "captured" | "notDetected" | "running" | "done" | "error" | "newgradScan";
  let capturedData: { url: string; title: string; pageText: string; detection: any } | null = null;
  let currentJobId: string | null = null;
  let currentResult: any = null;
  let activePort: chrome.runtime.Port | null = null;
  let currentBridgePreset: BridgePreset | null = null;
  let jobPollTimer: number | null = null;
  let batchEvaluationPollTimer: number | null = null;
  let batchEvaluationPollInFlight = false;
  let autofillProfile: AutofillProfile | null = null;
  let autofillResumeFile: File | null = null;
  let lastAutofillMatches: AutofillMatch[] = [];

  function trackerButtonLabel(result: { trackerMerged?: boolean; trackerMergeSummary?: { added?: number; updated?: number } }): string {
    if (!result?.trackerMerged) return "Save to tracker";
    const summary = result.trackerMergeSummary;
    if (!summary) return "Tracker synced";
    if ((summary.added ?? 0) > 0) return "Saved to tracker (" + summary.added + " added)";
    if ((summary.updated ?? 0) > 0) return "Saved to tracker (" + summary.updated + " updated)";
    return "Tracker already up to date";
  }

  // PHASE_ORDER, PHASE_LABEL imported from shared/utils

  function show(state: UiState): void {
    setupEl.classList.toggle("hidden", state !== "setup");
    captureEl.classList.toggle("hidden", state !== "captured");
    notDetectedEl.classList.toggle("hidden", state !== "notDetected");
    runningEl.classList.toggle("hidden", state !== "running");
    doneEl.classList.toggle("hidden", state !== "done");
    errorEl.classList.toggle("hidden", state !== "error");
    newgradScanEl.classList.toggle("hidden", state !== "newgradScan");
    if (state === "setup" || state === "running" || state === "done" || state === "error" || state === "newgradScan") {
      autofillEl.classList.add("hidden");
    }
  }

  function stopJobPolling(): void {
    if (jobPollTimer !== null) {
      window.clearInterval(jobPollTimer);
      jobPollTimer = null;
    }
  }

  function startJobPolling(jobId: string): void {
    stopJobPolling();
    jobPollTimer = window.setInterval(() => {
      void pollJobSnapshot(jobId);
    }, 4000);
  }

  function stopBatchEvaluationPolling(): void {
    if (batchEvaluationPollTimer !== null) {
      window.clearInterval(batchEvaluationPollTimer);
      batchEvaluationPollTimer = null;
    }
    batchEvaluationPollInFlight = false;
  }

  function startBatchEvaluationPolling(): void {
    if (batchEvaluationPollTimer !== null) return;
    batchEvaluationPollTimer = window.setInterval(() => {
      void pollBatchEvaluationSnapshots();
    }, 4000);
  }

  function setHealth(state: string, label: string): void {
    healthEl.dataset.state = state;
    const labelEl = healthEl.querySelector(".label");
    if (labelEl) labelEl.textContent = label;
  }

  function setOfflineBanner(message: string): void {
    offlineBanner.textContent = message;
  }

  function sendMsg(msg: any): Promise<any> {
    if (!isExtensionRuntimeAvailable()) {
      return Promise.resolve(extensionContextInvalidatedResponse());
    }
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(msg, (response) => {
          const lastError = chrome.runtime.lastError;
          if (lastError) {
            resolve(runtimeErrorResponse(lastError));
            return;
          }
          resolve(response);
        });
      } catch (error) {
        resolve(runtimeErrorResponse(error));
      }
    });
  }

  async function loadAutofillProfile(): Promise<void> {
    autofillRefreshBtn.disabled = true;
    autofillSummaryEl.textContent = "Reading local profile...";
    const res = await sendMsg({ kind: "getAutofillProfile" });
    autofillRefreshBtn.disabled = false;
    if (!res?.ok) {
      autofillSummaryEl.textContent = res?.error?.code === "UNAUTHORIZED"
        ? "Bridge token invalid. Paste the current token above."
        : (res?.error?.message ?? "Profile unavailable.");
      autofillFillBtn.disabled = true;
      return;
    }
    autofillProfile = res.result as AutofillProfile;
    renderAutofillPreview();
  }

  function renderAutofillPreview(): void {
    while (autofillListEl.firstChild) autofillListEl.removeChild(autofillListEl.firstChild);
    if (!autofillProfile) {
      autofillSummaryEl.textContent = "Load your local profile to preview fillable fields.";
      autofillFillBtn.disabled = true;
      return;
    }
    lastAutofillMatches = scanAutofillMatches(autofillProfile, document);
    const totalControls = Array.from(document.querySelectorAll(AUTOFILL_CONTROL_SELECTOR))
      .filter((el) => isAutofillCandidate(el)).length
      + resumeFileControls(document).length;
    const sourceText = autofillProfile.sources.length ? autofillProfile.sources.join(" + ") : "local profile";
    autofillSummaryEl.textContent =
      lastAutofillMatches.length > 0
        ? `${lastAutofillMatches.length}/${totalControls} empty fields matched from ${sourceText}.`
        : `No empty supported fields matched from ${sourceText}.`;
    for (const match of lastAutofillMatches.slice(0, 12)) {
      const chip = document.createElement("span");
      chip.className = "autofill-chip";
      chip.dataset.confidence = match.confidence >= 0.82 ? "high" : "low";
      chip.title = match.label;
      chip.textContent = match.field.label;
      autofillListEl.appendChild(chip);
    }
    autofillFillBtn.disabled = lastAutofillMatches.length === 0;
  }

  async function setControlValue(control: AutofillControl, field: AutofillProfileField): Promise<boolean> {
    const value = valueForControl(control, field);
    const inputKind = autofillInputKind(control);
    if (field.key === "resumeFile") {
      if (!(control instanceof HTMLInputElement) || inputKind !== "file") return false;
      const file = await loadAutofillResumeFile();
      if (!file) return false;
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);
      control.files = dataTransfer.files;
      control.dispatchEvent(new Event("input", { bubbles: true }));
      control.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    }
    if (inputKind === "button") {
      if (!optionMatchesAnswer(control, field, document)) return false;
      control.click();
      control.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    }
    if ((inputKind === "radio" || inputKind === "checkbox") && !(control instanceof HTMLInputElement)) {
      if (inputKind === "radio" && !optionMatchesAnswer(control, field, document)) return false;
      if (inputKind === "checkbox" && !checkboxShouldBeChecked(control, field, document)) return false;
      control.click();
      control.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    }
    if (control instanceof HTMLInputElement) {
      const type = control.type.toLowerCase();
      if (type === "radio") {
        if (!optionMatchesAnswer(control, field, document)) return false;
        control.checked = true;
        control.dispatchEvent(new Event("click", { bubbles: true }));
        control.dispatchEvent(new Event("change", { bubbles: true }));
        return true;
      }
      if (type === "checkbox") {
        if (!checkboxShouldBeChecked(control, field, document)) return false;
        control.checked = true;
        control.dispatchEvent(new Event("click", { bubbles: true }));
        control.dispatchEvent(new Event("change", { bubbles: true }));
        return true;
      }
    }
    if (control instanceof HTMLSelectElement) {
      const option = bestSelectOption(control, field, value);
      if (!option) return false;
      control.value = option.value;
    } else if (control instanceof HTMLInputElement && control.type.toLowerCase() === "number") {
      const numericValue = salaryNumber(value);
      if (!numericValue) return false;
      control.value = numericValue;
    } else if (control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement) {
      control.value = value;
    } else {
      return false;
    }
    control.dispatchEvent(new Event("input", { bubbles: true }));
    control.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }


  async function loadAutofillResumeFile(): Promise<File | null> {
    if (autofillResumeFile) return autofillResumeFile;
    const res = await sendMsg({ kind: "getAutofillResume" });
    if (!res?.ok) {
      autofillSummaryEl.textContent = res?.error?.message ?? "Resume unavailable.";
      return null;
    }
    const resume = res.result as { filename: string; mimeType: string; dataBase64: string };
    const bytes = Uint8Array.from(atob(resume.dataBase64), (char) => char.charCodeAt(0));
    autofillResumeFile = new File([bytes], resume.filename, { type: resume.mimeType || "application/pdf" });
    return autofillResumeFile;
  }

  function valueForControl(control: AutofillControl, field: AutofillProfileField): string {
    if (field.key === "phoneNational") return field.value.replace(/\D/g, "");
    if (field.key === "state" && !(control instanceof HTMLSelectElement)) {
      const normalized = normalizeAutofillLabel(field.value);
      const fullName = US_STATE_NAMES[normalized];
      const maxLength = control instanceof HTMLInputElement ? control.maxLength : -1;
      const label = normalizeAutofillLabel(controlLabel(control, document));
      if (maxLength > 0 && maxLength <= 2) return field.value.toUpperCase();
      if (/\b(abbrev|abbreviation|code)\b/.test(label)) return field.value.toUpperCase();
      return fullName ? titleCase(fullName) : field.value;
    }
    return field.value;
  }

  const US_STATE_NAMES: Record<string, string> = {
    al: "alabama", ak: "alaska", az: "arizona", ar: "arkansas", ca: "california",
    co: "colorado", ct: "connecticut", de: "delaware", fl: "florida", ga: "georgia",
    hi: "hawaii", id: "idaho", il: "illinois", in: "indiana", ia: "iowa",
    ks: "kansas", ky: "kentucky", la: "louisiana", me: "maine", md: "maryland",
    ma: "massachusetts", mi: "michigan", mn: "minnesota", ms: "mississippi",
    mo: "missouri", mt: "montana", ne: "nebraska", nv: "nevada", nh: "new hampshire",
    nj: "new jersey", nm: "new mexico", ny: "new york", nc: "north carolina",
    nd: "north dakota", oh: "ohio", ok: "oklahoma", or: "oregon", pa: "pennsylvania",
    ri: "rhode island", sc: "south carolina", sd: "south dakota", tn: "tennessee",
    tx: "texas", ut: "utah", vt: "vermont", va: "virginia", wa: "washington",
    wv: "west virginia", wi: "wisconsin", wy: "wyoming", dc: "district of columbia",
  };

  function titleCase(value: string): string {
    return value.replace(/\b[a-z]/g, (char) => char.toUpperCase());
  }

  function salaryNumber(value: string): string {
    const match = value.match(/\$?\s*([0-9]+(?:\.[0-9]+)?)\s*([kKmM])?/);
    if (!match) return "";
    const raw = Number(match[1]);
    if (!Number.isFinite(raw)) return "";
    const suffix = match[2]?.toLowerCase();
    const multiplier = suffix === "m" ? 1_000_000 : suffix === "k" ? 1_000 : 1;
    return String(Math.round(raw * multiplier));
  }

  async function fillAutofillMatches(): Promise<void> {
    if (!autofillProfile) return;
    lastAutofillMatches = scanAutofillMatches(autofillProfile, document);
    let filled = 0;
    let skipped = 0;
    for (const match of lastAutofillMatches) {
      if (await setControlValue(match.control, match.field)) filled += 1;
      else skipped += 1;
    }
    renderAutofillPreview();
    autofillSummaryEl.textContent = `Filled ${filled} fields. Skipped ${skipped}. Review before submitting.`;
  }

  // pct, scoreColor imported from shared/utils

  function renderModePanel(health?: any, state: "unknown" | "offline" = "unknown"): void {
    const modeLabel = currentBridgePreset
      ? "Mode: " + presetDisplayName(currentBridgePreset)
      : health?.execution?.mode
        ? "Mode: " + health.execution.mode
        : state === "offline"
          ? "Mode: offline"
          : "Mode: unknown";
    modeCurrentEl.textContent = modeLabel;
    modeCurrentEl.dataset.state = currentBridgePreset || health?.execution?.mode
      ? "ok"
      : state;
  }

  async function refreshHealth(): Promise<boolean> {
    setHealth("unknown", "checking…");
    const res = await sendMsg({ kind: "getHealth" });
    if (res?.ok) {
      setHealth("ok", "bridge " + (res.result?.bridgeVersion ?? ""));
      offlineBanner.classList.add("hidden");
      currentBridgePreset = presetFromHealth(res.result);
      renderModePanel(res.result);
      // Version mismatch warning
      try {
        const extMM = __EXTENSION_VERSION__.split(".").slice(0, 2).join(".");
        const bridgeMM = (res.result?.bridgeVersion ?? "").split(".").slice(0, 2).join(".");
        if (extMM !== bridgeMM) {
          setHealth("warn", "v" + __EXTENSION_VERSION__ + " ≠ bridge v" + res.result.bridgeVersion);
        }
      } catch { /* skip */ }
      return true;
    } else {
      const code = res?.error?.code ?? "offline";
      if (code === "UNAUTHORIZED") {
        setHealth("bad", "token");
        setOfflineBanner("Bridge is running, but the saved token is invalid. Paste the current bridge token below.");
        show("setup");
        setupTokenInput.focus();
      } else {
        setHealth("bad", code);
        setOfflineBanner("Bridge not reachable. Run: bun run server");
      }
      offlineBanner.classList.remove("hidden");
      currentBridgePreset = null;
      renderModePanel(undefined, "offline");
      return false;
    }
  }

  // Tracks the origin we're currently waiting for the user to authorize
  // in a separate permission tab. When chrome.runtime broadcasts
  // "permissionGranted" for a matching origin, we re-run capture.
  let pendingPermissionOrigin: string | null = null;

  async function runCapture(): Promise<void> {
    const res = await sendMsg({ kind: "captureActiveTab" });
    if (!res?.ok) {
      const detail = res?.error?.detail as
        | { permissionRequired?: boolean; origin?: string; label?: string }
        | undefined;
      if (detail?.permissionRequired && detail.origin) {
        renderPermissionRequired(detail.origin, detail.label ?? detail.origin);
        return;
      }
      renderError(res?.error?.code ?? "INTERNAL", res?.error?.message ?? "capture failed");
      return;
    }
    capturedData = res.result;
    renderCaptured(res.result);
  }

  function renderPermissionRequired(origin: string, label: string): void {
    pendingPermissionOrigin = origin;
    errorCodeEl.textContent = "AUTHORIZE";
    while (errorMessageEl.firstChild) errorMessageEl.removeChild(errorMessageEl.firstChild);
    const p = document.createElement("div");
    p.textContent =
      `First time using auto-job on ${label}. Chrome needs your permission before the extension can read this page.`;
    errorMessageEl.appendChild(p);
    const btn = document.createElement("button");
    btn.textContent = `Authorize ${label}`;
    btn.className = "cta primary";
    btn.style.marginTop = "10px";
    btn.addEventListener("click", () => {
      void sendMsg({ kind: "openPermissionTab", origin, label });
    });
    errorMessageEl.appendChild(btn);
    show("error");
  }

  // Listen for grant broadcast from permission.html. On match, auto-retry.
  addRuntimeMessageListener((msg) => {
    if (
      msg?.kind === "permissionGranted" &&
      typeof msg.origin === "string" &&
      pendingPermissionOrigin &&
      msg.origin === pendingPermissionOrigin
    ) {
      pendingPermissionOrigin = null;
      void runCapture();
    }
  });

  function renderCaptured(cap: any): void {
    captureUrlEl.textContent = cap.url;
    captureTitleEl.textContent = cap.title || "(no title)";
    const label = cap.detection?.label === "job_posting"
      ? "detected job posting (" + pct(cap.detection.confidence) + ")"
      : cap.detection?.label === "likely_job_posting"
        ? "likely job posting (" + pct(cap.detection.confidence) + ")"
        : "not a job posting (heuristic)";
    captureDetectionEl.textContent = label;
    captureDetectionEl.style.color = "";
    autofillEl.classList.remove("hidden");
    void loadAutofillProfile();
    if (cap.detection?.label === "not_job_posting") { show("notDetected"); return; }
    show("captured");
  }

  async function onEvaluateClick(): Promise<void> {
    if (!capturedData) return;
    evaluateBtn.disabled = true;

    // Liveness pre-check — skip silently on network error
    evaluateBtn.textContent = "Checking liveness…";
    const livenessRes = await sendMsg({ kind: "checkLiveness", url: capturedData.url });
    if (livenessRes?.ok && livenessRes.result?.status === "expired") {
      evaluateBtn.disabled = false;
      evaluateBtn.textContent = "Evaluate this job";
      captureDetectionEl.textContent = "⚠ This posting appears to be expired.";
      captureDetectionEl.style.color = "var(--err)";
      const proceed = confirm(
        "This posting appears to be expired.\n\n" +
        "Reason: " + (livenessRes.result?.reason ?? "unknown") + "\n\n" +
        "Evaluate anyway?"
      );
      if (!proceed) return;
    }

    evaluateBtn.textContent = "Starting evaluation…";
    const res = await sendMsg({
      kind: "startEvaluation",
      input: {
        url: capturedData.url,
        title: capturedData.title,
        pageText: capturedData.pageText,
        detection: capturedData.detection,
      },
    });
    evaluateBtn.disabled = false;
    evaluateBtn.textContent = "Evaluate this job";
    if (!res?.ok) { renderError(res?.error?.code ?? "INTERNAL", res?.error?.message ?? "failed"); return; }
    currentJobId = res.result.jobId;
    jobIdEl.textContent = "job " + currentJobId;
    renderPhases(res.result.initialSnapshot);
    show("running");
    subscribeToJob(currentJobId!);
    startJobPolling(currentJobId!);
  }

  function subscribeToJob(jobId: string): void {
    try {
      activePort?.disconnect();
    } catch (error) {
      if (!isExtensionContextInvalidated(error)) console.error(error);
    }
    if (!isExtensionRuntimeAvailable()) {
      renderError(EXTENSION_CONTEXT_INVALIDATED_CODE, EXTENSION_CONTEXT_INVALIDATED_MESSAGE);
      return;
    }
    try {
      const port = chrome.runtime.connect({ name: "auto-job.job" });
      activePort = port;
      port.postMessage({ jobId });
      port.onMessage.addListener((raw: any) => {
        if (raw?.channel !== "job") return;
        handleJobEvent(raw.event);
      });
    } catch (error) {
      const response = runtimeErrorResponse(error);
      renderError(response.error.code, response.error.message);
    }
  }

  function handleJobEvent(event: any): void {
    if (event.kind === "snapshot") { applyJobSnapshot(event.snapshot); return; }
    if (event.kind === "phase") { appendPhase(event.phase); return; }
    if (event.kind === "done") { stopJobPolling(); currentResult = event.result; renderDone(event.result); return; }
    if (event.kind === "failed") { stopJobPolling(); renderError(event.error.code, event.error.message); return; }
  }

  function applyJobSnapshot(snap: any): void {
    if (snap.phase === "completed" && snap.result) {
      stopJobPolling();
      currentResult = snap.result;
      renderDone(snap.result);
      return;
    }
    if (snap.phase === "failed" && snap.error) {
      stopJobPolling();
      renderError(snap.error.code, snap.error.message);
      return;
    }
    renderPhases(snap);
  }

  async function pollJobSnapshot(jobId: string): Promise<void> {
    if (currentJobId !== jobId) {
      stopJobPolling();
      return;
    }
    const res = await sendMsg({ kind: "getJob", jobId });
    if (!res?.ok) return;
    applyJobSnapshot(res.result);
  }

  async function pollBatchEvaluationSnapshots(): Promise<void> {
    if (batchEvaluationPollInFlight) return;
    if (evaluationRows.size === 0) {
      stopBatchEvaluationPolling();
      return;
    }

    const pendingJobIds = Array.from(evaluationRows.entries())
      .filter(([, job]) => job.phase !== "completed" && job.phase !== "failed")
      .map(([jobId]) => jobId);
    if (pendingJobIds.length === 0) {
      stopBatchEvaluationPolling();
      return;
    }

    batchEvaluationPollInFlight = true;
    try {
      const snapshots = await Promise.all(
        pendingJobIds.map(async (jobId) => ({
          jobId,
          response: await sendMsg({ kind: "getJob", jobId }),
        })),
      );

      for (const { jobId, response } of snapshots) {
        if (!response?.ok) continue;
        const snapshot = response.result;
        const existing = evaluationRows.get(jobId) ?? {};

        if (snapshot.phase === "completed" && snapshot.result) {
          evaluationRows.set(jobId, {
            ...existing,
            jobId,
            company: snapshot.result.company,
            role: snapshot.result.role,
            phase: "completed",
            score: snapshot.result.score,
            reportNumber: snapshot.result.reportNumber,
            reportPath: snapshot.result.reportPath,
          });
          continue;
        }

        if (snapshot.phase === "failed") {
          evaluationRows.set(jobId, {
            ...existing,
            jobId,
            phase: "failed",
            error: snapshot.error?.message ?? "evaluation failed",
          });
          continue;
        }

        evaluationRows.set(jobId, {
          ...existing,
          jobId,
          phase: snapshot.phase ?? existing.phase ?? "queued",
        });
      }

      renderEvaluationProgress();
    } finally {
      batchEvaluationPollInFlight = false;
    }
  }

  function renderPhases(snap: any): void {
    while (phaseListEl.firstChild) phaseListEl.removeChild(phaseListEl.firstChild);
    const done = new Set((snap.progress?.phases ?? []).map((p: any) => p.phase));
    for (const phase of PHASE_ORDER) {
      const li = document.createElement("li");
      li.textContent = PHASE_LABEL[phase] ?? phase;
      if (phase === snap.phase) li.className = "active";
      else if (done.has(phase)) li.className = "completed";
      phaseListEl.appendChild(li);
    }
  }

  function appendPhase(phase: string): void {
    const items = Array.from(phaseListEl.children) as HTMLLIElement[];
    const idx = PHASE_ORDER.indexOf(phase as JobPhase);
    if (idx < 0) return;
    for (let i = 0; i < PHASE_ORDER.length; i++) {
      const li = items[i];
      if (!li) continue;
      if (i === idx) li.className = "active";
      else if (i < idx) li.className = "completed";
    }
  }

  function renderDone(result: any): void {
    stopJobPolling();
    while (resultHeaderEl.firstChild) resultHeaderEl.removeChild(resultHeaderEl.firstChild);
    const b = document.createElement("strong");
    b.textContent = result.company;
    resultHeaderEl.appendChild(b);
    resultHeaderEl.appendChild(document.createTextNode(" — " + result.role));
    resultHeaderEl.appendChild(document.createElement("br"));
    const s = document.createElement("span");
    s.className = "score";
    s.textContent = result.score.toFixed(1) + "/5";
    s.style.color = scoreColor(result.score);
    resultHeaderEl.appendChild(s);
    resultHeaderEl.appendChild(document.createTextNode(" · " + result.archetype));
    resultTldrEl.textContent = result.tldr;
    mergeTrackerBtn.disabled = Boolean(result.trackerMerged);
    mergeTrackerBtn.textContent = trackerButtonLabel(result);
    show("done");
    if (result.trackerMerged) void loadRecentJobs();
  }

  function renderError(code: string, message: string): void {
    stopJobPolling();
    errorCodeEl.textContent = code;
    errorMessageEl.textContent = message;
    show("error");
  }

  async function loadRecentJobs(): Promise<void> {
    try {
      const res = await sendMsg({ kind: "getRecentJobs", limit: 8 });
      if (!res?.ok || !res.result?.rows?.length) return;
      while (recentListEl.firstChild) recentListEl.removeChild(recentListEl.firstChild);
      for (const row of res.result.rows) {
        const item = document.createElement("div");
        item.className = "recent-item";
        const left = document.createElement("span");
        const c = document.createElement("span"); c.className = "company"; c.textContent = row.company;
        const r = document.createElement("span"); r.className = "role"; r.textContent = row.role;
        left.appendChild(c); left.appendChild(r);
        const sc = document.createElement("span"); sc.className = "score"; sc.textContent = row.score;
        const numSc = parseFloat(row.score); if (!isNaN(numSc)) sc.style.color = scoreColor(numSc);
        item.appendChild(left); item.appendChild(sc);
        item.addEventListener("click", () => {
          void sendMsg({ kind: "readReport", reportNum: row.num }).then((res: any) => {
            if (res?.ok) void sendMsg({ kind: "openPath", absolutePath: res.result.path });
          });
        });
        recentListEl.appendChild(item);
      }
    } catch { /* silent */ }
  }

  // --- Newgrad scan logic ---
  type ScanSource = "newgrad" | "builtin";
  let activeScanSource: ScanSource = "newgrad";
  let storedPromotedRows: any[] = [];
  let pendingNewGradEntries: any[] = [];
  let activeEvaluationSessionId: string | null = null;
  const evaluationRows = new Map<string, any>();

  function scanSourceLabel(): string {
    return activeScanSource === "builtin" ? "Built In" : "newgrad-jobs.com";
  }

  function setScanSource(source: ScanSource): void {
    activeScanSource = source;
    ngScanTitleEl.textContent = scanSourceLabel() + " Scanner";
    ngBuiltInSearchEl.classList.toggle("hidden", source !== "builtin");
    if (source === "builtin" && !ngStatusEl.textContent.trim()) {
      ngStatusEl.textContent = "Open an all-location keyword search, then scan the visible Built In results.";
    }
  }

  function builtInKeywordSearchUrl(keyword: string): string {
    const url = new URL("https://builtin.com/jobs/hybrid/national/dev-engineering");
    url.searchParams.set("search", keyword.trim() || "Software Engineering");
    url.searchParams.set("allLocations", "true");
    return url.toString();
  }

  function syncBuiltInKeywordFromUrl(rawUrl: string): void {
    try {
      const parsed = new URL(rawUrl);
      const search = parsed.searchParams.get("search");
      if (search?.trim()) ngBuiltInKeywordInput.value = search.trim();
    } catch {
      // Keep the default keyword.
    }
  }

  function openBuiltInKeywordSearch(keyword: string): void {
    const url = builtInKeywordSearchUrl(keyword);
    window.open(url, "_blank", "noopener,noreferrer");
  }

  function clearPromotedList(): void {
    while (ngPromotedListEl.firstChild) ngPromotedListEl.removeChild(ngPromotedListEl.firstChild);
    ngPromotedListEl.classList.add("hidden");
  }

  function renderPromotedList(promoted: any[]): void {
    clearPromotedList();
    if (promoted.length === 0) return;

    for (const scored of promoted) {
      const row = scored.row ?? {};
      const item = document.createElement("div");
      item.className = "newgrad-promoted-item";

      const left = document.createElement("div");
      const link = document.createElement("a");
      link.href = row.detailUrl || row.applyUrl || "#";
      link.target = "_blank";
      link.rel = "noreferrer";
      link.textContent = (row.company ? row.company + " — " : "") + (row.title ?? "Untitled role");

      const meta = document.createElement("div");
      meta.className = "meta";
      const metaParts = [row.postedAgo, row.location, row.workModel].filter(Boolean);
      meta.textContent = metaParts.join(" · ");

      left.appendChild(link);
      if (meta.textContent) left.appendChild(meta);

      const score = document.createElement("span");
      score.className = "score";
      score.textContent = typeof scored.score === "number" ? scored.score.toFixed(1) : String(scored.score ?? "");

      item.appendChild(left);
      item.appendChild(score);
      ngPromotedListEl.appendChild(item);
    }

    ngPromotedListEl.classList.remove("hidden");
  }

  function renderPendingList(entries: any[]): void {
    while (ngPendingListEl.firstChild) ngPendingListEl.removeChild(ngPendingListEl.firstChild);
    ngPendingListEl.classList.add("hidden");
    ngWarmPendingBtn.classList.add("hidden");
    ngEvaluatePendingBtn.classList.add("hidden");

    if (entries.length === 0) return;
    for (const entry of entries) {
      const item = document.createElement("div");
      item.className = "newgrad-promoted-item";

      const left = document.createElement("div");
      const link = document.createElement("a");
      link.href = entry.url;
      link.target = "_blank";
      link.rel = "noreferrer";
      link.textContent = (entry.company ? entry.company + " — " : "") + (entry.role ?? "Untitled role");

      const meta = document.createElement("div");
      meta.className = "meta";
      meta.textContent = "pipeline line " + entry.lineNumber +
        (entry.localJdPath ? " · local cache ready" : " · legacy pending (no local cache)");

      const score = document.createElement("span");
      score.className = "score";
      score.textContent = typeof entry.score === "number" ? entry.score.toFixed(1) : String(entry.score ?? "");

      left.appendChild(link);
      left.appendChild(meta);
      item.appendChild(left);
      item.appendChild(score);
      ngPendingListEl.appendChild(item);
    }

    ngPendingListEl.classList.remove("hidden");
    const legacyCount = countLegacyPendingEntries(entries);
    if (legacyCount > 0) {
      ngWarmPendingBtn.textContent = legacyCount === 1
        ? "Warm 1 legacy cache"
        : "Warm legacy cache (" + legacyCount + ")";
      ngWarmPendingBtn.classList.remove("hidden");
    }
    ngEvaluatePendingBtn.classList.remove("hidden");
  }

  function countLegacyPendingEntries(entries: any[]): number {
    return entries.filter((entry) => !entry.localJdPath).length;
  }

  async function loadPendingNewGradEntries(): Promise<{ shown: number; total: number; legacy: number } | null> {
    ngLoadPendingBtn.disabled = true;
    ngLoadPendingBtn.textContent = "Loading...";
    const res = await sendMsg({ kind: "newgradPending", limit: 100 });
    ngLoadPendingBtn.disabled = false;
    ngLoadPendingBtn.textContent = "Load pending";

    if (!res?.ok) {
      ngPendingStatusEl.textContent = "Failed to load pending candidates: " +
        (res?.error?.message ?? "unknown error");
      return null;
    }

    pendingNewGradEntries = [...(res.result.entries ?? [])];
    const legacyCount = countLegacyPendingEntries(pendingNewGradEntries);
    ngPendingStatusEl.textContent = pendingNewGradEntries.length === 0
      ? "No pending scan candidates in pipeline.md"
      : "Found " + pendingNewGradEntries.length + " pending candidates" +
        (res.result.total > pendingNewGradEntries.length ? " (" + res.result.total + " total)" : "") +
        (legacyCount > 0 ? " · " + legacyCount + " missing local cache" : " · all locally cached");
    renderPendingList(pendingNewGradEntries);
    return {
      shown: pendingNewGradEntries.length,
      total: res.result.total ?? pendingNewGradEntries.length,
      legacy: legacyCount,
    };
  }

  async function evaluatePendingNewGradEntries(): Promise<void> {
    if (pendingNewGradEntries.length === 0) {
      await loadPendingNewGradEntries();
      if (pendingNewGradEntries.length === 0) return;
    }

    resetEvaluationProgress();
    activeEvaluationSessionId = "pending-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8);
    ngEvaluatePendingBtn.disabled = true;
    ngEvaluatePendingBtn.textContent = "Queueing pending...";
    ngEnrichResultsEl.classList.remove("hidden");
    ngAddedEl.textContent = "Queueing " + pendingNewGradEntries.length + " pending evaluations...";
    ngSkippedEl.textContent = "";

    const res = await sendMsg({
      kind: "newgradEvaluatePending",
      sessionId: activeEvaluationSessionId,
      limit: 100,
    });

    ngEvaluatePendingBtn.disabled = false;
    ngEvaluatePendingBtn.textContent = "Evaluate all pending";
    if (!res?.ok) {
      renderError(res?.error?.code ?? "INTERNAL", res?.error?.message ?? "pending evaluation failed");
      return;
    }

    const queued = res.result.queued ?? 0;
    const skipped = res.result.skipped ?? 0;
    const failed = res.result.failed ?? 0;
    ngAddedEl.textContent = "\u2713 " + queued + " pending evaluations queued";
    ngSkippedEl.textContent = "\u2717 " + skipped + " skipped, " + failed + " failed to queue";
    seedEvaluationJobs(res.result.jobs ?? []);
    await loadPendingNewGradEntries();
  }

  let activePendingBackfillSessionId: string | null = null;

  async function warmPendingNewGradCache(): Promise<void> {
    if (pendingNewGradEntries.length === 0) {
      await loadPendingNewGradEntries();
      if (pendingNewGradEntries.length === 0) return;
    }

    const legacyCount = countLegacyPendingEntries(pendingNewGradEntries);
    if (legacyCount === 0) {
      ngPendingStatusEl.textContent = "All pending candidates already have local cache";
      renderPendingList(pendingNewGradEntries);
      return;
    }

    activePendingBackfillSessionId = "pending-backfill-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8);
    ngWarmPendingBtn.disabled = true;
    ngWarmPendingBtn.textContent = "Warming legacy...";
    ngPendingStatusEl.textContent = "Warming local cache for " + legacyCount + " legacy pending candidates...";

    const res = await sendMsg({
      kind: "newgradWarmPendingCache",
      sessionId: activePendingBackfillSessionId,
      limit: 100,
    });

    activePendingBackfillSessionId = null;
    ngWarmPendingBtn.disabled = false;
    ngWarmPendingBtn.textContent = "Warm legacy cache";
    if (!res?.ok) {
      renderError(res?.error?.code ?? "INTERNAL", res?.error?.message ?? "legacy cache warm failed");
      return;
    }

    const refreshed = await loadPendingNewGradEntries();
    ngPendingStatusEl.textContent = "Warmed " + (res.result.warmed ?? 0) +
      " legacy caches · " + (res.result.skipped ?? 0) + " skipped · " +
      (res.result.failed ?? 0) + " failed" +
      (refreshed ? " · now " + refreshed.legacy + " still missing local cache" : "");
  }

  function resetEvaluationProgress(): void {
    activeEvaluationSessionId = null;
    stopBatchEvaluationPolling();
    evaluationRows.clear();
    while (ngEvalListEl.firstChild) ngEvalListEl.removeChild(ngEvalListEl.firstChild);
    ngEvalProgressEl.textContent = "";
    ngEvalProgressEl.classList.add("hidden");
    ngEvalListEl.classList.add("hidden");
  }

  function phaseLabel(phase: string): string {
    return PHASE_LABEL[phase as JobPhase] ?? phase.replace(/_/g, " ");
  }

  function renderEvaluationProgress(summary?: { total?: number; completed?: number; failed?: number }): void {
    const jobs = Array.from(evaluationRows.values());
    const total = summary?.total ?? jobs.length;
    const completed = summary?.completed ?? jobs.filter((job) => job.phase === "completed").length;
    const failed = summary?.failed ?? jobs.filter((job) => job.phase === "failed").length;
    if (total === 0) return;

    ngEvalProgressEl.textContent = "Evaluation progress: " + completed + "/" + total +
      " completed, " + failed + " failed";
    ngEvalProgressEl.classList.remove("hidden");

    while (ngEvalListEl.firstChild) ngEvalListEl.removeChild(ngEvalListEl.firstChild);
    for (const job of jobs) {
      const item = document.createElement("div");
      item.className = "newgrad-eval-item";
      item.dataset.status = job.phase === "completed" || job.phase === "failed" ? job.phase : "running";

      const top = document.createElement("div");
      top.className = "top";
      const title = document.createElement("span");
      title.className = "title";
      title.textContent = (job.company ? job.company + " — " : "") + (job.role ?? "Untitled role");
      const phase = document.createElement("span");
      phase.className = "phase";
      phase.textContent = phaseLabel(job.phase ?? job.status ?? "queued");
      top.appendChild(title);
      top.appendChild(phase);

      const meta = document.createElement("div");
      meta.className = "meta";
      const metaParts = [];
      if (typeof job.score === "number") metaParts.push("Score " + job.score.toFixed(1) + "/5");
      if (typeof job.reportNumber === "number") metaParts.push("Report #" + String(job.reportNumber).padStart(3, "0"));
      if (job.error) metaParts.push(job.error);
      meta.textContent = metaParts.join(" · ");

      item.appendChild(top);
      if (meta.textContent) item.appendChild(meta);
      ngEvalListEl.appendChild(item);
    }
    ngEvalListEl.classList.remove("hidden");

    if (total > 0 && completed + failed >= total) {
      stopBatchEvaluationPolling();
      activeEvaluationSessionId = null;
      void loadRecentJobs();
    }
  }

  function seedEvaluationJobs(jobs: any[]): void {
    for (const job of jobs) {
      const existing = evaluationRows.get(job.jobId) ?? {};
      evaluationRows.set(job.jobId, {
        ...job,
        ...existing,
        phase: existing.phase ?? (job.status === "failed" ? "failed" : "queued"),
      });
    }
    renderEvaluationProgress({ total: jobs.length });
    if (jobs.some((job) => job.status !== "failed")) {
      startBatchEvaluationPolling();
      void pollBatchEvaluationSnapshots();
    }
  }

  async function onScanClick(): Promise<void> {
    ngScanBtn.disabled = true;
    ngScanBtn.textContent = "Scanning...";
    ngResultsEl.classList.add("hidden");
    ngEnrichResultsEl.classList.add("hidden");
    ngEnrichProgressEl.classList.add("hidden");
    clearPromotedList();
    resetEvaluationProgress();

    // Step 1: Extract listing rows from the page
    const extractRes = await sendMsg({ kind: "newgradExtractList" });
    if (!extractRes?.ok) {
      renderError(extractRes?.error?.code ?? "INTERNAL", extractRes?.error?.message ?? "extract failed");
      ngScanBtn.disabled = false;
      ngScanBtn.textContent = "Scan & Score";
      return;
    }
    const rows = extractRes.result.rows;
    ngStatusEl.textContent = "Extracted " + rows.length + " " + scanSourceLabel() +
      " listings from the page; filtering recent/unscanned rows...";

    // Step 2: Score the rows
    const scoreRes = await sendMsg({ kind: "newgradScore", rows });
    if (!scoreRes?.ok) {
      renderError(scoreRes?.error?.code ?? "INTERNAL", scoreRes?.error?.message ?? "scoring failed");
      ngScanBtn.disabled = false;
      ngScanBtn.textContent = "Scan & Score";
      return;
    }

    const promoted = scoreRes.result.promoted ?? [];
    const filteredRows = scoreRes.result.filtered ?? [];
    const filtered = filteredRows.filter(
      (r: any) => !["already_tracked", "already_scanned", "older_than_24h"].includes(r.reason),
    );
    const deduped = (scoreRes.result.filtered ?? []).filter(
      (r: any) => r.reason === "already_tracked",
    );
    const alreadyScanned = filteredRows.filter(
      (r: any) => r.reason === "already_scanned",
    );
    const olderThan24h = filteredRows.filter(
      (r: any) => r.reason === "older_than_24h",
    );
    const recentUnscanned = promoted.length + filtered.length;

    ngStatusEl.textContent = "Found " + recentUnscanned + " recent, not previously scanned " +
      scanSourceLabel() + " listings";

    ngPromotedEl.textContent = "\u2713 " + promoted.length + " passed filter (score \u2265 threshold)";
    ngFilteredEl.textContent = "\u2717 " + filtered.length + " filtered out by fit rules";
    ngDedupedEl.textContent =
      "\u2717 " + alreadyScanned.length + " already scanned, " +
      deduped.length + " already in tracker, " +
      olderThan24h.length + " older than 24h";
    renderPromotedList(promoted);
    ngResultsEl.classList.remove("hidden");

    storedPromotedRows = promoted;

    if (promoted.length === 0) {
      ngEnrichBtn.classList.add("hidden");
    } else {
      ngEnrichBtn.classList.remove("hidden");
    }

    ngScanBtn.disabled = false;
    ngScanBtn.textContent = "Scan & Score";
  }

  // Listen for scoped enrich progress broadcasts from background
  let activeEnrichSessionId: string | null = null;
  addRuntimeMessageListener((msg: {
    kind?: string;
    sessionId?: string;
    current?: number;
    total?: number;
    completed?: number;
    failed?: number;
    row?: { company?: string; title?: string };
    job?: any;
  }) => {
    if (msg?.kind === "enrichProgress"
      && msg.sessionId === activeEnrichSessionId
      && typeof msg.current === "number"
      && typeof msg.total === "number") {
      ngEnrichProgressEl.textContent = "Enriching (" + msg.current + "/" + msg.total + "): " +
        (msg.row?.company ?? "") + " — " + (msg.row?.title ?? "");
    }
    if (msg?.kind === "newgradEvaluationProgress"
      && msg.sessionId === activeEvaluationSessionId
      && msg.job?.jobId) {
      evaluationRows.set(msg.job.jobId, {
        ...(evaluationRows.get(msg.job.jobId) ?? {}),
        ...msg.job,
      });
      const summary: { total?: number; completed?: number; failed?: number } = {};
      if (typeof msg.total === "number") summary.total = msg.total;
      if (typeof msg.completed === "number") summary.completed = msg.completed;
      if (typeof msg.failed === "number") summary.failed = msg.failed;
      renderEvaluationProgress(summary);
    }
    if (msg?.kind === "newgradPendingBackfillProgress"
      && msg.sessionId === activePendingBackfillSessionId
      && typeof msg.current === "number"
      && typeof msg.total === "number") {
      ngPendingStatusEl.textContent = "Warming local cache (" + msg.current + "/" + msg.total + "): " +
        (msg.row?.company ?? "") + " — " + (msg.row?.title ?? "");
    }
  });

  async function onEnrichClick(): Promise<void> {
    ngEnrichBtn.disabled = true;
    ngEnrichBtn.textContent = "Enriching...";
    ngEnrichProgressEl.textContent = "Processing rows (0/" + storedPromotedRows.length + ")...";
    ngEnrichProgressEl.classList.remove("hidden");
    ngEnrichResultsEl.classList.add("hidden");
    resetEvaluationProgress();

    // Generate a unique session ID for this enrich run
    activeEnrichSessionId = "enrich-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8);
    activeEvaluationSessionId = activeEnrichSessionId;

    // Step 1: Enrich detail pages
    const detailRes = await sendMsg({
      kind: "newgradEnrichDetails",
      promotedRows: storedPromotedRows,
      config: { concurrent: 3, delayMinMs: 2000, delayMaxMs: 5000 },
    });
    if (!detailRes?.ok) {
      renderError(detailRes?.error?.code ?? "INTERNAL", detailRes?.error?.message ?? "enrich details failed");
      ngEnrichBtn.disabled = false;
      ngEnrichBtn.textContent = "Enrich detail pages";
      ngEnrichProgressEl.classList.add("hidden");
      activeEnrichSessionId = null;
      return;
    }

    // Step 2: Write enriched rows to pipeline (with scoped session ID)
    const enrichRes = await sendMsg({ kind: "newgradEnrich", rows: detailRes.result.enrichedRows, sessionId: activeEnrichSessionId });
    activeEnrichSessionId = null;
    if (!enrichRes?.ok) {
      renderError(enrichRes?.error?.code ?? "INTERNAL", enrichRes?.error?.message ?? "enrich failed");
      ngEnrichBtn.disabled = false;
      ngEnrichBtn.textContent = "Enrich detail pages";
      ngEnrichProgressEl.classList.add("hidden");
      return;
    }

    const queued = enrichRes.result.queued ?? enrichRes.result.evaluated ?? enrichRes.result.added ?? 0;
    const skipped = enrichRes.result.skipped ?? 0;
    const failed = enrichRes.result.failed ?? 0;
    const detailSucceeded = detailRes.result.enrichedRows.length;
    const detailFailed = detailRes.result.failed ?? 0;
    const skipDetail = formatNewGradSkipBreakdown(enrichRes.result.skipBreakdown);
    ngAddedEl.textContent = "\u2713 " + queued + " queued for direct evaluation (" +
      detailSucceeded + "/" + storedPromotedRows.length + " detail pages enriched)";
    ngSkippedEl.textContent = "\u2717 " + skipped + " skipped after detail filters, " +
      failed + " failed to queue, " + detailFailed + " detail pages failed" +
      (skipDetail ? " — " + skipDetail : "");
    seedEvaluationJobs(enrichRes.result.jobs ?? []);
    ngEnrichResultsEl.classList.remove("hidden");
    ngEnrichProgressEl.classList.add("hidden");
    ngEnrichBtn.classList.add("hidden");
    void loadPendingNewGradEntries();
    void loadRecentJobs();
  }

  async function onCopySummaryClick(): Promise<void> {
    if (!currentResult) return;
    const text = currentResult.company + " — " + currentResult.role +
      "\nScore: " + currentResult.score.toFixed(1) + "/5 · " + currentResult.archetype +
      "\n" + currentResult.tldr;
    try {
      await navigator.clipboard.writeText(text);
      copySummaryBtn.textContent = "Copied";
    } catch {
      copySummaryBtn.textContent = "Copy failed";
    }
    setTimeout(() => { copySummaryBtn.textContent = "Copy summary"; }, 1500);
  }

  // Wire events
  ngScanBtn.addEventListener("click", () => void onScanClick());
  ngEnrichBtn.addEventListener("click", () => void onEnrichClick());
  ngLoadPendingBtn.addEventListener("click", () => void loadPendingNewGradEntries());
  ngWarmPendingBtn.addEventListener("click", () => void warmPendingNewGradCache());
  ngEvaluatePendingBtn.addEventListener("click", () => void evaluatePendingNewGradEntries());
  ngBuiltInOpenBtn.addEventListener("click", () => {
    openBuiltInKeywordSearch(ngBuiltInKeywordInput.value);
  });
  ngBuiltInKeywordInput.addEventListener("keydown", (event: KeyboardEvent) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    openBuiltInKeywordSearch(ngBuiltInKeywordInput.value);
  });
  for (const chip of Array.from(shadow.querySelectorAll<HTMLButtonElement>("[data-builtin-keyword]"))) {
    chip.addEventListener("click", () => {
      const keyword = chip.dataset.builtinKeyword ?? "Software Engineering";
      ngBuiltInKeywordInput.value = keyword;
      openBuiltInKeywordSearch(keyword);
    });
  }
  autofillRefreshBtn.addEventListener("click", () => void loadAutofillProfile());
  autofillFillBtn.addEventListener("click", () => void fillAutofillMatches());
  evaluateBtn.addEventListener("click", () => void onEvaluateClick());
  evaluateAnywayBtn.addEventListener("click", () => {
    if (capturedData) { show("captured"); void onEvaluateClick(); }
  });
  copySummaryBtn.addEventListener("click", () => void onCopySummaryClick());
  openReportBtn.addEventListener("click", () => {
    if (currentResult) void sendMsg({ kind: "openPath", absolutePath: currentResult.reportPath });
  });
  retryBtn.addEventListener("click", () => { currentJobId = null; currentResult = null; void runCapture(); });
  setupSaveBtn.addEventListener("click", async () => {
    const token = setupTokenInput.value.trim();
    setupSaveBtn.disabled = true;
    const res = await sendMsg({ kind: "setToken", token });
    setupSaveBtn.disabled = false;
    if (!res?.ok) { renderError(res?.error?.code ?? "BAD_REQUEST", res?.error?.message ?? "failed"); return; }
    setupTokenInput.value = "";
    const healthOk = await refreshHealth();
    if (healthOk) await runCapture();
  });
  mergeTrackerBtn.addEventListener("click", async () => {
    mergeTrackerBtn.disabled = true;
    mergeTrackerBtn.textContent = "Merging…";
    const res = await sendMsg({ kind: "mergeTracker", dryRun: false });
    if (res?.ok) {
      mergeTrackerBtn.textContent =
        res.result.added > 0
          ? "Saved to tracker (" + res.result.added + " added)"
          : res.result.updated > 0
            ? "Saved to tracker (" + res.result.updated + " updated)"
            : "Tracker already up to date";
      void loadRecentJobs();
    } else {
      mergeTrackerBtn.disabled = false;
      mergeTrackerBtn.textContent = "Merge failed";
    }
  });

  // Init
  void (async () => {
    renderModePanel();

    const tokenRes = await sendMsg({ kind: "hasToken" });
    if (!tokenRes?.ok || !tokenRes.result?.present) {
      show("setup");
      setupTokenInput.focus();
      return;
    }
    const healthOk = await refreshHealth();
    if (!healthOk) {
      void loadRecentJobs();
      return;
    }
    await runCapture();

    // Detect supported scan sources and show scan UI instead of single-JD flow
    try {
      const capturedUrl = (capturedData as { url?: string } | null)?.url;
      if (capturedUrl) {
        const currentHost = new URL(capturedUrl).hostname;
        if (currentHost.includes("newgrad-jobs.com")) {
          setScanSource("newgrad");
          show("newgradScan");
          void loadPendingNewGradEntries();
          void loadRecentJobs();
          return;
        }
        if (currentHost === "builtin.com" || currentHost.endsWith(".builtin.com")) {
          setScanSource("builtin");
          syncBuiltInKeywordFromUrl(capturedUrl);
          show("newgradScan");
          void loadPendingNewGradEntries();
          void loadRecentJobs();
          return;
        }
      }
    } catch { /* invalid URL, proceed normally */ }

    void loadRecentJobs();
  })();
}

/* -------------------------------------------------------------------------- */
/*  Bootstrap                                                                  */
/* -------------------------------------------------------------------------- */

interface PanelWindow extends Window {
  __careerOpsPanelLoaded?: boolean;
}

function togglePanel(): void {
  const { root, shadow, existed } = getOrCreatePanel();

  if (existed) {
    // Toggle visibility
    root.style.display = root.style.display === "none" ? "block" : "none";
    if (root.style.display !== "none") {
      keepPanelInViewport(root);
    }
    return;
  }

  // First creation — build the UI
  const style = document.createElement("style");
  style.textContent = buildStyles();
  shadow.appendChild(style);

  const wrapper = document.createElement("div");
  wrapper.insertAdjacentHTML("afterbegin", buildHTML());
  shadow.appendChild(wrapper);

  initPanel(shadow, root);
}

const panelWindow = window as PanelWindow;

if (panelWindow.__careerOpsPanelLoaded) {
  togglePanel();
} else {
  panelWindow.__careerOpsPanelLoaded = true;

  // Listen for toggle messages from the background worker.
  addRuntimeMessageListener((msg) => {
    if (msg?.kind === "togglePanel") {
      togglePanel();
    }
  });

  togglePanel();
}
