/**
 * Review snapshot writer.
 *
 * After every fill (regardless of submit outcome), we write 5 files to
 * data/apply-snapshots/{id}-{timestamp}/:
 *   - form.html        — full-page HTML
 *   - screenshot.png   — full-page screenshot
 *   - data.json        — what was filled (password REDACTED)
 *   - result.json      — FillResult counts + skipped fields
 *   - MANIFEST.txt     — human-readable summary for fast eyeballing (Phase 2C)
 *
 * The user can inspect any apply attempt before deciding to approve real submit.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import type { Tab } from "@auto-job/browser";

import type { ApplicationData, FillResult, FormSchemaField } from "./types.js";

const ROOT_DIR = "data/apply-snapshots";

export interface SnapshotInputs {
  id: string;
  ats: string;
  data: ApplicationData;
  result: Omit<FillResult, "reviewSnapshotPath">;
  /** Optional override for the snapshot root (used by tests). */
  rootDir?: string;
  /** Optional Phase 2C extras for the MANIFEST.txt human-readable summary. */
  manifest?: {
    jobUrl?: string;
    tenant?: string;
    score?: number;
  };
}

/** Write all 4 snapshot files; returns the directory path. */
export async function writeReviewSnapshot(
  tab: Tab,
  inputs: SnapshotInputs,
): Promise<string> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dirName = `${inputs.id}-${timestamp}`;
  const root = resolve(inputs.rootDir ?? ROOT_DIR);
  const dir = join(root, dirName);
  mkdirSync(dir, { recursive: true });

  // form.html — page content via evaluate
  const html = await tab
    .evaluate<string>("document.documentElement.outerHTML")
    .catch(() => "<!-- failed to capture HTML -->");
  writeFileSync(join(dir, "form.html"), html, "utf-8");

  // screenshot.png — full-page screenshot
  try {
    const png = await tab.screenshot({ fullPage: true, type: "png" });
    writeFileSync(join(dir, "screenshot.png"), png);
  } catch {
    writeFileSync(join(dir, "screenshot.png"), Buffer.alloc(0));
  }

  // data.json — REDACTED copy of ApplicationData
  writeFileSync(
    join(dir, "data.json"),
    JSON.stringify(redactSecrets(inputs.data, inputs.ats), null, 2),
    "utf-8",
  );

  // result.json — FillResult summary
  writeFileSync(
    join(dir, "result.json"),
    JSON.stringify({ ats: inputs.ats, ...inputs.result }, null, 2),
    "utf-8",
  );

  // MANIFEST.txt — human-readable summary (Phase 2C). Operator sees this
  // first when eyeballing the snapshot before approving real submit.
  writeFileSync(join(dir, "MANIFEST.txt"), buildManifest(inputs), "utf-8");

  return dir;
}

function buildManifest(inputs: SnapshotInputs): string {
  const m = inputs.manifest ?? {};
  const lines: string[] = [];
  lines.push(`Apply review snapshot — id: ${inputs.id}`);
  lines.push(`ATS: ${inputs.ats}${m.tenant ? ` (tenant: ${m.tenant})` : ""}`);
  if (m.jobUrl) lines.push(`Job URL: ${m.jobUrl}`);
  if (typeof m.score === "number") lines.push(`Score: ${m.score}`);
  lines.push(`Filled at: ${inputs.result.filledAt}`);
  lines.push("");
  lines.push("Counts:");
  lines.push(`  filled  : ${inputs.result.fieldsFilled}`);
  lines.push(`  missing : ${inputs.result.fieldsMissing.length}` +
    (inputs.result.fieldsMissing.length > 0
      ? ` (${inputs.result.fieldsMissing.join(", ")})`
      : ""));
  lines.push(`  skipped : ${inputs.result.fieldsSkipped.length}`);
  if (inputs.result.fieldsSkipped.length > 0) {
    lines.push("");
    lines.push("Custom / unknown fields NOT filled (review these manually):");
    for (const f of inputs.result.fieldsSkipped as FormSchemaField[]) {
      lines.push(`  - ${f.label || "(no label)"}  [${f.selector}]`);
    }
  }
  lines.push("");
  lines.push(`REVIEW + APPROVE: auto-apply-approve ${inputs.id}`);
  lines.push(`SKIP            : auto-apply-approve skip ${inputs.id} --reason "..."`);
  lines.push("");
  return lines.join("\n");
}

/**
 * Strip anything secret-shaped from the data we write to disk.
 *
 * ApplicationData itself doesn't carry passwords — those come from the vault
 * directly in the apply flow. But we err on the side of paranoia and remove
 * any field that looks like a credential.
 */
function redactSecrets(data: ApplicationData, ats: string): unknown {
  return {
    ats,
    name: data.name,
    email: data.email,
    phone: data.phone,
    location: data.location,
    links: data.links,
    resumePath: data.resumePath,
    workAuthorization: data.workAuthorization,
    requiresSponsorship: data.requiresSponsorship,
    defaultCoverLetter:
      data.defaultCoverLetter && data.defaultCoverLetter.length > 0
        ? `<${data.defaultCoverLetter.length} chars>`
        : undefined,
    // Explicitly NEVER include a password field even though ApplicationData
    // doesn't have one. Future schema additions must preserve this rule.
    password: "<redacted>",
  };
}
