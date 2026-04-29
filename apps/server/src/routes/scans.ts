import type { FastifyInstance } from "fastify";
import type { ScanJobEvent, ScanRunRequest } from "../contracts/scan-launch.js";
import type { ScanJobRegistry, ScanLastRunSummary } from "../runtime/scan-job-registry.js";

export interface SpawnRequest extends ScanRunRequest { jobId: string }

export interface SpawnHooks {
  onLog: (type: "stdout" | "stderr", line: string) => void;
  onExit: (code: number) => void;
}

export interface RegisterScanRoutesOptions {
  registry: ScanJobRegistry;
  getCatalogImpl: (opts: { registryLastRunBySkill: Map<string, ScanLastRunSummary> }) => Promise<unknown[]>;
  spawnImpl: (req: SpawnRequest, hooks: SpawnHooks) => void;
}

export async function registerScanRoutes(
  fastify: FastifyInstance,
  opts: RegisterScanRoutesOptions,
): Promise<void> {
  const { registry, getCatalogImpl, spawnImpl } = opts;

  fastify.get("/dashboard/api/scans/catalog", async (_req, reply) => {
    const catalog = await getCatalogImpl({
      registryLastRunBySkill: registry.lastRunBySkill(),
    });
    reply.code(200).send({ ok: true, catalog });
  });

  fastify.post<{ Body: ScanRunRequest }>("/dashboard/api/scans/run", async (req, reply) => {
    const body = req.body ?? ({} as ScanRunRequest);
    if (!body.skillId || !body.runner) {
      reply.code(400).send({ ok: false, error: "skillId and runner are required" });
      return;
    }
    if (registry.isBusy()) {
      reply.code(409).send({ ok: false, error: "another scan is running" });
      return;
    }
    let jobId: string;
    try {
      jobId = registry.start({ skillId: body.skillId, runner: body.runner });
    } catch (err) {
      reply.code(409).send({ ok: false, error: (err as Error).message });
      return;
    }
    spawnImpl(
      { ...body, jobId },
      {
        onLog: (type, line) => registry.appendLog(jobId, type, line),
        onExit: (code) => registry.finish(jobId, code),
      },
    );
    reply.code(202).send({ ok: true, jobId, startedAt: registry.get(jobId)?.startedAt });
  });

  fastify.get<{ Params: { id: string } }>(
    "/dashboard/api/scans/jobs/:id/status",
    async (req, reply) => {
      const job = registry.get(req.params.id);
      if (!job) { reply.code(404).send({ ok: false }); return; }
      reply.code(200).send({ ok: true, job: {
        id: job.id, skillId: job.skillId, runner: job.runner, status: job.status,
        startedAt: job.startedAt, finishedAt: job.finishedAt, exitCode: job.exitCode,
        logTailCount: job.log.length,
      }});
    },
  );

  fastify.get<{ Params: { id: string } }>(
    "/dashboard/api/scans/jobs/:id/stream",
    async (req, reply) => {
      const job = registry.get(req.params.id);
      if (!job) { reply.code(404).send({ ok: false }); return; }
      reply.raw.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        connection: "keep-alive",
      });
      // Replay buffered log first.
      for (const ev of job.log) reply.raw.write(formatSse(ev));
      let lastLen = job.log.length;
      const interval = setInterval(() => {
        const cur = registry.get(req.params.id);
        if (!cur) { clearInterval(interval); reply.raw.end(); return; }
        if (cur.log.length > lastLen) {
          for (let i = lastLen; i < cur.log.length; i++) {
            reply.raw.write(formatSse(cur.log[i]!));
          }
          lastLen = cur.log.length;
        }
        if (cur.status !== "running") { clearInterval(interval); reply.raw.end(); }
      }, 100);
      req.raw.on("close", () => clearInterval(interval));
    },
  );
}

function formatSse(ev: ScanJobEvent): string {
  return `data: ${JSON.stringify(ev)}\n\n`;
}
