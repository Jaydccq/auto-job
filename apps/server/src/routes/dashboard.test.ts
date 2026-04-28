import { mkdirSync, mkdtempSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { BridgeConfig } from "../runtime/config.js";
import type {
  LivenessCheck,
  MergeReport,
  PipelineAdapter,
} from "../contracts/pipeline.js";
import { buildServer } from "../server.js";

const TOKEN = "dashboard-test-token";

function makeAdapter(): PipelineAdapter {
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
    async runEvaluation() {
      throw new Error("not expected in dashboard tests");
    },
    async readReport() {
      return undefined;
    },
    async readTrackerTail() {
      return { rows: [], totalRows: 0 };
    },
    async mergeTracker(): Promise<MergeReport> {
      return { dryRun: false, added: 0, updated: 0, skipped: 0 };
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
  };
}

function makeConfig(repoRoot: string): BridgeConfig {
  return {
    repoRoot,
    bridgeDir: join(repoRoot, "apps/server"),
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

describe("dashboard routes", () => {
  let tmpRepoRoot: string;
  let reportsDir: string;

  beforeEach(() => {
    tmpRepoRoot = mkdtempSync(join(tmpdir(), "career-ops-dashboard-"));
    reportsDir = join(tmpRepoRoot, "reports");
    mkdirSync(reportsDir, { recursive: true });
    writeFileSync(
      join(reportsDir, "001-acme-2026-04-27.md"),
      "# Acme report\n\n**URL:** https://acme.example/jobs/1\n",
      "utf8",
    );
  });

  afterEach(() => {
    rmSync(tmpRepoRoot, { recursive: true, force: true });
  });

  it("GET /dashboard/ returns 200 HTML with the bridge token meta tag, no auth required", async () => {
    const { fastify } = buildServer({
      config: makeConfig(tmpRepoRoot),
      adapter: makeAdapter(),
    });
    try {
      const res = await fastify.inject({ method: "GET", url: "/dashboard/" });
      expect(res.statusCode).toBe(200);
      expect(res.headers["content-type"]).toMatch(/text\/html/);
      expect(res.body).toContain(
        `<meta name="career-ops-token" content="${TOKEN}">`,
      );
    } finally {
      await fastify.close();
    }
  });

  it("GET /dashboard/index.html returns the same HTML response", async () => {
    const { fastify } = buildServer({
      config: makeConfig(tmpRepoRoot),
      adapter: makeAdapter(),
    });
    try {
      const res = await fastify.inject({
        method: "GET",
        url: "/dashboard/index.html",
      });
      expect(res.statusCode).toBe(200);
      expect(res.headers["content-type"]).toMatch(/text\/html/);
      expect(res.body).toContain(
        `<meta name="career-ops-token" content="${TOKEN}">`,
      );
    } finally {
      await fastify.close();
    }
  });

  it("rendered dashboard HTML contains no legacy token/URL references (commit-4 regression)", async () => {
    const { fastify } = buildServer({
      config: makeConfig(tmpRepoRoot),
      adapter: makeAdapter(),
    });
    try {
      const res = await fastify.inject({ method: "GET", url: "/dashboard/" });
      expect(res.statusCode).toBe(200);
      // Inline JS must not reference the legacy bridge port or header.
      expect(res.body).not.toContain("127.0.0.1:47329");
      expect(res.body).not.toContain("x-career-ops-pdf-token");
      expect(res.body).not.toContain("PDF_API_TOKEN");
    } finally {
      await fastify.close();
    }
  });

  it("GET /dashboard/api/health (commit-3 path) is NOT in the auth allowlist — returns 401 without a token", async () => {
    const { fastify } = buildServer({
      config: makeConfig(tmpRepoRoot),
      adapter: makeAdapter(),
    });
    try {
      const res = await fastify.inject({
        method: "GET",
        url: "/dashboard/api/health",
      });
      // Allowlist must NOT cover /dashboard/api/*. Auth runs and rejects.
      expect(res.statusCode).toBe(401);
    } finally {
      await fastify.close();
    }
  });

  it("GET /reports/<existing>.md returns 200 + markdown body", async () => {
    const { fastify } = buildServer({
      config: makeConfig(tmpRepoRoot),
      adapter: makeAdapter(),
    });
    try {
      const res = await fastify.inject({
        method: "GET",
        url: "/reports/001-acme-2026-04-27.md",
      });
      expect(res.statusCode).toBe(200);
      expect(res.headers["content-type"]).toMatch(/text\/markdown/);
      expect(res.body).toContain("# Acme report");
      expect(res.body).toContain("**URL:** https://acme.example/jobs/1");
    } finally {
      await fastify.close();
    }
  });

  it("GET /reports/<nonexistent>.md returns 404", async () => {
    const { fastify } = buildServer({
      config: makeConfig(tmpRepoRoot),
      adapter: makeAdapter(),
    });
    try {
      const res = await fastify.inject({
        method: "GET",
        url: "/reports/999-missing-2099-01-01.md",
      });
      expect(res.statusCode).toBe(404);
    } finally {
      await fastify.close();
    }
  });

  it("GET /reports/ with a path-traversal filename returns 404 (does not escape reportsDir)", async () => {
    const { fastify } = buildServer({
      config: makeConfig(tmpRepoRoot),
      adapter: makeAdapter(),
    });
    try {
      // Use a .md suffix so the auth allowlist DOES apply (path is treated
      // as a "public" reports request). The route handler must still reject
      // because the filename contains "..", "/" — never letting traversal
      // escape reportsDir even when auth has already passed.
      const res = await fastify.inject({
        method: "GET",
        url: "/reports/..%2Fetc%2Fpasswd.md",
      });
      // Either 404 (route guard rejects) or no 200 leaking /etc/passwd.
      expect(res.statusCode).toBe(404);
      expect(res.body).not.toContain("root:");
    } finally {
      await fastify.close();
    }
  });

  /* ------------------------------------------------------------------ */
  /*  /dashboard/api/* — JSON API endpoints (commit 3)                  */
  /* ------------------------------------------------------------------ */

  describe("GET /dashboard/api/health", () => {
    it("returns 401 without the auth token", async () => {
      const { fastify } = buildServer({
        config: makeConfig(tmpRepoRoot),
        adapter: makeAdapter(),
      });
      try {
        const res = await fastify.inject({
          method: "GET",
          url: "/dashboard/api/health",
        });
        expect(res.statusCode).toBe(401);
      } finally {
        await fastify.close();
      }
    });

    it("returns 200 + downloadsDir override when authenticated", async () => {
      const { fastify } = buildServer({
        config: makeConfig(tmpRepoRoot),
        adapter: makeAdapter(),
        dashboardOverrides: { downloadsDir: "/tmp/test-downloads" },
      });
      try {
        const res = await fastify.inject({
          method: "GET",
          url: "/dashboard/api/health",
          headers: { "x-career-ops-token": TOKEN },
        });
        expect(res.statusCode).toBe(200);
        expect(res.json()).toEqual({
          ok: true,
          downloadsDir: "/tmp/test-downloads",
        });
      } finally {
        await fastify.close();
      }
    });
  });

  describe("POST /dashboard/api/apply-docs/generate", () => {
    it("returns 401 without the auth token", async () => {
      const { fastify } = buildServer({
        config: makeConfig(tmpRepoRoot),
        adapter: makeAdapter(),
      });
      try {
        const res = await fastify.inject({
          method: "POST",
          url: "/dashboard/api/apply-docs/generate",
          payload: { company: "Acme", role: "SWE" },
        });
        expect(res.statusCode).toBe(401);
      } finally {
        await fastify.close();
      }
    });

    it("returns 400 when company is missing", async () => {
      const { fastify } = buildServer({
        config: makeConfig(tmpRepoRoot),
        adapter: makeAdapter(),
        dashboardOverrides: {
          generateDocumentImpl: async () => {
            throw new Error("should not be called when company missing");
          },
        },
      });
      try {
        const res = await fastify.inject({
          method: "POST",
          url: "/dashboard/api/apply-docs/generate",
          headers: { "x-career-ops-token": TOKEN },
          payload: { role: "SWE" },
        });
        expect(res.statusCode).toBe(400);
        expect(res.json()).toEqual({ ok: false, error: "missing company" });
      } finally {
        await fastify.close();
      }
    });

    it("returns 200 + doc fixture when authenticated and stub is wired", async () => {
      const fixture = {
        id: "abc123",
        type: "cv",
        filename: "cv-acme-swe.pdf",
        outputPath: "/tmp/cv-acme-swe.pdf",
      };
      const calls: unknown[] = [];
      const { fastify } = buildServer({
        config: makeConfig(tmpRepoRoot),
        adapter: makeAdapter(),
        dashboardOverrides: {
          generateDocumentImpl: async (body) => {
            calls.push(body);
            return fixture;
          },
        },
      });
      try {
        const res = await fastify.inject({
          method: "POST",
          url: "/dashboard/api/apply-docs/generate",
          headers: { "x-career-ops-token": TOKEN },
          payload: { type: "cv", company: "Acme", role: "SWE" },
        });
        expect(res.statusCode).toBe(200);
        expect(res.json()).toEqual({ ok: true, doc: fixture });
        expect(calls).toHaveLength(1);
      } finally {
        await fastify.close();
      }
    });
  });

  describe("POST /dashboard/api/apply-docs/download", () => {
    it("returns 401 without the auth token", async () => {
      const { fastify } = buildServer({
        config: makeConfig(tmpRepoRoot),
        adapter: makeAdapter(),
      });
      try {
        const res = await fastify.inject({
          method: "POST",
          url: "/dashboard/api/apply-docs/download",
          payload: { id: "abc" },
        });
        expect(res.statusCode).toBe(401);
      } finally {
        await fastify.close();
      }
    });

    it("returns 200 + savedPath when stub is wired", async () => {
      const fixture = {
        id: "abc",
        type: "cv",
        filename: "cv.pdf",
        outputPath: "/tmp/x/cv.pdf",
        savedPath: "/Users/test/Downloads/cv.pdf",
      };
      const { fastify } = buildServer({
        config: makeConfig(tmpRepoRoot),
        adapter: makeAdapter(),
        dashboardOverrides: {
          copyToDownloadsImpl: async (id) => {
            expect(id).toBe("abc");
            return fixture;
          },
        },
      });
      try {
        const res = await fastify.inject({
          method: "POST",
          url: "/dashboard/api/apply-docs/download",
          headers: { "x-career-ops-token": TOKEN },
          payload: { id: "abc" },
        });
        expect(res.statusCode).toBe(200);
        expect(res.json()).toEqual({ ok: true, doc: fixture });
      } finally {
        await fastify.close();
      }
    });
  });

  describe("POST /dashboard/api/apply-status", () => {
    it("returns 401 without the auth token", async () => {
      const { fastify } = buildServer({
        config: makeConfig(tmpRepoRoot),
        adapter: makeAdapter(),
      });
      try {
        const res = await fastify.inject({
          method: "POST",
          url: "/dashboard/api/apply-status",
          payload: { num: 1, applied: true },
        });
        expect(res.statusCode).toBe(401);
      } finally {
        await fastify.close();
      }
    });

    it("returns 200 with status + changed when stub is wired", async () => {
      const calls: unknown[] = [];
      const { fastify } = buildServer({
        config: makeConfig(tmpRepoRoot),
        adapter: makeAdapter(),
        dashboardOverrides: {
          setApplicationStatusImpl: async (body) => {
            calls.push(body);
            return { status: "Applied", changed: true };
          },
        },
      });
      try {
        const res = await fastify.inject({
          method: "POST",
          url: "/dashboard/api/apply-status",
          headers: { "x-career-ops-token": TOKEN },
          payload: { num: 7, applied: true },
        });
        expect(res.statusCode).toBe(200);
        expect(res.json()).toEqual({
          ok: true,
          status: "Applied",
          changed: true,
        });
        expect(calls).toEqual([{ num: 7, applied: true }]);
      } finally {
        await fastify.close();
      }
    });
  });

  describe("POST /dashboard/api/full-evaluation", () => {
    it("returns 401 without the auth token", async () => {
      const { fastify } = buildServer({
        config: makeConfig(tmpRepoRoot),
        adapter: makeAdapter(),
      });
      try {
        const res = await fastify.inject({
          method: "POST",
          url: "/dashboard/api/full-evaluation",
          payload: {
            reportPath: "reports/001-acme-2026-04-27.md",
            company: "Acme",
            role: "SWE",
          },
        });
        expect(res.statusCode).toBe(401);
      } finally {
        await fastify.close();
      }
    });

    it("returns 202 + bridge result and calls postBridge with /v1/evaluate", async () => {
      // queueFullEvaluation (in web/dashboard-handlers.mjs) resolves reportPath
      // relative to its own ROOT — the actual worktree root, not tmpRepoRoot.
      // Write a fixture report into the real reports/ dir so the helper finds
      // it; remove it after the test.
      const realRepoRoot = resolve(
        fileURLToPath(import.meta.url),
        "../../../../..",
      );
      const realReportsDir = join(realRepoRoot, "reports");
      const fixtureFilename = "999-fulleval-fixture-2026-04-27.md";
      const fixtureAbs = join(realReportsDir, fixtureFilename);
      const reportsDirCreated = !existsSync(realReportsDir);
      mkdirSync(realReportsDir, { recursive: true });
      writeFileSync(
        fixtureAbs,
        "# Fixture\n\n**URL:** https://acme.example/jobs/999\n",
        "utf8",
      );

      const calls: { path: string; body: unknown }[] = [];
      const { fastify } = buildServer({
        config: makeConfig(tmpRepoRoot),
        adapter: makeAdapter(),
        dashboardOverrides: {
          postBridgeImpl: async (path, body) => {
            calls.push({ path, body });
            return { jobId: "job-xyz" };
          },
          bridgeBase: "http://test-bridge.local",
        },
      });
      try {
        const res = await fastify.inject({
          method: "POST",
          url: "/dashboard/api/full-evaluation",
          headers: { "x-career-ops-token": TOKEN },
          payload: {
            reportPath: `reports/${fixtureFilename}`,
            company: "Acme",
            role: "SWE",
          },
        });
        expect(res.statusCode).toBe(202);
        expect(res.json()).toEqual({
          ok: true,
          jobId: "job-xyz",
          bridgeBase: "http://test-bridge.local",
        });
        expect(calls).toHaveLength(1);
        expect(calls[0]?.path).toBe("/v1/evaluate");
      } finally {
        await fastify.close();
        rmSync(fixtureAbs, { force: true });
        if (reportsDirCreated) rmSync(realReportsDir, { recursive: true, force: true });
      }
    });
  });

  describe("POST /dashboard/api/full-evaluation/status", () => {
    it("returns 401 without the auth token", async () => {
      const { fastify } = buildServer({
        config: makeConfig(tmpRepoRoot),
        adapter: makeAdapter(),
      });
      try {
        const res = await fastify.inject({
          method: "POST",
          url: "/dashboard/api/full-evaluation/status",
          payload: { jobId: "job-xyz" },
        });
        expect(res.statusCode).toBe(401);
      } finally {
        await fastify.close();
      }
    });

    it("returns 200 + job snapshot when stub is wired", async () => {
      const snapshot = {
        id: "job-xyz",
        phase: "completed",
        updatedAt: "2026-04-27T18:00:00.000Z",
        result: {
          reportPath: "reports/001-acme-2026-04-27.md",
          pdfPath: null,
          trackerMerged: true,
          summary: { score: 4.2, recommendation: "apply" },
        },
      };
      const { fastify } = buildServer({
        config: makeConfig(tmpRepoRoot),
        adapter: makeAdapter(),
        dashboardOverrides: {
          getBridgeImpl: async (path) => {
            expect(path).toBe("/v1/jobs/job-xyz");
            return snapshot;
          },
        },
      });
      try {
        const res = await fastify.inject({
          method: "POST",
          url: "/dashboard/api/full-evaluation/status",
          headers: { "x-career-ops-token": TOKEN },
          payload: { jobId: "job-xyz" },
        });
        expect(res.statusCode).toBe(200);
        const body = res.json() as {
          ok: boolean;
          job: { jobId: string; phase: string; result: unknown };
        };
        expect(body.ok).toBe(true);
        expect(body.job.jobId).toBe("job-xyz");
        expect(body.job.phase).toBe("completed");
      } finally {
        await fastify.close();
      }
    });
  });
});
