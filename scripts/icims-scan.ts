#!/usr/bin/env tsx
/**
 * Read-only smoke command for the iCIMS adapter.
 *
 * Usage:
 *   npm run icims-scan -- --tenant disney --query "engineer" --limit 10
 *   npm run icims-scan -- --url "https://careers-comcast.icims.com/jobs/search" --limit 20
 *
 * No tracker writes, no evaluation. Output reports `resolvedVia` so the
 * operator can see whether the v3 API or HTML scrape produced the data.
 */

import { BrowserController } from "../packages/browser/src/browser-controller.ts";
import { AdapterParseError } from "../packages/browser/src/errors.ts";
import {
  searchICIMS,
  type ICIMSSearchOptions,
} from "../packages/browser/src/sites/icims/index.ts";

interface CliOptions {
  tenant: string | null;
  url: string | null;
  query: string | null;
  limit: number;
  help: boolean;
}

function usage(): string {
  return `auto-job iCIMS scan via @auto-job/browser

Usage:
  npm run icims-scan -- --tenant <slug> [options]
  npm run icims-scan -- --url <board-url> [options]

Options:
  --tenant <slug>     iCIMS tenant (e.g. disney, comcast).
  --url <full-url>    Full board URL (e.g. https://careers-disney.icims.com/jobs/search).
                      Mutually exclusive with --tenant.
  --query <text>      Free-text search keyword.
  --limit <n>         Page size. Default: 20.
  --help              Show this help.

Notes:
  This is a READ-ONLY smoke command. The adapter tries the v3 JSON API first,
  falls back to HTML scrape on older tenants. Output reports which mechanism
  succeeded ("resolvedVia").
`;
}

function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = {
    tenant: null,
    url: null,
    query: null,
    limit: 20,
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
      case "--query":
        opts.query = next();
        break;
      case "--limit":
        opts.limit = Number.parseInt(next(), 10);
        if (Number.isNaN(opts.limit) || opts.limit <= 0) throw new Error("--limit must be a positive int");
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

  const searchOpts: ICIMSSearchOptions = { limit: opts.limit };
  if (opts.tenant) searchOpts.tenant = opts.tenant;
  if (opts.url) searchOpts.url = opts.url;
  if (opts.query) searchOpts.query = opts.query;

  console.log(`Connecting to dedicated Chrome (port 47320)...`);
  const controller = await BrowserController.ensure();
  const tab = await controller.openTab("about:blank");
  try {
    console.log(`Querying iCIMS: tenant=${opts.tenant ?? "(from url)"} query="${opts.query ?? ""}"`);
    const result = await searchICIMS(tab, searchOpts);
    console.log("");
    console.log(`iCIMS[${result.tenant}] resolvedVia=${result.resolvedVia}`);
    console.log(`Total available: ${result.totalAvailable} | returned this page: ${result.count}`);
    console.log("");
    result.jobs.forEach((j, i) => {
      console.log(`${i + 1}. [${j.id}] ${j.title}`);
      console.log(`   ${j.location}  |  ${j.postedAt}`);
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
