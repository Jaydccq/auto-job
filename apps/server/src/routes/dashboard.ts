/**
 * dashboard.ts — Fastify routes that serve the dashboard HTML, reports,
 * and the dashboard JSON API.
 *
 * Stage 3 / commit 3 scope:
 *   • GET  /dashboard/                       — render dashboard HTML (no auth)
 *   • GET  /dashboard/index.html             — alias for the above (no auth)
 *   • GET  /reports/:filename                — read reports/{NNN-slug-YYYY-MM-DD}.md (no auth)
 *   • GET  /dashboard/api/health             — health probe (auth required)
 *   • POST /dashboard/api/apply-docs/generate    (auth required)
 *   • POST /dashboard/api/apply-docs/download    (auth required)
 *   • POST /dashboard/api/apply-status           (auth required)
 *   • POST /dashboard/api/full-evaluation        (auth required, returns 202)
 *   • POST /dashboard/api/full-evaluation/status (auth required)
 *
 * The dashboard HTML carries the bridge token in a <meta> tag so the inline
 * script can read it and call /dashboard/api/* endpoints with the token in
 * the X-Auto-Job-Token header.
 *
 * The HTML rendering and API helpers are delegated to .mjs modules under
 * web/ — no logic duplication. Tests inject stubbed implementations via
 * DashboardRouteOptions to avoid spawning Playwright / hitting the bridge.
 */

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import type { FastifyInstance, FastifyRequest } from "fastify";

/**
 * Web-impl modules live in <repoRoot>/web/ and are loaded at route-
 * registration time via dynamic import. They were previously static
 * imports keyed off the source-tree layout (../../../../web/...), but
 * that path doesn't survive packaging — the bundled .app's compiled
 * dashboard.js can't reach the user's repo via static relative paths.
 *
 * Resolving via repoRoot at runtime works in dev (tsx/vitest), in the
 * compiled dist tree, and in the packaged Electron app, as long as
 * AUTO_JOB_REPO_ROOT points at a real auto-job checkout.
 */
type DashboardServerImpl = {
  APPLICATIONS_PATH: string;
  DOWNLOADS_DIR: string;
  copyToDownloads: (id: string) => Promise<unknown>;
  generateDocument: (body: unknown) => Promise<unknown>;
  queueFullEvaluation: (
    body: unknown,
    opts?: Record<string, unknown>,
  ) => Promise<unknown>;
  readFullEvaluationStatus: (
    body: unknown,
    opts?: Record<string, unknown>,
  ) => Promise<unknown>;
  setApplicationStatusForFile: (
    path: string,
    body: unknown,
  ) => Promise<{ status: string | null; changed: boolean }>;
};

type RenderDashboardHtmlFn = (opts: {
  extraHead?: string;
  includeGmailSignals?: boolean;
  includeProfile?: boolean;
}) => { html: string };

/**
 * Resolve the directory containing web/build-dashboard.mjs,
 * web/dashboard-handlers.mjs, and web/scan-runner.mjs.
 *
 * Lookup order:
 *   1. AUTO_JOB_WEB_DIR env var — explicit override, set by the
 *      desktop app to point at its bundled extraResources/web.
 *   2. <repoRoot>/web/ — the production path. Both required files
 *      must be present; user repos that predate the dashboard-handlers
 *      split fail this check and fall through.
 *   3. Source-tree fallback relative to this module's file URL. Used
 *      by tests that pass a tmp repoRoot and by npm package test commands.
 */
function resolveWebDir(repoRoot: string): string {
  const envOverride = process.env.AUTO_JOB_WEB_DIR;
  if (
    envOverride &&
    existsSync(resolve(envOverride, "dashboard-handlers.mjs")) &&
    existsSync(resolve(envOverride, "scan-runner.mjs"))
  ) {
    return envOverride;
  }
  const fromRepo = resolve(repoRoot, "web");
  if (
    existsSync(resolve(fromRepo, "build-dashboard.mjs")) &&
    existsSync(resolve(fromRepo, "dashboard-handlers.mjs")) &&
    existsSync(resolve(fromRepo, "scan-runner.mjs"))
  ) {
    return fromRepo;
  }
  const here = dirname(fileURLToPath(import.meta.url));
  // src/routes/dashboard.ts  → 4 up  → repo root /web
  // dist/routes/dashboard.js → 4 up  → repo root /web (mirror layout)
  return resolve(here, "..", "..", "..", "..", "web");
}

async function loadWebImpls(repoRoot: string): Promise<{
  renderDashboardHtml: RenderDashboardHtmlFn;
  serverImpl: DashboardServerImpl;
}> {
  const webDir = resolveWebDir(repoRoot);
  const buildDashboardUrl = pathToFileURL(
    resolve(webDir, "build-dashboard.mjs"),
  ).href;
  const dashboardHandlersUrl = pathToFileURL(
    resolve(webDir, "dashboard-handlers.mjs"),
  ).href;
  const [{ renderDashboardHtml }, serverImpl] = await Promise.all([
    import(buildDashboardUrl) as Promise<{
      renderDashboardHtml: RenderDashboardHtmlFn;
    }>,
    import(dashboardHandlersUrl) as Promise<DashboardServerImpl>,
  ]);
  return { renderDashboardHtml, serverImpl };
}

export interface DashboardRouteOptions {
  /** Bridge auth token. Injected into the dashboard HTML via <meta> tag. */
  token: string;
  /** Repository root — used to resolve reports/<filename>.md. */
  repoRoot: string;
  /* ------------------------------------------------------------------ */
  /* Optional DI hooks (for tests). Production wiring leaves them unset */
  /* and the .mjs defaults take over.                                   */
  /* ------------------------------------------------------------------ */
  generateDocumentImpl?: (body: unknown) => Promise<unknown>;
  copyToDownloadsImpl?: (id: string) => Promise<unknown>;
  setApplicationStatusImpl?: (
    body: unknown,
  ) => Promise<{ status: string | null; changed: boolean }>;
  applicationsPath?: string;
  postBridgeImpl?: (
    path: string,
    body: unknown,
    headers: Record<string, string>,
  ) => Promise<unknown>;
  getBridgeImpl?: (
    path: string,
    headers: Record<string, string>,
  ) => Promise<unknown>;
  bridgeBase?: string;
  /** Override DOWNLOADS_DIR reported by /dashboard/api/health (tests). */
  downloadsDir?: string;
}

const REPORT_FILENAME_PATTERN = /^\d{3}-[A-Za-z0-9._-]+-\d{4}-\d{2}-\d{2}\.md$/;

/**
 * Returns true when the request targets a path that is intentionally
 * exposed without auth: the dashboard HTML and read-only report markdown.
 *
 * Narrow by design: only 3 path patterns. Everything else (including
 * /dashboard/api/*) still goes through the global auth hook.
 */
export function isPublicDashboardPath(req: FastifyRequest): boolean {
  if (req.method !== "GET") return false;
  // Strip query string before matching to avoid bypass via ?foo=...
  const url = req.url ?? "";
  const path = url.split("?")[0] ?? "";
  if (path === "/dashboard/" || path === "/dashboard/index.html") return true;
  if (path.startsWith("/reports/") && path.endsWith(".md")) return true;
  return false;
}

/** Lower-cased version of the auth header — Fastify normalises req.headers to lowercase. */
const AUTH_HEADER_LOWER = "x-auto-job-token";

/**
 * Narrow whitelist for the SSE stream endpoint. The `[^/]+` constraint
 * enforces exactly one path segment for the job id so adversaries can't
 * widen the exception via path traversal (e.g. /scans/jobs/foo/bar/stream).
 */
const SSE_STREAM_PATTERN = /^\/dashboard\/api\/scans\/jobs\/[^/]+\/stream(\?.*)?$/;

/**
 * Pull the candidate auth token from a request.
 *
 * Default behaviour: read the `X-Auto-Job-Token` header.
 *
 * Narrow exception: when the URL matches the SSE stream endpoint
 * (`/dashboard/api/scans/jobs/<id>/stream`), also accept a `?token=`
 * query parameter. Required because `EventSource` cannot set headers.
 * The whitelist is single-path-only so this does NOT widen auth for any
 * other endpoint.
 *
 * Returns `null` when no usable token is present.
 */
export function tokenFromRequest(req: FastifyRequest): string | null {
  const headerVal = req.headers[AUTH_HEADER_LOWER];
  if (typeof headerVal === "string" && headerVal.length > 0) return headerVal;

  const url = req.url ?? "";
  if (SSE_STREAM_PATTERN.test(url)) {
    const qIdx = url.indexOf("?");
    if (qIdx >= 0) {
      const params = new URLSearchParams(url.slice(qIdx + 1));
      const t = params.get("token");
      if (t && t.length > 0) return t;
    }
  }
  return null;
}

function escapeHtmlAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function registerDashboardRoutes(
  fastify: FastifyInstance,
  options: DashboardRouteOptions,
): Promise<void> {
  const { token, repoRoot } = options;

  const { renderDashboardHtml, serverImpl } = await loadWebImpls(repoRoot);
  const {
    APPLICATIONS_PATH: DEFAULT_APPLICATIONS_PATH,
    DOWNLOADS_DIR: DEFAULT_DOWNLOADS_DIR,
    copyToDownloads: defaultCopyToDownloads,
    generateDocument: defaultGenerateDocument,
    queueFullEvaluation: defaultQueueFullEvaluation,
    readFullEvaluationStatus: defaultReadFullEvaluationStatus,
    setApplicationStatusForFile: defaultSetApplicationStatusForFile,
  } = serverImpl;

  const renderHtml = (): string => {
    const metaTag =
      `<meta name="auto-job-token" content="${escapeHtmlAttr(token)}">`;
    const { html } = renderDashboardHtml({
      extraHead: metaTag,
      includeGmailSignals: true,
      includeProfile: true,
    });
    return html;
  };

  fastify.get("/dashboard/", async (_req, reply) => {
    const html = renderHtml();
    reply.code(200).header("content-type", "text/html; charset=utf-8").send(html);
  });

  fastify.get("/dashboard/index.html", async (_req, reply) => {
    const html = renderHtml();
    reply.code(200).header("content-type", "text/html; charset=utf-8").send(html);
  });

  const reportsDir = resolve(repoRoot, "reports");

  fastify.get<{ Params: { filename: string } }>(
    "/reports/:filename",
    async (req, reply) => {
      const filename = req.params.filename;
      if (
        !filename ||
        filename.includes("/") ||
        filename.includes("\\") ||
        filename.includes("..") ||
        !REPORT_FILENAME_PATTERN.test(filename)
      ) {
        reply.code(404).send({ ok: false, error: "report not found" });
        return;
      }
      const abs = resolve(reportsDir, filename);
      if (!abs.startsWith(reportsDir + sep) || !existsSync(abs)) {
        reply.code(404).send({ ok: false, error: "report not found" });
        return;
      }
      const markdown = await readFile(abs, "utf8");
      reply
        .code(200)
        .header("content-type", "text/markdown; charset=utf-8")
        .send(markdown);
    },
  );

  /* -------------------------------------------------------------------- */
  /* Dashboard JSON API (auth-gated by the global preHandler hook)        */
  /* -------------------------------------------------------------------- */

  const downloadsDir = options.downloadsDir ?? DEFAULT_DOWNLOADS_DIR;
  const applicationsPath =
    options.applicationsPath ?? DEFAULT_APPLICATIONS_PATH;
  const bridgeBase = options.bridgeBase;

  const generateDocument = options.generateDocumentImpl ?? defaultGenerateDocument;
  const copyToDownloads = options.copyToDownloadsImpl ?? defaultCopyToDownloads;
  const setApplicationStatus =
    options.setApplicationStatusImpl ??
    ((body: unknown) =>
      defaultSetApplicationStatusForFile(applicationsPath, body));

  fastify.get("/dashboard/api/health", async (_req, reply) => {
    reply.code(200).send({ ok: true, downloadsDir });
  });

  fastify.post("/dashboard/api/apply-docs/generate", async (req, reply) => {
    const body = isPlainObject(req.body) ? req.body : {};
    if (!body.company || typeof body.company !== "string" || !body.company.trim()) {
      reply.code(400).send({ ok: false, error: "missing company" });
      return;
    }
    const doc = await generateDocument(body);
    reply.code(200).send({ ok: true, doc });
  });

  fastify.post("/dashboard/api/apply-docs/download", async (req, reply) => {
    const body = isPlainObject(req.body) ? req.body : {};
    if (!body.id || typeof body.id !== "string") {
      reply.code(400).send({ ok: false, error: "id is required" });
      return;
    }
    const doc = await copyToDownloads(body.id);
    reply.code(200).send({ ok: true, doc });
  });

  fastify.post("/dashboard/api/apply-status", async (req, reply) => {
    const body = isPlainObject(req.body) ? req.body : {};
    const result = await setApplicationStatus(body);
    reply
      .code(200)
      .send({ ok: true, status: result.status, changed: result.changed });
  });

  fastify.post("/dashboard/api/full-evaluation", async (req, reply) => {
    const body = isPlainObject(req.body) ? req.body : {};
    const opts: Record<string, unknown> = {};
    if (options.postBridgeImpl) opts.postBridge = options.postBridgeImpl;
    if (bridgeBase) opts.bridgeBase = bridgeBase;
    const result = (await defaultQueueFullEvaluation(body, opts)) as Record<
      string,
      unknown
    >;
    reply.code(202).send({ ok: true, ...result });
  });

  fastify.post("/dashboard/api/full-evaluation/status", async (req, reply) => {
    const body = isPlainObject(req.body) ? req.body : {};
    const opts: Record<string, unknown> = {};
    if (options.getBridgeImpl) opts.getBridge = options.getBridgeImpl;
    const job = await defaultReadFullEvaluationStatus(body, opts);
    reply.code(200).send({ ok: true, job });
  });
}
