#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { chromium } from "playwright";

import { classifyLiveness } from "./liveness-core.mjs";

const SPA_HYDRATE_MS = 2000;

async function probe(page, url) {
  try {
    const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 });
    const status = response?.status() ?? 0;
    await page.waitForTimeout(SPA_HYDRATE_MS);

    const finalUrl = page.url();
    const bodyText = await page.evaluate(() => document.body?.innerText ?? "");
    const applyControls = await page.evaluate(() => {
      const candidates = Array.from(
        document.querySelectorAll(
          'a, button, input[type="submit"], input[type="button"], [role="button"]',
        ),
      );
      return candidates
        .filter((el) => {
          if (el.closest("nav, header, footer")) return false;
          if (el.closest('[aria-hidden="true"]')) return false;
          const style = window.getComputedStyle(el);
          if (style.display === "none" || style.visibility === "hidden") return false;
          if (!el.getClientRects().length) return false;
          return Array.from(el.getClientRects()).some((r) => r.width > 0 && r.height > 0);
        })
        .map((el) =>
          [el.innerText, el.value, el.getAttribute("aria-label"), el.getAttribute("title")]
            .filter(Boolean)
            .join(" ")
            .replace(/\s+/g, " ")
            .trim(),
        )
        .filter(Boolean);
    });

    return classifyLiveness({ status, finalUrl, bodyText, applyControls });
  } catch (err) {
    return { result: "expired", reason: `navigation error: ${err.message.split("\n")[0]}` };
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error("Usage: node check-liveness.mjs <url>...");
    console.error("       node check-liveness.mjs --file urls.txt");
    process.exit(1);
  }

  const urls = args[0] === "--file"
    ? (await readFile(args[1], "utf-8"))
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith("#"))
    : args;

  console.log(`Checking ${urls.length} URL(s).\n`);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const counts = { active: 0, expired: 0, uncertain: 0 };

  for (const url of urls) {
    const { result, reason } = await probe(page, url);
    counts[result]++;
    const tag = { active: "ACTIVE   ", expired: "EXPIRED  ", uncertain: "UNCERTAIN" }[result];
    console.log(`${tag} ${url}`);
    if (result !== "active") console.log(`           ${reason}`);
  }

  await browser.close();
  console.log(`\nactive=${counts.active} expired=${counts.expired} uncertain=${counts.uncertain}`);
  process.exit(counts.expired + counts.uncertain > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("check-liveness failed:", err.message);
  process.exit(1);
});
