import { describe, expect, test } from "vitest";

import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");

const ownedAgentCommandSurfaces = [
  ".claude",
  ".codex",
  ".cursor",
  ".gemini",
  ".kilocode",
  ".kiro",
  ".opencode",
  ".pi",
] as const;

const removedLegacyModes = [
  "apply",
  "batch",
  "deep",
  "interview-prep",
  "latex",
  "ofertas",
  "patterns",
  "pdf",
  "pipeline",
  "project",
  "tracker",
  "training",
] as const;

const removedRootScripts = [
  "gemini-eval.mjs",
  "generate-latex.mjs",
  "update-system.mjs",
] as const;

const removedTopLevelFiles = [
  "GEMINI.md",
  "CITATION.cff",
  ".release-please-manifest.json",
  "templates/cv-template.tex",
  "templates/README.md",
] as const;

const ownedAppDirs = [
  "apps/server/package.json",
  "apps/extension/package.json",
  "apps/desktop/package.json",
  "packages/shared/package.json",
] as const;

describe("command surface contract (owned-only)", () => {
  test("owned agent command surfaces are versioned", () => {
    for (const dir of ownedAgentCommandSurfaces) {
      expect(existsSync(resolve(repoRoot, dir))).toBe(true);
    }
  });

  test("removed legacy mode files are gone", () => {
    for (const mode of removedLegacyModes) {
      expect(existsSync(resolve(repoRoot, `modes/${mode}.md`))).toBe(false);
    }
  });

  test("removed upstream-only root scripts are gone", () => {
    for (const file of removedRootScripts) {
      expect(existsSync(resolve(repoRoot, file))).toBe(false);
    }
  });

  test("removed top-level fork-era files are gone", () => {
    for (const file of removedTopLevelFiles) {
      expect(existsSync(resolve(repoRoot, file))).toBe(false);
    }
  });

  test("owned workspace layout is preserved", () => {
    for (const path of ownedAppDirs) {
      expect(existsSync(resolve(repoRoot, path))).toBe(true);
    }
    expect(existsSync(resolve(repoRoot, "apps/bridge/package.json"))).toBe(false);
  });

  test("package.json no longer wires removed scripts", () => {
    const pkg = JSON.parse(readFileSync(resolve(repoRoot, "package.json"), "utf-8")) as {
      scripts?: Record<string, string>;
    };
    const scripts = pkg.scripts ?? {};
    for (const removed of ["latex", "gemini:eval", "update", "update:check", "rollback"]) {
      expect(scripts[removed]).toBeUndefined();
    }
  });
});
