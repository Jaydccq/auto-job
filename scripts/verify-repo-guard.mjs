#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { extname } from "node:path";

const TEXT_EXTENSIONS = new Set([
  "",
  ".css",
  ".html",
  ".js",
  ".json",
  ".md",
  ".mjs",
  ".sh",
  ".toml",
  ".ts",
  ".tsx",
  ".yaml",
  ".yml",
  ".zsh",
]);

const ALLOWLIST = [
  /^data\//,
  /^docs\/exec-plans\//,
  /^docs\/plans\//,
  /^docs\/superpowers\//,
  /^docs\/architecture\/origin-and-ownership\.md$/,
  /^docs\/architecture\/command-surface-contract\.md$/,
  /^reports\//,
  /^output\//,
  /^jds\//,
  /^web\/index\.html$/,
  /^scripts\/verify-repo-guard\.mjs$/,
  /^apps\/server\/src\/adapters\/command-surface-contract\.test\.ts$/,
];

const FORBIDDEN = [
  {
    label: "upstream git fetch URL",
    pattern: /https:\/\/github\.com\/santifer\/career-ops/,
  },
  {
    label: "upstream raw content URL",
    pattern: /raw\.githubusercontent\.com\/santifer\/career-ops/,
  },
  {
    label: "upstream releases API",
    pattern: /api\.github\.com\/repos\/santifer\/career-ops/,
  },
  {
    label: "deleted update-system invocation",
    pattern: /\bnode\s+update-system\.mjs\b/,
  },
  {
    label: "deleted gemini-eval invocation",
    pattern: /\bnode\s+gemini-eval\.mjs\b/,
  },
  {
    label: "deleted generate-latex invocation",
    pattern: /\bnode\s+generate-latex\.mjs\b/,
  },
  {
    label: "removed .opencode command surface",
    pattern: /\.opencode\/commands/,
  },
  {
    label: "removed .gemini command surface",
    pattern: /\.gemini\/commands/,
  },
  {
    label: "removed legacy mode file reference",
    pattern: /modes\/(?:apply|batch|deep|interview-prep|latex|ofertas|patterns|pdf|pipeline|project|tracker|training)\.md/,
  },
];

const trackedAndNew = execFileSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
  { encoding: "utf-8" },
)
  .split("\0")
  .filter(Boolean)
  .filter((path) => !path.includes("/node_modules/"))
  .filter((path) => !path.startsWith("bb-browser/"))
  .filter((path) => TEXT_EXTENSIONS.has(extname(path)));

const violations = [];

for (const path of trackedAndNew) {
  if (ALLOWLIST.some((rule) => rule.test(path))) continue;

  let content;
  try {
    content = readFileSync(path, "utf-8");
  } catch {
    continue;
  }

  for (const { label, pattern } of FORBIDDEN) {
    const match = pattern.exec(content);
    if (match) {
      const line = content.slice(0, match.index).split(/\r?\n/).length;
      violations.push(`${path}:${line}: ${label}`);
    }
  }
}

if (violations.length > 0) {
  console.error("Repository ownership guard failed:");
  for (const violation of violations) {
    console.error(`- ${violation}`);
  }
  process.exit(1);
}

console.log("Repository ownership guard passed");
