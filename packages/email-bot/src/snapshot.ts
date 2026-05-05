/**
 * Email-bot audit snapshots.
 *
 * For every verifyLink invocation we write 5 files to
 * data/email-bot-snapshots/{messageId}-{timestamp}/:
 *   - pre-click.html
 *   - pre-click.png
 *   - post-click.html
 *   - post-click.png
 *   - meta.json — sender, subject, extracted url, button selector, click timing
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import type { Tab } from "@auto-job/browser";

const ROOT_DIR = "data/email-bot-snapshots";

export interface SnapshotMeta {
  messageId: string;
  fromHeader: string;
  subject: string;
  url: string;
  buttonSelector: string;
  clickTimingMs: number;
  preClickAt: string;
  postClickAt: string;
  finalUrl: string;
}

export interface SnapshotPaths {
  dir: string;
  preHtml: string;
  prePng: string;
  postHtml: string;
  postPng: string;
  meta: string;
}

export function makeSnapshotDir(messageId: string, rootDir = ROOT_DIR): SnapshotPaths {
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const dir = join(resolve(rootDir), `${messageId}-${ts}`);
  mkdirSync(dir, { recursive: true });
  return {
    dir,
    preHtml: join(dir, "pre-click.html"),
    prePng: join(dir, "pre-click.png"),
    postHtml: join(dir, "post-click.html"),
    postPng: join(dir, "post-click.png"),
    meta: join(dir, "meta.json"),
  };
}

export async function captureHtml(tab: Tab, path: string): Promise<void> {
  const html = await tab
    .evaluate<string>("document.documentElement.outerHTML")
    .catch(() => "<!-- failed to capture HTML -->");
  writeFileSync(path, html, "utf-8");
}

export async function capturePng(tab: Tab, path: string): Promise<void> {
  try {
    const png = await tab.screenshot({ fullPage: true, type: "png" });
    writeFileSync(path, png);
  } catch {
    writeFileSync(path, Buffer.alloc(0));
  }
}

export function writeMeta(path: string, meta: SnapshotMeta): void {
  writeFileSync(path, JSON.stringify(meta, null, 2), "utf-8");
}
