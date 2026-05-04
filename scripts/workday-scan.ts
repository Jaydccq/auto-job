#!/usr/bin/env tsx
/**
 * Read-only smoke command for the Workday adapter.
 *
 * Usage:
 *   npm run workday-scan -- --tenant amazon --query "software engineer" --limit 10
 *   npm run workday-scan -- --url "https://salesforce.wd1.myworkdayjobs.com/External_Career_Site" --limit 20
 *
 * No tracker writes, no evaluation. Exists to validate the adapter end-to-end
 * against live tenants. Auto-apply / scoring lives in the score → evaluate
 * pipeline (separate scripts and OpenSpec phases).
 */

import { BrowserController } from "../packages/browser/src/browser-controller.ts";
import { AdapterParseError } from "../packages/browser/src/errors.ts";
import {
  searchWorkday,
  type WorkdayCenter,
  type WorkdaySearchOptions,
} from "../packages/browser/src/sites/workday/index.ts";

interface CliOptions {
  tenant: string | null;
  url: string | null;
  wdCenter: WorkdayCenter | null;
  sitePath: string | null;
  query: string | null;
  limit: number;
  offset: number;
  help: boolean;
}

function usage(): string {
  return `auto-job Workday scan via @auto-job/browser

Usage:
  npm run workday-scan -- --tenant <slug> [options]
  npm run workday-scan -- --url <board-url> [options]

Options:
  --tenant <slug>            Workday tenant (e.g. amazon, salesforce, adobe).
  --url <full-url>           Full board URL (e.g. https://amazon.wd5.myworkdayjobs.com/External_Career_Site).
                             Mutually exclusive with --tenant.
  --wd-center <wd1|wd3|wd5>  Workday data center. Default: wd5.
  --site-path <path>         Site path (e.g. External_Career_Site). Auto-probed when omitted.
  --query <text>             Free-text search keyword.
  --limit <n>                Page size. Default: 20.
  --offset <n>               Pagination offset. Default: 0.
  --help                     Show this help.

Notes:
  This is a READ-ONLY smoke command. No tracker writes, no evaluation.
  For full scan-and-evaluate workflow use the existing scan commands.
`;
}

function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = {
    tenant: null,
    url: null,
    wdCenter: null,
    sitePath: null,
    query: null,
    limit: 20,
    offset: 0,
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    const next = () => {
      const v = argv[i + 1];
      if (!v || v.startsWith("--")) {
        throw new Error(`Missing value for ${a}`);
      }
      i++;
      return v;
    };
    switch (a) {
      case "--tenant":
        opts.tenant = next();
        break;
      case "--url":
        opts.url = next();
        break;
      case "--wd-center": {
        const v = next();
        if (v !== "wd1" && v !== "wd3" && v !== "wd5") {
          throw new Error(`--wd-center must be wd1, wd3, or wd5; got "${v}"`);
        }
        opts.wdCenter = v;
        break;
      }
      case "--site-path":
        opts.sitePath = next();
        break;
      case "--query":
        opts.query = next();
        break;
      case "--limit":
        opts.limit = Number.parseInt(next(), 10);
        if (Number.isNaN(opts.limit) || opts.limit <= 0) throw new Error("--limit must be a positive int");
        break;
      case "--offset":
        opts.offset = Number.parseInt(next(), 10);
        if (Number.isNaN(opts.offset) || opts.offset < 0) throw new Error("--offset must be non-negative int");
        break;
      case "--help":
      case "-h":
        opts.help = true;
        break;
      default:
        throw new Error(`Unknown flag: ${a}`);
    }
  }
  if (!opts.tenant && !opts.url && !opts.help) {
    throw new Error("Either --tenant or --url is required");
  }
  return opts;
}

async function main(): Promise<number> {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    process.stdout.write(usage());
    return 0;
  }

  const searchOpts: WorkdaySearchOptions = {
    limit: opts.limit,
    offset: opts.offset,
  };
  if (opts.tenant) searchOpts.tenant = opts.tenant;
  if (opts.url) searchOpts.url = opts.url;
  if (opts.wdCenter) searchOpts.wdCenter = opts.wdCenter;
  if (opts.sitePath) searchOpts.sitePath = opts.sitePath;
  if (opts.query) searchOpts.query = opts.query;

  console.log(`Connecting to dedicated Chrome (port 47320)...`);
  const controller = await BrowserController.ensure();
  const tab = await controller.openTab("about:blank");
  try {
    console.log(`Querying Workday: tenant=${opts.tenant ?? "(from url)"} query="${opts.query ?? ""}"`);
    const result = await searchWorkday(tab, searchOpts);
    console.log("");
    console.log(
      `Workday[${result.tenant}] sitePath=${result.sitePath} wdCenter=${result.wdCenter}`,
    );
    console.log(`Total available: ${result.totalAvailable} | returned this page: ${result.count}`);
    console.log("");
    result.jobs.forEach((j, i) => {
      console.log(`${i + 1}. [${j.id}] ${j.title}`);
      console.log(`   ${j.location}  |  ${j.postedAgo}`);
      if (j.url) console.log(`   ${j.url}`);
    });
    return 0;
  } catch (err) {
    if (err instanceof AdapterParseError) {
      console.error(`AdapterParseError: ${err.message}`);
      if (err.rawSnippet) console.error(`Raw snippet: ${err.rawSnippet}`);
      return 2;
    }
    throw err;
  } finally {
    await tab.close().catch(() => undefined);
    await controller.close().catch(() => undefined);
  }
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error(err instanceof Error ? err.stack ?? err.message : String(err));
    process.exit(1);
  },
);
