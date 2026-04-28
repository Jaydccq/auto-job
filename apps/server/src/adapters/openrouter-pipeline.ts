/**
 * openrouter-pipeline.ts — PipelineAdapter that routes evaluations through
 * the OpenRouter HTTP API instead of a local CLI subprocess.
 *
 * Architectural note:
 *   The claude/codex adapters spawn an agentic CLI that performs tool use
 *   (web fetch, file reads) and writes the final report markdown to disk
 *   on its own. OpenRouter is a plain chat-completions API — it returns
 *   text, not file writes. So this adapter must:
 *     1. Build a self-contained system + user prompt (no tool use).
 *     2. POST to /v1/chat/completions with stream=true.
 *     3. Reassemble the streamed deltas into the final markdown report.
 *     4. Persist reports/{NNN}-{slug}-{date}.md and the tracker addition.
 *
 * Several private helpers in claude-pipeline (writeReport, writeTrackerAddition,
 * parseReportMarkdown, etc.) are reused via __internal to avoid duplicating
 * the report/tracker write contract in two places.
 */

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { statSync } from "node:fs";

import type {
  AutofillProfile,
  AutofillResumeFile,
  BridgeError,
  EnrichedRow,
  EvaluationInput,
  EvaluationResult,
  JobId,
  NewGradEnrichResult,
  NewGradPendingCacheBackfillInput,
  NewGradPendingCacheBackfillResult,
  NewGradRow,
  NewGradScoreResult,
  TrackerRow,
} from "@career-ops/shared";

import type {
  DoctorReport,
  LivenessCheck,
  MergeReport,
  PipelineAdapter,
  PipelineConfig,
  PipelineProgressHandler,
  ReportFile,
} from "../contracts/pipeline.js";
import { bridgeError } from "../runtime/errors.js";
import { __internal as claudeInternal } from "./claude-pipeline.js";

const DEFAULT_BASE_URL = "https://openrouter.ai/api/v1";
const DEFAULT_MODEL = "anthropic/claude-3.5-sonnet";
const DEFAULT_TIMEOUT_MS = 600_000;
const DEFAULT_HTTP_REFERER = "https://career-ops.local";
const DEFAULT_X_TITLE = "Career Ops";
const ERROR_BODY_TAIL_CHARS = 200;
const KEY_FILE_RELATIVE = ".config/career-ops/openrouter.key";

/* -------------------------------------------------------------------------- */
/*  Configuration                                                             */
/* -------------------------------------------------------------------------- */

export interface OpenRouterConfig {
  /** Required. Will be sent verbatim as `Authorization: Bearer <key>`. */
  apiKey: string;
  /** Override OpenRouter model slug. Default: `anthropic/claude-3.5-sonnet`. */
  model?: string;
  /** Override the API base URL. Default: `https://openrouter.ai/api/v1`. */
  baseUrl?: string;
  /** Per-request timeout in milliseconds. Default: 10 minutes. */
  timeout?: number;
  /** Override the `HTTP-Referer` header sent for OpenRouter attribution. */
  httpReferer?: string;
  /** Override the `X-Title` header sent for OpenRouter attribution. */
  xTitle?: string;
}

/**
 * Resolve an OpenRouter API key from the environment, then from a key file
 * under the user's home directory. Throws a helpful error if neither is set.
 */
export function resolveOpenRouterApiKey(): string {
  const env = process.env.OPENROUTER_API_KEY?.trim();
  if (env) return env;

  const home = process.env.HOME ?? homedir();
  if (home) {
    const keyPath = join(home, KEY_FILE_RELATIVE);
    if (existsSync(keyPath)) {
      try {
        const stat = statSync(keyPath);
        // Best-effort permission warning. We don't fail on loose modes
        // because this is the user's own machine and key.
        const mode = stat.mode & 0o777;
        if (mode & 0o077) {
          process.stderr.write(
            `warn: ${keyPath} has mode ${mode.toString(8)}; ` +
              `recommend chmod 600 to keep the OpenRouter key private\n`
          );
        }
      } catch {
        // ignore stat errors; we'll still try to read the file
      }
      const contents = readFileSync(keyPath, "utf-8").trim();
      if (contents) return contents;
    }
  }

  throw new Error(
    "OPENROUTER_API_KEY is not set. Either export OPENROUTER_API_KEY in the " +
      "environment or write your key (chmod 600) to ~/.config/career-ops/openrouter.key. " +
      "Get a key at https://openrouter.ai/keys."
  );
}

/* -------------------------------------------------------------------------- */
/*  Adapter factory                                                           */
/* -------------------------------------------------------------------------- */

export function createOpenRouterPipelineAdapter(
  config: PipelineConfig,
  options: OpenRouterConfig
): PipelineAdapter {
  if (!options.apiKey || !options.apiKey.trim()) {
    throw new Error(
      "OPENROUTER_API_KEY is required to construct the OpenRouter pipeline adapter. " +
        "Set process.env.OPENROUTER_API_KEY or pass apiKey explicitly."
    );
  }
  const apiKey = options.apiKey.trim();
  const model = options.model?.trim() || DEFAULT_MODEL;
  const baseUrl = options.baseUrl?.replace(/\/$/, "") || DEFAULT_BASE_URL;
  const timeoutMs = options.timeout ?? DEFAULT_TIMEOUT_MS;
  const httpReferer = options.httpReferer || DEFAULT_HTTP_REFERER;
  const xTitle = options.xTitle || DEFAULT_X_TITLE;

  return {
    async doctor(): Promise<DoctorReport> {
      const cvOk = existsSync(join(config.repoRoot, "cv.md"));
      const profileOk = existsSync(join(config.repoRoot, "config/profile.yml"));
      const trackerOk = existsSync(join(config.repoRoot, "data/applications.md"));
      const versionPath = join(config.repoRoot, "VERSION");
      const careerOpsVersion = existsSync(versionPath)
        ? readFileSync(versionPath, "utf-8").trim()
        : "unknown";
      return {
        ok: cvOk && profileOk && trackerOk,
        repo: {
          rootPath: config.repoRoot,
          careerOpsVersion,
          trackerOk,
          cvOk,
          profileOk,
        },
        // OpenRouter does not require a CLI; report ok with version="api".
        claudeCli: { ok: true, version: `openrouter:${model}` },
        node: { version: process.version },
        // Playwright is not used by this adapter.
        playwrightChromium: { ok: true },
      };
    },

    async checkLiveness(url: string): Promise<LivenessCheck> {
      // OpenRouter has no liveness probe; defer to caller-side decisions.
      return {
        url,
        status: "uncertain",
        reason: "openrouter adapter does not perform liveness checks",
        exitCode: 0,
      };
    },

    async runEvaluation(
      jobId: JobId,
      input: EvaluationInput,
      onProgress: PipelineProgressHandler
    ): Promise<EvaluationResult | BridgeError> {
      const reportNumber = claudeInternal.reserveReportNumber(
        config.repoRoot,
        jobId
      );
      const reportNumberText = claudeInternal.formatReportNumber(reportNumber);
      const date = claudeInternal.todayDate();

      onProgress({
        phase: "extracting_jd",
        at: nowIso(),
        note:
          (input.pageText?.trim().length ?? 0) > 0
            ? "using captured page text"
            : "no page text — relying on URL hint",
      });

      const messages = buildOpenRouterMessages(config.repoRoot, {
        input,
        reportNumberText,
        date,
        jobId,
      });

      onProgress({
        phase: "evaluating",
        at: nowIso(),
        note: `openrouter ${model} report ${reportNumberText}`,
      });

      let markdown: string;
      try {
        markdown = await streamOpenRouterCompletion({
          baseUrl,
          apiKey,
          model,
          messages,
          httpReferer,
          xTitle,
          timeoutMs,
        });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "openrouter request failed";
        return bridgeError("EVAL_FAILED", `openrouter: ${message}`);
      }

      // Persist the markdown to reports/{NNN}-{slug}-{date}.md, then parse
      // it the same way the claude/codex adapters do. We try to derive the
      // slug from the parsed company name if possible; fall back to URL.
      let parsed;
      try {
        parsed = claudeInternal.parseReportMarkdown(markdown);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "could not parse report markdown";
        return bridgeError(
          "EVAL_FAILED",
          `openrouter: model output was not a valid report (${message})`
        );
      }

      const slug = claudeInternal.slugify(parsed.company);
      const reportPath = claudeInternal.writeReport(
        config.repoRoot,
        reportNumber,
        slug,
        date,
        markdown
      );

      onProgress({
        phase: "writing_report",
        at: nowIso(),
        note: `${reportNumberText}-${slug}-${date}.md`,
      });

      onProgress({
        phase: "generating_pdf",
        at: nowIso(),
        note: "openrouter adapter does not generate PDFs",
      });

      const score = claudeInternal.coerceScore(undefined, parsed.score);
      const trackerEntryNum = claudeInternal.nextTrackerEntryNumber(
        config.repoRoot
      );
      const trackerRow = claudeInternal.buildTrackerRow({
        num: trackerEntryNum,
        date: parsed.date,
        company: parsed.company,
        role: parsed.role,
        score,
        reportPath,
        pdfPath: null,
        tldr: parsed.tldr,
      });
      const trackerDir = join(config.repoRoot, "batch", "tracker-additions");
      claudeInternal.writeTrackerAddition(trackerDir, jobId, trackerRow);

      onProgress({
        phase: "writing_tracker",
        at: nowIso(),
        note: `${jobId}.tsv`,
      });

      const result: EvaluationResult = {
        reportNumber,
        reportPath,
        pdfPath: null,
        company: parsed.company,
        role: parsed.role,
        score,
        archetype: parsed.archetype,
        tldr: parsed.tldr,
        trackerRow,
        trackerMerged: false,
      };
      return result;
    },

    async readReport(num: number): Promise<ReportFile | undefined> {
      // Reuse the deterministic file location: scan reports/ for a file
      // matching the report number prefix.
      const reportsDir = join(config.repoRoot, "reports");
      if (!existsSync(reportsDir)) return undefined;
      const prefix = claudeInternal.formatReportNumber(num);
      // Lazy directory scan; cheap for our scale.
      const { readdirSync } = await import("node:fs");
      const matches = readdirSync(reportsDir).filter((name) =>
        name.startsWith(`${prefix}-`)
      );
      const first = matches[0];
      if (!first) return undefined;
      const path = resolve(reportsDir, first);
      const markdown = readFileSync(path, "utf-8");
      try {
        const parsed = claudeInternal.parseReportMarkdown(markdown);
        return {
          num,
          path,
          markdown,
          meta: {
            company: parsed.company,
            role: parsed.role,
            date: parsed.date,
            score: parsed.score,
            archetype: parsed.archetype,
            ...(parsed.url ? { url: parsed.url } : {}),
          },
        };
      } catch {
        return undefined;
      }
    },

    async readTrackerTail(_limit: number) {
      // Not implemented by the OpenRouter adapter on purpose: the popup
      // uses the tracker tail from the dashboard server. Return empty.
      return { rows: [] as readonly TrackerRow[], totalRows: 0 };
    },

    async mergeTracker(dryRun: boolean): Promise<MergeReport> {
      return { added: 0, updated: 0, skipped: 0, dryRun };
    },

    async scoreNewGradRows(_rows: NewGradRow[]): Promise<NewGradScoreResult> {
      return { promoted: [], filtered: [] };
    },

    async enrichNewGradRows(
      _rows: EnrichedRow[],
      _onProgress?: (current: number, total: number, row: EnrichedRow) => void
    ): Promise<NewGradEnrichResult> {
      return { added: 0, skipped: 0, candidates: [], entries: [] };
    },

    async readNewGradPendingEntries(_limit: number) {
      return { entries: [], total: 0 };
    },

    async readBuiltInPendingEntries(_limit: number) {
      return { entries: [], total: 0 };
    },

    async backfillNewGradPendingCache(
      _entries: readonly NewGradPendingCacheBackfillInput[]
    ): Promise<NewGradPendingCacheBackfillResult> {
      return { updated: 0, skipped: 0, outcomes: [] };
    },

    async readAutofillProfile(): Promise<AutofillProfile> {
      // Delegate to the canonical reader so the extension's autofill
      // helper still works in OpenRouter mode.
      const { readAutofillProfile } = await import("./autofill-profile.js");
      return readAutofillProfile(config.repoRoot);
    },

    async readAutofillResume(): Promise<AutofillResumeFile> {
      const { readAutofillResume } = await import("./autofill-profile.js");
      return readAutofillResume(config.repoRoot);
    },
  };
}

/* -------------------------------------------------------------------------- */
/*  Internal helpers                                                          */
/* -------------------------------------------------------------------------- */

function nowIso(): string {
  return new Date().toISOString();
}

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/**
 * Build a self-contained system + user message pair for OpenRouter.
 * The model has no tool access, so we MUST supply everything it needs
 * inline (URL, captured page text, target schema for the report).
 *
 * The system prompt is loaded from `batch/batch-prompt.md` so prompt
 * authoring stays in one place. We append API-specific instructions
 * that tell the model to emit the report markdown directly as its reply.
 */
function buildOpenRouterMessages(
  repoRoot: string,
  args: {
    input: EvaluationInput;
    reportNumberText: string;
    date: string;
    jobId: string;
  }
): ChatMessage[] {
  const { input, reportNumberText, date, jobId } = args;
  const systemPromptPath = join(repoRoot, "batch", "batch-prompt.md");
  let systemPrompt: string;
  try {
    systemPrompt = readFileSync(systemPromptPath, "utf-8");
  } catch {
    // Some tests don't include batch-prompt.md; fall back to a minimal
    // template so the request shape is still valid.
    systemPrompt =
      "# Career-ops batch prompt\n" +
      "You are evaluating a job offer for the career-ops pipeline.\n";
  }
  const renderedSystem = systemPrompt
    .replaceAll("{{URL}}", input.url)
    .replaceAll("{{JD_FILE}}", "<inline>")
    .replaceAll("{{REPORT_NUM}}", reportNumberText)
    .replaceAll("{{DATE}}", date)
    .replaceAll("{{ID}}", jobId);

  const apiInstructions = [
    "",
    "## OpenRouter API Mode",
    "",
    "- You have no tool access. Do NOT attempt to read files or fetch URLs.",
    "- Use only the URL and page text provided in the user message.",
    "- Respond with the FULL evaluation report as markdown. No prose before",
    "  the report. No markdown code fences. Start with the `# Evaluation:`",
    "  heading and end with the last block.",
    `- The header MUST include \`**Date:** ${date}\`, \`**Score:** N.N/5\`,`,
    "  `**URL:**`, `**Archetype:**`, `**Legitimacy:**`.",
    "- Include a `| TL;DR | ... |` row so downstream parsing succeeds.",
  ].join("\n");

  const userParts: string[] = [];
  userParts.push(`URL: ${input.url}`);
  if (input.title) userParts.push(`Title hint: ${input.title}`);
  userParts.push(`Report number: ${reportNumberText}`);
  userParts.push(`Date: ${date}`);
  if (input.pageText && input.pageText.trim()) {
    userParts.push("");
    userParts.push("## Captured page text");
    userParts.push(input.pageText.trim());
  }
  userParts.push("");
  userParts.push("Produce the full evaluation report markdown now.");

  return [
    { role: "system", content: `${renderedSystem}\n${apiInstructions}` },
    { role: "user", content: userParts.join("\n") },
  ];
}

/**
 * POST to OpenRouter `/chat/completions` with stream=true and reassemble
 * the SSE deltas into a single string. Throws on non-2xx, network, or
 * timeout failure; the caller maps those to BridgeError.
 */
async function streamOpenRouterCompletion(args: {
  baseUrl: string;
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  httpReferer: string;
  xTitle: string;
  timeoutMs: number;
}): Promise<string> {
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), args.timeoutMs);
  const url = `${args.baseUrl}/chat/completions`;
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${args.apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": args.httpReferer,
        "X-Title": args.xTitle,
      },
      body: JSON.stringify({
        model: args.model,
        messages: args.messages,
        stream: true,
      }),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timeoutHandle);
    if ((err as { name?: string })?.name === "AbortError") {
      throw new Error(`request timeout after ${args.timeoutMs}ms`);
    }
    throw err instanceof Error ? err : new Error(String(err));
  }

  if (!response.ok) {
    clearTimeout(timeoutHandle);
    const tail = await safeReadBodyTail(response);
    throw new Error(
      `HTTP ${response.status} ${response.statusText}${tail ? ` — ${tail}` : ""}`
    );
  }

  if (!response.body) {
    clearTimeout(timeoutHandle);
    throw new Error("response body was empty (no stream)");
  }

  try {
    return await reassembleSseStream(response.body);
  } finally {
    clearTimeout(timeoutHandle);
  }
}

async function safeReadBodyTail(response: Response): Promise<string> {
  try {
    const text = await response.text();
    return text.length > ERROR_BODY_TAIL_CHARS
      ? text.slice(0, ERROR_BODY_TAIL_CHARS) + "…"
      : text;
  } catch {
    return "";
  }
}

/**
 * Read OpenAI-style SSE chunks from a fetch ReadableStream and concatenate
 * `choices[0].delta.content` fragments. Skips heartbeat lines, JSON parse
 * errors, and the `[DONE]` sentinel.
 */
async function reassembleSseStream(
  body: ReadableStream<Uint8Array>
): Promise<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  let assembled = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let sepIdx = buffer.indexOf("\n\n");
      while (sepIdx !== -1) {
        const eventBlock = buffer.slice(0, sepIdx);
        buffer = buffer.slice(sepIdx + 2);
        const fragment = parseSseEvent(eventBlock);
        if (fragment !== null) assembled += fragment;
        sepIdx = buffer.indexOf("\n\n");
      }
    }
    // Flush any final buffered event without a trailing blank line.
    const tail = buffer.trim();
    if (tail) {
      const fragment = parseSseEvent(tail);
      if (fragment !== null) assembled += fragment;
    }
  } finally {
    reader.releaseLock();
  }
  return assembled;
}

function parseSseEvent(block: string): string | null {
  // An SSE event block can have multiple lines like `data: ...`. We only
  // care about the data lines; the `event:` / `id:` / `:comment` lines
  // are skipped silently.
  const dataLines = block
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trimStart());
  if (dataLines.length === 0) return null;
  const payload = dataLines.join("\n").trim();
  if (!payload) return null;
  if (payload === "[DONE]") return null;
  try {
    const obj = JSON.parse(payload) as {
      choices?: Array<{ delta?: { content?: string } }>;
    };
    return obj?.choices?.[0]?.delta?.content ?? null;
  } catch {
    // Heartbeats, partial JSON, or unrelated chunks — ignore silently.
    return null;
  }
}
