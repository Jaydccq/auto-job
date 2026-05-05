/**
 * personal-files.ts — read/write the 5 user-layer files behind a strict
 * id-based allowlist. Renderer never sees paths.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { parse as parseYaml } from "yaml";

export type PersonalFileKind = "yaml" | "markdown";

export interface PersonalFileSpec {
  id: string;
  relPath: string;
  kind: PersonalFileKind;
  description: string;
}

export const PERSONAL_FILES: readonly PersonalFileSpec[] = [
  {
    id: "cv",
    relPath: "cv.md",
    kind: "markdown",
    description: "Master CV (markdown source for tailoring).",
  },
  {
    id: "profile",
    relPath: "config/profile.yml",
    kind: "yaml",
    description: "Career-Ops profile (candidate, narrative, scan thresholds).",
  },
  {
    id: "mode-profile",
    relPath: "modes/_profile.md",
    kind: "markdown",
    description: "Personal narrative + archetypes consumed by all modes.",
  },
  {
    id: "portals",
    relPath: "portals.yml",
    kind: "yaml",
    description: "Portal scan configuration (LinkedIn, Indeed, etc.).",
  },
  {
    id: "digest",
    relPath: "article-digest.md",
    kind: "markdown",
    description: "Notes / link digest used for cover-letter context.",
  },
];

const MAX_BYTES = 1_048_576;

export interface PersonalFileRead {
  id: string;
  relPath: string;
  kind: PersonalFileKind;
  description: string;
  exists: boolean;
  content: string;
  byteLength: number;
}

export interface PersonalFileSaveResult {
  id: string;
  relPath: string;
  byteLength: number;
  backupPath: string | null;
}

function specForId(id: string): PersonalFileSpec {
  const spec = PERSONAL_FILES.find((s) => s.id === id);
  if (!spec) throw new Error(`unknown personal-file id: ${id}`);
  return spec;
}

function backupRoot(): string {
  return join(homedir(), ".auto-job", "personal-files-backups");
}

export function readPersonalFile(repoRoot: string, id: string): PersonalFileRead {
  const spec = specForId(id);
  const abs = join(repoRoot, spec.relPath);
  if (!existsSync(abs)) {
    return {
      id: spec.id,
      relPath: spec.relPath,
      kind: spec.kind,
      description: spec.description,
      exists: false,
      content: "",
      byteLength: 0,
    };
  }
  const content = readFileSync(abs, "utf-8");
  const byteLength = Buffer.byteLength(content, "utf-8");
  if (byteLength > MAX_BYTES) {
    throw new Error(`${spec.relPath} is ${byteLength} bytes (> ${MAX_BYTES} cap).`);
  }
  return {
    id: spec.id,
    relPath: spec.relPath,
    kind: spec.kind,
    description: spec.description,
    exists: true,
    content,
    byteLength,
  };
}

export function writePersonalFile(
  repoRoot: string,
  id: string,
  content: string,
): PersonalFileSaveResult {
  const spec = specForId(id);
  const byteLength = Buffer.byteLength(content, "utf-8");
  if (byteLength > MAX_BYTES) {
    throw new Error(`content is ${byteLength} bytes (> ${MAX_BYTES} cap).`);
  }
  if (spec.kind === "yaml") {
    try {
      parseYaml(content);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`${spec.relPath} yaml syntax error: ${msg}`);
    }
  }
  const abs = join(repoRoot, spec.relPath);
  let backupPath: string | null = null;
  if (existsSync(abs)) {
    mkdirSync(backupRoot(), { recursive: true });
    backupPath = join(backupRoot(), `${spec.id}.${Date.now()}.bak`);
    writeFileSync(backupPath, readFileSync(abs, "utf-8"), "utf-8");
  }
  writeFileSync(abs, content, "utf-8");
  return { id: spec.id, relPath: spec.relPath, byteLength, backupPath };
}
