#!/usr/bin/env node

import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";

const PROTOCOL_VERSION = "1.0.0";
const DEFAULT_BRIDGE_BASE = "http://127.0.0.1:47319";
const DEFAULT_EVALUATION_MODE = "newgrad_quick";
const DEFAULT_DELAY_MS = 2100;
const DEFAULT_POLL_MS = 5000;
const DEFAULT_TIMEOUT_MS = 20 * 60 * 1000;

const repoRoot = resolve(new URL("..", import.meta.url).pathname);

function usage() {
  return `Usage: node --input-type=module -e "await import('./scripts/queue-linkedin-evaluations.mjs')" -- --source-log <path> [options]

Options:
  --source-log <path>       LinkedIn scan JSONL containing detail_gate_passed events.
  --limit <n>               Queue at most n candidates.
  --bridge-base <url>       Bridge base URL. Default: ${DEFAULT_BRIDGE_BASE}
  --evaluation-mode <mode>  Evaluation mode. Default: ${DEFAULT_EVALUATION_MODE}
  --delay-ms <n>            Delay between queue requests. Default: ${DEFAULT_DELAY_MS}
  --poll-ms <n>             Poll interval while waiting. Default: ${DEFAULT_POLL_MS}
  --timeout-ms <n>          Wait timeout. Default: ${DEFAULT_TIMEOUT_MS}
  --no-wait                 Queue jobs but do not wait for completion.
  --help                    Show this help.`;
}

function parseArgs(argv) {
  const options = {
    sourceLog: null,
    limit: null,
    bridgeBase: DEFAULT_BRIDGE_BASE,
    evaluationMode: DEFAULT_EVALUATION_MODE,
    delayMs: DEFAULT_DELAY_MS,
    pollMs: DEFAULT_POLL_MS,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    wait: true,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error(`${arg} requires a value`);
      }
      index += 1;
      return value;
    };

    switch (arg) {
      case "--source-log":
        options.sourceLog = next();
        break;
      case "--limit":
        options.limit = positiveInt(next(), arg);
        break;
      case "--bridge-base":
        options.bridgeBase = next().replace(/\/+$/, "");
        break;
      case "--evaluation-mode":
        options.evaluationMode = next();
        break;
      case "--delay-ms":
        options.delayMs = nonNegativeInt(next(), arg);
        break;
      case "--poll-ms":
        options.pollMs = positiveInt(next(), arg);
        break;
      case "--timeout-ms":
        options.timeoutMs = positiveInt(next(), arg);
        break;
      case "--no-wait":
        options.wait = false;
        break;
      case "--help":
        options.help = true;
        break;
      default:
        throw new Error(`unknown argument: ${arg}`);
    }
  }

  return options;
}

function positiveInt(raw, label) {
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive integer`);
  }
  return value;
}

function nonNegativeInt(raw, label) {
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative integer`);
  }
  return value;
}

async function main() {
  const argv = process.argv[1]?.startsWith("--") ? process.argv.slice(1) : process.argv.slice(2);
  const options = parseArgs(argv);
  if (options.help) {
    console.log(usage());
    return;
  }
  if (!options.sourceLog) {
    throw new Error("missing --source-log");
  }

  const token = (await readFile(join(repoRoot, "apps", "server", ".bridge-token"), "utf8")).trim();
  const sourceLog = resolve(repoRoot, options.sourceLog);
  const queueRunId = createRunId();
  const queueLog = join(repoRoot, "data", "scan-runs", `${queueRunId}.jsonl`);
  const summaryPath = join(repoRoot, "data", "scan-runs", `${queueRunId}-summary.json`);
  await mkdir(join(repoRoot, "data", "scan-runs"), { recursive: true });

  const record = async (event, extra = {}) => {
    await writeFile(
      queueLog,
      `${JSON.stringify({ at: new Date().toISOString(), queueRunId, source: "linkedin-evaluation-queue", event, ...extra })}\n`,
      { flag: "a" },
    );
  };

  const scanCandidates = await readDetailGatePassed(sourceLog);
  const pipelineRows = await readPipelineRows();
  const candidates = scanCandidates
    .map((candidate) => ({ ...candidate, pipeline: pipelineRows.get(normalizeUrl(candidate.url)) }))
    .filter((candidate) => candidate.pipeline)
    .slice(0, options.limit ?? undefined);

  await record("queue_started", {
    sourceLog: relativePath(sourceLog),
    candidateCount: candidates.length,
    scanCandidateCount: scanCandidates.length,
    bridgeBase: options.bridgeBase,
    evaluationMode: options.evaluationMode,
    wait: options.wait,
  });

  await assertBridgeHealthy(options.bridgeBase, token);
  await record("bridge_health_ok");

  const queued = [];
  const queueFailed = [];

  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index];
    console.log(`Queueing ${index + 1}/${candidates.length}: ${candidate.company} - ${candidate.role}`);

    try {
      const input = await buildEvaluationInput(candidate, options.evaluationMode);
      const created = await postEnvelope(options.bridgeBase, token, "/v1/evaluate", { input });
      const item = {
        jobId: created.jobId,
        company: candidate.company,
        role: candidate.role,
        url: candidate.url,
      };
      queued.push(item);
      await record("evaluation_queued", item);
    } catch (error) {
      const item = {
        company: candidate.company,
        role: candidate.role,
        url: candidate.url,
        error: error instanceof Error ? error.message : String(error),
      };
      queueFailed.push(item);
      await record("evaluation_queue_failed", item);
    }

    if (index < candidates.length - 1 && options.delayMs > 0) {
      await sleep(options.delayMs);
    }
  }

  await record("queue_completed", { queued: queued.length, queueFailed: queueFailed.length });
  console.log(`Queued ${queued.length}/${candidates.length}; queueFailed=${queueFailed.length}; log=${relativePath(queueLog)}`);

  const results = options.wait
    ? await waitForEvaluations(options.bridgeBase, token, queued, options, record)
    : { completed: [], failed: [], timedOut: queued };

  const summary = {
    queueRunId,
    sourceLog: relativePath(sourceLog),
    queueLog: relativePath(queueLog),
    queued: queued.length,
    queueFailed: queueFailed.length,
    completed: results.completed.length,
    failed: results.failed.length,
    timedOut: results.timedOut.length,
    jobs: {
      queued,
      completed: results.completed,
      failed: results.failed,
      timedOut: results.timedOut,
      failedQueue: queueFailed,
    },
  };
  await writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);
  await record("queue_run_finished", {
    summaryPath: relativePath(summaryPath),
    completed: summary.completed,
    failed: summary.failed,
    timedOut: summary.timedOut,
  });
  console.log(JSON.stringify({ summaryPath: relativePath(summaryPath), queueLog: relativePath(queueLog), queued: summary.queued, completed: summary.completed, failed: summary.failed, timedOut: summary.timedOut }, null, 2));
}

async function readDetailGatePassed(sourceLog) {
  const text = await readFile(sourceLog, "utf8");
  const byUrl = new Map();
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const event = JSON.parse(line);
    if (event.event !== "detail_gate_passed" || !event.url) continue;
    byUrl.set(normalizeUrl(event.url), {
      company: stringValue(event.company),
      role: stringValue(event.role),
      url: stringValue(event.url),
      source: stringValue(event.source) || "linkedin-scan",
      score: numberValue(event.score),
      valueScore: numberValue(event.valueScore),
      valueReasons: Array.isArray(event.valueReasons) ? event.valueReasons.map(String) : [],
    });
  }
  return Array.from(byUrl.values());
}

async function readPipelineRows() {
  const text = await readFile(join(repoRoot, "data", "pipeline.md"), "utf8");
  const rows = new Map();
  const pattern = /^- \[ \] (?<url>\S+) \u2014 (?<company>.+?) \| (?<role>.+?) \(via (?<source>[^,]+), score: (?<score>[^,]+), value: (?<value>[^)]+)\)(?: \[value-reasons:(?<reasons>[^\]]*)\])?(?: \[local:(?<local>[^\]]+)\])?/;
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(pattern);
    if (!match?.groups) continue;
    const url = normalizeUrl(match.groups.url);
    rows.set(url, {
      url: match.groups.url,
      company: match.groups.company,
      role: match.groups.role,
      source: match.groups.source,
      score: parseScore(match.groups.score),
      valueScore: parseValueScore(match.groups.value),
      valueReasons: match.groups.reasons ? match.groups.reasons.split("|").filter(Boolean) : [],
      localPath: match.groups.local ?? null,
    });
  }
  return rows;
}

async function buildEvaluationInput(candidate, evaluationMode) {
  const local = candidate.pipeline.localPath ? await readLocalJob(candidate.pipeline.localPath) : null;
  const company = local?.frontmatter.company ?? candidate.company;
  const role = local?.frontmatter.role ?? candidate.role;
  const salaryRange = local?.frontmatter.salary;
  const location = local?.frontmatter.location;
  const sponsorshipSupport = local?.frontmatter.h1b;
  const body = local?.body ?? "";
  const skillTags = extractCommaLine(body, "Skill tags:");
  const recommendationTags = extractCommaLine(body, "Recommendation tags:");
  const requiredQualifications = extractSection(body, ["Desired Capabilities", "Requirements", "Qualifications"], ["Extra Credit", "Responsibilities", "What You'll Do", "Perks"], 10);
  const responsibilities = extractSection(body, ["What You'll Do", "Responsibilities"], ["Desired Capabilities", "Requirements", "Qualifications", "Extra Credit", "Perks"], 8);
  const valueReasons = candidate.valueReasons.length > 0 ? candidate.valueReasons : candidate.pipeline.valueReasons;

  return {
    url: candidate.url,
    title: role,
    evaluationMode,
    structuredSignals: {
      source: candidate.source || candidate.pipeline.source,
      company,
      role,
      ...(location ? { location } : {}),
      ...(salaryRange ? { salaryRange } : {}),
      ...(sponsorshipSupport ? { sponsorshipSupport } : {}),
      skillTags: signalStrings(skillTags, 14, 120),
      recommendationTags: signalStrings(recommendationTags, 10, 120),
      requiredQualifications: signalStrings(requiredQualifications, 10, 400),
      responsibilities: signalStrings(responsibilities, 8, 400),
      ...(candidate.valueScore !== null || candidate.pipeline.valueScore !== null
        ? { localValueScore: candidate.valueScore ?? candidate.pipeline.valueScore }
        : {}),
      ...(valueReasons.length > 0 ? { localValueReasons: signalStrings(valueReasons, 16, 120) } : {}),
    },
    detection: {
      label: "job_posting",
      confidence: 1,
      signals: ["linkedin-scan", basename(candidate.pipeline.localPath ?? "")].filter(Boolean),
    },
    pageText: buildPageText({
      url: candidate.url,
      company,
      role,
      location,
      salaryRange,
      score: candidate.score ?? candidate.pipeline.score,
      valueScore: candidate.valueScore ?? candidate.pipeline.valueScore,
      valueReasons,
      body,
    }),
  };
}

async function readLocalJob(localPath) {
  const fullPath = resolve(repoRoot, localPath);
  const text = await readFile(fullPath, "utf8");
  const match = text.match(/^---\n(?<frontmatter>[\s\S]*?)\n---\n(?<body>[\s\S]*)$/);
  if (!match?.groups) return { frontmatter: {}, body: text };
  return {
    frontmatter: parseFrontmatter(match.groups.frontmatter),
    body: match.groups.body.trim(),
  };
}

function parseFrontmatter(text) {
  const values = {};
  for (const line of text.split(/\r?\n/)) {
    const separator = line.indexOf(":");
    if (separator < 0) continue;
    const key = stripQuotes(line.slice(0, separator).trim());
    const value = stripQuotes(line.slice(separator + 1).trim());
    if (key) values[key] = value;
  }
  return values;
}

function stripQuotes(value) {
  return value.replace(/^["']|["']$/g, "");
}

function extractCommaLine(text, label) {
  const line = text.split(/\r?\n/).find((item) => item.startsWith(label));
  if (!line) return [];
  return line.slice(label.length).split(",").map((item) => item.trim()).filter(Boolean);
}

function extractSection(text, starts, stops, maxItems) {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const startIndex = lines.findIndex((line) => starts.some((start) => line.toLowerCase() === start.toLowerCase()));
  if (startIndex < 0) return [];
  const items = [];
  for (const line of lines.slice(startIndex + 1)) {
    if (stops.some((stop) => line.toLowerCase() === stop.toLowerCase())) break;
    if (line.startsWith("- ")) {
      items.push(line.slice(2).trim());
    } else if (!line.endsWith(":") && line.length > 20) {
      items.push(line);
    }
    if (items.length >= maxItems) break;
  }
  return items;
}

function buildPageText(input) {
  return [
    `URL: ${input.url}`,
    `Company: ${input.company}`,
    `Role: ${input.role}`,
    input.location ? `Location: ${input.location}` : null,
    input.salaryRange ? `Salary: ${input.salaryRange}` : null,
    input.score !== null ? `Local newgrad score: ${input.score}` : null,
    input.valueScore !== null ? `Local enrich value score: ${input.valueScore}/10` : null,
    input.valueReasons.length > 0 ? `Local enrich reasons: ${input.valueReasons.join(", ")}` : null,
    input.body ? `Description excerpt:\n${input.body.slice(0, 3500)}` : null,
  ].filter(Boolean).join("\n\n").slice(0, 4000);
}

async function assertBridgeHealthy(bridgeBase, token) {
  const health = await getEnvelope(bridgeBase, token, "/v1/health");
  if (!health?.execution?.mode) {
    throw new Error("bridge health response did not include execution mode");
  }
}

async function waitForEvaluations(bridgeBase, token, jobs, options, record) {
  const pending = new Map(jobs.map((job) => [job.jobId, job]));
  const completed = [];
  const failed = [];
  const started = Date.now();

  while (pending.size > 0 && Date.now() - started < options.timeoutMs) {
    await sleep(options.pollMs);
    for (const [jobId, job] of Array.from(pending.entries())) {
      const snapshot = await getEnvelope(bridgeBase, token, `/v1/jobs/${jobId}`);
      if (snapshot.phase === "completed") {
        const item = summarizeJob(job, snapshot);
        completed.push(item);
        pending.delete(jobId);
        await record("evaluation_completed", item);
        console.log(`Completed ${completed.length}/${jobs.length}: ${job.company} - ${job.role}`);
      } else if (snapshot.phase === "failed") {
        const item = {
          ...job,
          error: snapshot.error?.message ?? "evaluation failed",
        };
        failed.push(item);
        pending.delete(jobId);
        await record("evaluation_failed", item);
        console.log(`Failed ${failed.length}/${jobs.length}: ${job.company} - ${job.role}`);
      }
    }
  }

  const timedOut = Array.from(pending.values());
  for (const item of timedOut) {
    await record("evaluation_timed_out", item);
  }
  return { completed, failed, timedOut };
}

function summarizeJob(job, snapshot) {
  return {
    ...job,
    phase: snapshot.phase,
    updatedAt: snapshot.updatedAt,
    score: snapshot.result?.summary?.score ?? null,
    recommendation: snapshot.result?.summary?.recommendation ?? null,
    reportPath: snapshot.result?.reportPath ?? null,
    trackerMerged: snapshot.result?.trackerMerged ?? null,
  };
}

async function postEnvelope(bridgeBase, token, path, payload) {
  const res = await fetch(`${bridgeBase}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-career-ops-token": token,
    },
    body: JSON.stringify({
      protocol: PROTOCOL_VERSION,
      requestId: `linkedin-eval-${randomUUID()}`,
      clientTimestamp: new Date().toISOString(),
      payload,
    }),
  });
  const body = await res.json();
  if (!body.ok) {
    throw new Error(`${path} failed: ${body.error?.code ?? "UNKNOWN"} ${body.error?.message ?? ""}`.trim());
  }
  return body.result;
}

async function getEnvelope(bridgeBase, token, path) {
  const res = await fetch(`${bridgeBase}${path}`, {
    headers: { "x-career-ops-token": token },
  });
  const body = await res.json();
  if (!body.ok) {
    throw new Error(`${path} failed: ${body.error?.code ?? "UNKNOWN"} ${body.error?.message ?? ""}`.trim());
  }
  return body.result;
}

function signalStrings(values, maxItems, maxLength) {
  return values
    .map((value) => String(value).trim())
    .filter(Boolean)
    .slice(0, maxItems)
    .map((value) => value.length > maxLength ? value.slice(0, maxLength).trimEnd() : value);
}

function normalizeUrl(raw) {
  try {
    const url = new URL(String(raw).trim());
    url.hash = "";
    for (const key of Array.from(url.searchParams.keys())) {
      if (/^utm_/i.test(key) || key === "trk" || key === "refId") {
        url.searchParams.delete(key);
      }
    }
    return url.toString();
  } catch {
    return String(raw).trim();
  }
}

function parseScore(raw) {
  const match = String(raw).match(/^(\d+(?:\.\d+)?)/);
  return match ? Number(match[1]) : null;
}

function parseValueScore(raw) {
  const match = String(raw).match(/^(\d+(?:\.\d+)?)/);
  return match ? Number(match[1]) : null;
}

function numberValue(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stringValue(value) {
  return typeof value === "string" ? value : "";
}

function createRunId() {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  return `linkedin-eval-${stamp}-${randomUUID().slice(0, 8)}`;
}

function relativePath(path) {
  return path.startsWith(repoRoot) ? path.slice(repoRoot.length + 1) : path;
}

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
