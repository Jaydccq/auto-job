import { describe, expect, it } from "vitest";

import { AUTH_HEADER } from "@career-ops/shared";
import { PROTOCOL_VERSION, type Response } from "@career-ops/shared";
import type {
  EvaluationInput,
  EvaluationResult,
  JobId,
  JobSnapshot,
} from "@career-ops/shared";
import type {
  LivenessCheck,
  MergeReport,
  PipelineAdapter,
  PipelineProgressHandler,
} from "./contracts/pipeline.js";
import type { BridgeConfig } from "./runtime/config.js";
import { buildServer } from "./server.js";

const TOKEN = "test-token";

function makeConfig(): BridgeConfig {
  return {
    repoRoot: "/tmp/career-ops-test",
    bridgeDir: "/tmp/career-ops-test/bridge",
    host: "127.0.0.1",
    port: 47319,
    token: TOKEN,
    claudeBin: "claude",
    codexBin: "codex",
    codexModel: "gpt-5.4-mini",
    codexReasoningEffort: "medium",
    nodeBin: "node",
    mode: "real",
    realExecutor: "codex",
    evaluationTimeoutSec: 30,
    evaluationConcurrency: 1,
    evaluationRateLimitPerMinute: 30,
    livenessTimeoutSec: 10,
    bridgeVersion: "test",
    careerOpsVersion: "test",
  };
}

function makeAdapter(
  runEvaluation: PipelineAdapter["runEvaluation"],
  overrides: Partial<PipelineAdapter> = {},
): PipelineAdapter {
  return {
    async doctor() {
      return {
        ok: true,
        repo: {
          rootPath: "/tmp/career-ops-test",
          careerOpsVersion: "test",
          trackerOk: true,
          cvOk: true,
          profileOk: true,
        },
        claudeCli: { ok: true },
        node: { version: "test" },
        playwrightChromium: { ok: true },
      };
    },
    async checkLiveness(url: string): Promise<LivenessCheck> {
      return { url, status: "active", reason: "test", exitCode: 0 };
    },
    runEvaluation,
    async readReport() {
      return undefined;
    },
    async readTrackerTail() {
      return { rows: [], totalRows: 0 };
    },
    async mergeTracker(): Promise<MergeReport> {
      return {
        dryRun: false,
        added: 0,
        updated: 0,
        skipped: 0,
      };
    },
    async scoreNewGradRows() {
      return { promoted: [], filtered: [] };
    },
    async enrichNewGradRows() {
      return { added: 0, skipped: 0, entries: [] };
    },
    async readNewGradPendingEntries() {
      return { entries: [], total: 0 };
    },
    async readBuiltInPendingEntries() {
      return { entries: [], total: 0 };
    },
    async backfillNewGradPendingCache() {
      return { updated: 0, skipped: 0, outcomes: [] };
    },
    async readAutofillProfile() {
      return {
        generatedAt: "2026-04-26T00:00:00.000Z",
        sources: ["test"],
        warnings: [],
        fields: [],
      };
    },
    async readAutofillResume() {
      return {
        filename: "test-resume.pdf",
        mimeType: "application/pdf",
        sizeBytes: 4,
        dataBase64: "dGVzdA==",
      };
    },
    ...overrides,
  };
}

function evaluationRequest(input: EvaluationInput) {
  return {
    protocol: PROTOCOL_VERSION,
    requestId: `test-${Date.now()}`,
    clientTimestamp: new Date().toISOString(),
    payload: { input },
  };
}

async function readJob(
  fastify: ReturnType<typeof buildServer>["fastify"],
  jobId: JobId,
): Promise<JobSnapshot> {
  const res = await fastify.inject({
    method: "GET",
    url: `/v1/jobs/${jobId}`,
    headers: { [AUTH_HEADER]: TOKEN },
  });
  const body = res.json<Response<JobSnapshot>>();
  if (!body.ok) throw new Error(body.error.message);
  return body.result;
}

describe("bridge server evaluation jobs", () => {
  it("marks jobs failed when the background adapter throws", async () => {
    const { fastify } = buildServer({
      config: makeConfig(),
      adapter: makeAdapter(
        async (
          _jobId: JobId,
          _input: EvaluationInput,
          _onProgress: PipelineProgressHandler,
        ): Promise<EvaluationResult> => {
          throw new Error("adapter exploded");
        },
      ),
    });

    try {
      const created = await fastify.inject({
        method: "POST",
        url: "/v1/evaluate",
        headers: { [AUTH_HEADER]: TOKEN },
        payload: evaluationRequest({ url: "https://example.com/job" }),
      });
      expect(created.statusCode).toBe(202);
      const createBody = created.json<Response<{ jobId: JobId }>>();
      expect(createBody.ok).toBe(true);
      if (!createBody.ok) throw new Error("expected success response");

      let snapshot = await readJob(fastify, createBody.result.jobId);
      for (let i = 0; i < 20 && snapshot.phase !== "failed"; i += 1) {
        await new Promise((resolve) => setTimeout(resolve, 10));
        snapshot = await readJob(fastify, createBody.result.jobId);
      }

      expect(snapshot.phase).toBe("failed");
      expect(snapshot.error).toMatchObject({
        code: "EVAL_FAILED",
        message: "adapter exploded",
      });
    } finally {
      await fastify.close();
    }
  });
});

describe("bridge server Built In pending endpoint", () => {
  it("returns Built In pending entries from the adapter", async () => {
    const { fastify } = buildServer({
      config: makeConfig(),
      adapter: makeAdapter(
        async (): Promise<EvaluationResult> => {
          throw new Error("not expected");
        },
        {
          async readBuiltInPendingEntries(limit: number) {
            expect(limit).toBe(2);
            return {
              total: 3,
              entries: [
                {
                  url: "https://builtin.com/job/software-engineer/123",
                  company: "BuiltIn Co",
                  role: "Software Engineer",
                  source: "builtin.com",
                  lineNumber: 42,
                },
              ],
            };
          },
        },
      ),
    });

    try {
      const res = await fastify.inject({
        method: "POST",
        url: "/v1/builtin-scan/pending",
        headers: { [AUTH_HEADER]: TOKEN },
        payload: {
          protocol: PROTOCOL_VERSION,
          requestId: "builtin-pending-test",
          clientTimestamp: new Date().toISOString(),
          payload: { limit: 2 },
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json<Response<{
        entries: Array<{ url: string; source: string; lineNumber: number }>;
        total: number;
      }>>();
      expect(body.ok).toBe(true);
      if (!body.ok) throw new Error("expected success response");
      expect(body.result.total).toBe(3);
      expect(body.result.entries).toEqual([
        {
          url: "https://builtin.com/job/software-engineer/123",
          company: "BuiltIn Co",
          role: "Software Engineer",
          source: "builtin.com",
          lineNumber: 42,
        },
      ]);
    } finally {
      await fastify.close();
    }
  });
});

describe("bridge server autofill profile endpoint", () => {
  it("returns the adapter-provided autofill profile", async () => {
    const { fastify } = buildServer({
      config: makeConfig(),
      adapter: makeAdapter(
        async (): Promise<EvaluationResult> => {
          throw new Error("not expected");
        },
        {
          async readAutofillProfile() {
            return {
              generatedAt: "2026-04-26T01:02:03.000Z",
              sources: ["config/profile.yml", "cv.md"],
              warnings: [],
              fields: [
                {
                  key: "email",
                  label: "Email",
                  value: "candidate@example.com",
                  source: "config/profile.yml",
                  confidence: 0.96,
                  aliases: ["email", "email address"],
                  sensitive: true,
                },
              ],
            };
          },
        },
      ),
    });

    try {
      const res = await fastify.inject({
        method: "POST",
        url: "/v1/autofill/profile",
        headers: { [AUTH_HEADER]: TOKEN },
        payload: {
          protocol: PROTOCOL_VERSION,
          requestId: "autofill-profile-test",
          clientTimestamp: new Date().toISOString(),
          payload: {},
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json<Response<{
        fields: Array<{ key: string; value: string; sensitive?: boolean }>;
        sources: string[];
      }>>();
      expect(body.ok).toBe(true);
      if (!body.ok) throw new Error("expected success response");
      expect(body.result.sources).toEqual(["config/profile.yml", "cv.md"]);
      expect(body.result.fields[0]).toMatchObject({
        key: "email",
        value: "candidate@example.com",
        sensitive: true,
      });
    } finally {
      await fastify.close();
    }
  });

  it("returns the adapter-provided resume file", async () => {
    const { fastify } = buildServer({
      config: makeConfig(),
      adapter: makeAdapter(
        async (): Promise<EvaluationResult> => {
          throw new Error("not expected");
        },
        {
          async readAutofillResume() {
            return {
              filename: "Hongxi_Chen_full_stack.pdf",
              mimeType: "application/pdf",
              sizeBytes: 123,
              dataBase64: "JVBERi0=",
            };
          },
        },
      ),
    });

    try {
      const res = await fastify.inject({
        method: "POST",
        url: "/v1/autofill/resume",
        headers: { [AUTH_HEADER]: TOKEN },
        payload: {
          protocol: PROTOCOL_VERSION,
          requestId: "autofill-resume-test",
          clientTimestamp: new Date().toISOString(),
          payload: {},
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json<Response<{
        filename: string;
        mimeType: string;
        sizeBytes: number;
        dataBase64: string;
      }>>();
      expect(body.ok).toBe(true);
      if (!body.ok) throw new Error("expected success response");
      expect(body.result).toMatchObject({
        filename: "Hongxi_Chen_full_stack.pdf",
        mimeType: "application/pdf",
        sizeBytes: 123,
        dataBase64: "JVBERi0=",
      });
    } finally {
      await fastify.close();
    }
  });
});
