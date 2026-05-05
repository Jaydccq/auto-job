/**
 * Signup snapshot writer — writes pre-form / filled-form / post-submit
 * snapshots plus PII-redacted data.json and meta.json.
 *
 * Snapshot directory: data/signup-snapshots/{ats}-{tenant}-{timestamp}/
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import type { Tab } from "@auto-job/browser";

import type { SignupFormData } from "./types.js";

const ROOT_DIR = "data/signup-snapshots";

export interface SnapshotPaths {
  dir: string;
  preFormHtml: string;
  preFormPng: string;
  filledFormHtml: string;
  filledFormPng: string;
  postSubmitHtml: string;
  postSubmitPng: string;
  meta: string;
  data: string;
}

export function makeSignupSnapshotDir(
  ats: string,
  tenant: string,
  rootDir = ROOT_DIR,
): SnapshotPaths {
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const dir = join(resolve(rootDir), `${ats}-${tenant}-${ts}`);
  mkdirSync(dir, { recursive: true });
  return {
    dir,
    preFormHtml: join(dir, "pre-form.html"),
    preFormPng: join(dir, "pre-form.png"),
    filledFormHtml: join(dir, "filled-form.html"),
    filledFormPng: join(dir, "filled-form.png"),
    postSubmitHtml: join(dir, "post-submit.html"),
    postSubmitPng: join(dir, "post-submit.png"),
    meta: join(dir, "meta.json"),
    data: join(dir, "data.json"),
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

/**
 * Redact secrets and partial PII before writing the data.json file.
 * Password is ALWAYS redacted; email and phone are written verbatim because
 * we may need to re-derive vault key from them.
 */
export function writeRedactedData(path: string, data: SignupFormData): void {
  const redacted = {
    email: data.email,
    password: "<redacted>",
    firstName: data.firstName,
    lastName: data.lastName,
    phone: data.phone ?? null,
  };
  writeFileSync(path, JSON.stringify(redacted, null, 2), "utf-8");
}

export interface MetaInput {
  ats: string;
  tenant: string;
  signupUrl: string;
  vaultRef: string;
  vaultPutAt: string;
  filledAt?: string;
  submittedAt?: string;
  finalUrl?: string;
  appearsSuccessful?: boolean;
  requiresEmailVerification?: boolean;
}

export function writeMeta(path: string, meta: MetaInput): void {
  writeFileSync(path, JSON.stringify(meta, null, 2), "utf-8");
}
