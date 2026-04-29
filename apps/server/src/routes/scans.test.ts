import { describe, it, expect } from "vitest";
import Fastify from "fastify";
import { registerScanRoutes } from "./scans.js";
import { createScanJobRegistry } from "../runtime/scan-job-registry.js";
import type { SpawnHooks, SpawnRequest } from "./scans.js";

describe("GET /dashboard/api/scans/catalog", () => {
  it("returns the catalog from the injected getCatalog impl", async () => {
    const app = Fastify();
    await registerScanRoutes(app, {
      registry: createScanJobRegistry(),
      getCatalogImpl: async (_opts) => [
        { id: "scan", label: "X", description: "", npmScript: "scan",
          runners: ["fake"], defaultRunner: "fake", inputs: [], lastRun: null },
      ],
      spawnImpl: () => { throw new Error("not used"); },
    });
    const res = await app.inject({ method: "GET", url: "/dashboard/api/scans/catalog" });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).catalog[0].id).toBe("scan");
    await app.close();
  });
});

describe("POST /dashboard/api/scans/run", () => {
  it("rejects when registry is busy", async () => {
    const app = Fastify();
    const registry = createScanJobRegistry();
    registry.start({ skillId: "scan", runner: "fake" });
    await registerScanRoutes(app, {
      registry,
      getCatalogImpl: async (_opts) => [],
      spawnImpl: () => { throw new Error("should not spawn"); },
    });
    const res = await app.inject({
      method: "POST", url: "/dashboard/api/scans/run",
      payload: { skillId: "scan", runner: "fake", inputs: {} },
    });
    expect(res.statusCode).toBe(409);
    expect(JSON.parse(res.body).error).toMatch(/another scan is running/i);
    await app.close();
  });

  it("starts a job, calls spawnImpl, returns 202 + jobId", async () => {
    const app = Fastify();
    const registry = createScanJobRegistry();
    const spawned: { value: SpawnRequest | null } = { value: null };
    await registerScanRoutes(app, {
      registry,
      getCatalogImpl: async (_opts) => [],
      spawnImpl: (req, hooks) => {
        spawned.value = req;
        queueMicrotask(() => hooks.onExit(0));
      },
    });
    const res = await app.inject({
      method: "POST", url: "/dashboard/api/scans/run",
      payload: { skillId: "scan", runner: "fake", inputs: {} },
    });
    expect(res.statusCode).toBe(202);
    expect(JSON.parse(res.body).jobId).toBeDefined();
    expect(spawned.value?.skillId).toBe("scan");
    await app.close();
  });

  it("returns 400 when skillId or runner is missing", async () => {
    const app = Fastify();
    await registerScanRoutes(app, {
      registry: createScanJobRegistry(),
      getCatalogImpl: async (_opts) => [],
      spawnImpl: () => {},
    });
    const res = await app.inject({
      method: "POST", url: "/dashboard/api/scans/run",
      payload: { runner: "fake", inputs: {} },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});

describe("GET /dashboard/api/scans/jobs/:id/status", () => {
  it("returns 404 for unknown job", async () => {
    const app = Fastify();
    await registerScanRoutes(app, {
      registry: createScanJobRegistry(),
      getCatalogImpl: async (_opts) => [],
      spawnImpl: () => {},
    });
    const res = await app.inject({ method: "GET", url: "/dashboard/api/scans/jobs/missing/status" });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});

describe("GET /dashboard/api/scans/jobs/:id/stream (SSE)", () => {
  it("replays buffered log, streams new events, closes when job ends", async () => {
    const app = Fastify();
    const registry = createScanJobRegistry();
    let logHook: SpawnHooks["onLog"] | null = null;
    let endHook: SpawnHooks["onExit"] | null = null;
    await registerScanRoutes(app, {
      registry,
      getCatalogImpl: async (_opts) => [],
      spawnImpl: (_req, hooks) => { logHook = hooks.onLog; endHook = hooks.onExit; },
    });

    const start = await app.inject({
      method: "POST", url: "/dashboard/api/scans/run",
      payload: { skillId: "scan", runner: "fake", inputs: {} },
    });
    const { jobId } = JSON.parse(start.body);

    // Buffered output before subscription.
    logHook!("stdout", "before subscribe");

    const addr = await app.listen({ port: 0, host: "127.0.0.1" });
    const url = `${addr}/dashboard/api/scans/jobs/${jobId}/stream`;
    const res = await fetch(url);
    expect(res.headers.get("content-type")).toMatch(/text\/event-stream/);

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    const drainUntil = async (predicate: (s: string) => boolean, maxMs = 3000) => {
      const startTs = Date.now();
      while (Date.now() - startTs < maxMs) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value);
        if (predicate(buffer)) return;
      }
      throw new Error(`drain timeout. buffer=${buffer}`);
    };

    await drainUntil((b) => b.includes('"line":"before subscribe"'));
    logHook!("stdout", "after subscribe");
    endHook!(0);
    await drainUntil((b) => b.includes('"type":"end"'));

    expect(buffer).toContain('"line":"after subscribe"');
    expect(buffer).toMatch(/"type":"end".*"exitCode":0/);

    reader.cancel().catch(() => {});
    await app.close();
  });
});
