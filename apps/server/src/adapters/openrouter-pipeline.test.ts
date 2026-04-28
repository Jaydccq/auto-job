import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  createOpenRouterPipelineAdapter,
  resolveOpenRouterApiKey,
} from "./openrouter-pipeline.js";
import type { PipelineConfig } from "../contracts/pipeline.js";
import type {
  EvaluationInput,
  EvaluationResult,
  JobId,
  PhaseTransition,
} from "@career-ops/shared";

/* -------------------------------------------------------------------------- */
/*  Test scaffolding                                                          */
/* -------------------------------------------------------------------------- */

function makeRepoRoot(): string {
  const root = join(
    tmpdir(),
    `career-ops-openrouter-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
  mkdirSync(join(root, "batch"), { recursive: true });
  mkdirSync(join(root, "batch/tracker-additions"), { recursive: true });
  mkdirSync(join(root, "batch/logs"), { recursive: true });
  mkdirSync(join(root, "reports"), { recursive: true });
  mkdirSync(join(root, "data"), { recursive: true });
  // Minimal batch-prompt.md so the adapter can render the system prompt.
  writeFileSync(
    join(root, "batch/batch-prompt.md"),
    "# Batch prompt\nURL={{URL}} JD={{JD_FILE}} REPORT={{REPORT_NUM}} DATE={{DATE}} ID={{ID}}",
    "utf-8"
  );
  // Empty tracker so reservation logic finds num=1.
  writeFileSync(
    join(root, "data/applications.md"),
    "# Applications Tracker\n\n| # | Date | Company | Role | Score | Status | PDF | Report | Notes |\n|---|---|---|---|---|---|---|---|---|\n",
    "utf-8"
  );
  return root;
}

function makeConfig(repoRoot: string): PipelineConfig {
  return {
    repoRoot,
    claudeBin: "claude",
    codexBin: "codex",
    nodeBin: process.execPath,
    realExecutor: "claude",
    evaluationTimeoutSec: 60,
    livenessTimeoutSec: 20,
    allowDangerousClaudeFlags: true,
  };
}

/**
 * Build a minimal-but-realistic markdown report body that the adapter's
 * post-processing (parseReportMarkdown / writeReport / writeTrackerAddition)
 * can accept. The adapter expects the model to emit a full report including
 * a structured header and a tldr line.
 */
function makeReportMarkdown(): string {
  return [
    "# Evaluation: Acme — Software Engineer",
    "",
    "**Date:** 2026-04-27",
    "**Score:** 4.2/5",
    "**URL:** https://example.com/jobs/1",
    "**PDF:** ❌",
    "**Archetype:** generalist",
    "**Legitimacy:** clean",
    "",
    "| TL;DR | Strong fit on AI/automation work — recommend deep evaluation. |",
    "",
    "## A) Resumen del Rol",
    "",
    "Strong fit on AI/automation work — recommend deep evaluation.",
    "",
    "## B) Block",
    "",
    "Looks aligned with target archetype.",
    "",
  ].join("\n");
}

/**
 * Build OpenAI-style SSE chunks from a list of content fragments.
 * Each fragment becomes one `data: {…}` event; we end with `[DONE]`.
 */
function makeSseStream(fragments: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const frag of fragments) {
        const payload = JSON.stringify({
          choices: [{ delta: { content: frag } }],
        });
        controller.enqueue(encoder.encode(`data: ${payload}\n\n`));
      }
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });
}

let cleanupRoots: string[] = [];

afterEach(() => {
  for (const root of cleanupRoots) {
    rmSync(root, { recursive: true, force: true });
  }
  cleanupRoots = [];
  vi.unstubAllGlobals();
  delete process.env.OPENROUTER_API_KEY;
});

beforeEach(() => {
  delete process.env.OPENROUTER_API_KEY;
});

function trackRoot(root: string): string {
  cleanupRoots.push(root);
  return root;
}

/* -------------------------------------------------------------------------- */
/*  Tests                                                                     */
/* -------------------------------------------------------------------------- */

test("createOpenRouterPipelineAdapter throws when apiKey is empty", () => {
  const repoRoot = trackRoot(makeRepoRoot());
  const config = makeConfig(repoRoot);
  expect(() =>
    createOpenRouterPipelineAdapter(config, { apiKey: "" })
  ).toThrowError(/OPENROUTER_API_KEY/);
});

test("resolveOpenRouterApiKey reads from process.env first", () => {
  process.env.OPENROUTER_API_KEY = "  env-key-value  ";
  expect(resolveOpenRouterApiKey()).toBe("env-key-value");
});

test("resolveOpenRouterApiKey throws helpful message when env and key file both missing", () => {
  // Override homedir to a directory that we know contains no key file.
  const fakeHome = join(tmpdir(), `career-ops-no-key-${Date.now()}`);
  mkdirSync(fakeHome, { recursive: true });
  cleanupRoots.push(fakeHome);

  vi.stubGlobal("process", {
    ...process,
    env: { ...process.env, HOME: fakeHome, OPENROUTER_API_KEY: undefined },
  });

  delete process.env.OPENROUTER_API_KEY;
  process.env.HOME = fakeHome;

  expect(() => resolveOpenRouterApiKey()).toThrowError(/OPENROUTER_API_KEY/);
});

test("runEvaluation streams content, writes report, emits phases (default model)", async () => {
  const repoRoot = trackRoot(makeRepoRoot());
  const config = makeConfig(repoRoot);

  const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => {
    return new Response(makeSseStream([makeReportMarkdown()]), {
      status: 200,
      headers: { "content-type": "text/event-stream" },
    });
  });
  vi.stubGlobal("fetch", fetchMock);

  const adapter = createOpenRouterPipelineAdapter(config, {
    apiKey: "test-api-key",
  });

  const phases: PhaseTransition[] = [];
  const input: EvaluationInput = {
    url: "https://example.com/jobs/1",
    title: "Software Engineer",
    pageText:
      "We are hiring a Software Engineer at Acme. Strong AI/automation focus. " +
      "Responsibilities include building backend services. Required: TypeScript. " +
      "Salary range: $120k-$160k.",
  };
  const jobId = "job-1" as JobId;

  const result = await adapter.runEvaluation(jobId, input, (t) => phases.push(t));

  // Result must be a successful EvaluationResult, not a BridgeError.
  expect("code" in result).toBe(false);
  const ok = result as EvaluationResult;
  expect(ok.company).toBe("Acme");
  expect(ok.role).toBe("Software Engineer");
  expect(ok.score).toBeCloseTo(4.2, 2);

  // Phase progression matches existing fake/claude/codex contract.
  const phaseNames = phases.map((p) => p.phase);
  expect(phaseNames).toContain("extracting_jd");
  expect(phaseNames).toContain("evaluating");
  expect(phaseNames).toContain("writing_report");
  expect(phaseNames).toContain("writing_tracker");

  // Verify the HTTP request shape.
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const [url, init] = fetchMock.mock.calls[0]!;
  expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
  const headers = (init.headers ?? {}) as Record<string, string>;
  expect(headers["Authorization"]).toBe("Bearer test-api-key");
  expect(headers["Content-Type"]).toBe("application/json");
  expect(headers["HTTP-Referer"]).toBeDefined();
  expect(headers["X-Title"]).toBeDefined();

  const body = JSON.parse(init.body as string) as {
    model: string;
    messages: Array<{ role: string; content: string }>;
    stream: boolean;
  };
  expect(body.model).toBe("anthropic/claude-3.5-sonnet");
  expect(body.stream).toBe(true);
  expect(Array.isArray(body.messages)).toBe(true);
  expect(body.messages.length).toBeGreaterThanOrEqual(1);
});

test("runEvaluation honors model override via constructor", async () => {
  const repoRoot = trackRoot(makeRepoRoot());
  const config = makeConfig(repoRoot);

  const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => {
    return new Response(makeSseStream([makeReportMarkdown()]), {
      status: 200,
      headers: { "content-type": "text/event-stream" },
    });
  });
  vi.stubGlobal("fetch", fetchMock);

  const adapter = createOpenRouterPipelineAdapter(config, {
    apiKey: "test-api-key",
    model: "openai/gpt-4o",
  });

  const input: EvaluationInput = {
    url: "https://example.com/jobs/2",
    title: "Software Engineer",
    pageText: "Acme is hiring a Software Engineer focused on TypeScript backend systems.",
  };
  await adapter.runEvaluation("job-2" as JobId, input, () => {});

  const [, init] = fetchMock.mock.calls[0]!;
  const body = JSON.parse(init.body as string) as { model: string };
  expect(body.model).toBe("openai/gpt-4o");
});

test("runEvaluation returns EVAL_FAILED on non-200 response", async () => {
  const repoRoot = trackRoot(makeRepoRoot());
  const config = makeConfig(repoRoot);

  const fetchMock = vi.fn(async () => {
    return new Response("rate limit hit", {
      status: 429,
      headers: { "content-type": "text/plain" },
    });
  });
  vi.stubGlobal("fetch", fetchMock);

  const adapter = createOpenRouterPipelineAdapter(config, {
    apiKey: "test-api-key",
  });

  const phases: PhaseTransition[] = [];
  const input: EvaluationInput = {
    url: "https://example.com/jobs/3",
    title: "Software Engineer",
    pageText: "Some JD body that the adapter will pass to OpenRouter.",
  };
  const result = await adapter.runEvaluation(
    "job-3" as JobId,
    input,
    (t) => phases.push(t)
  );

  expect("code" in result).toBe(true);
  const err = result as { code: string; message: string };
  expect(err.code).toBe("EVAL_FAILED");
  expect(err.message).toMatch(/429/);
});
