/**
 * profile-config.ts — read/write a small subset of `config/profile.yml`.
 *
 * Scope is deliberately narrow (Option A from the planning chat): the six
 * newgrad_scan thresholds the user tunes most often. Comments and key order
 * survive a save because we mutate value nodes in a parsed `Document`, never
 * re-stringify the section from scratch.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { parseDocument, isMap, isScalar, type Document, type YAMLMap } from "yaml";

export interface NewGradThresholds {
  list_threshold: number;
  pipeline_threshold: number;
  detail_value_threshold: number;
  max_years_experience: number;
  exclude_no_sponsorship: boolean;
  exclude_active_security_clearance: boolean;
}

export const DEFAULTS: NewGradThresholds = {
  list_threshold: 3,
  pipeline_threshold: 5,
  detail_value_threshold: 6.5,
  max_years_experience: 2,
  exclude_no_sponsorship: true,
  exclude_active_security_clearance: true,
};

interface Bound {
  min: number;
  max: number;
  integer: boolean;
}

const BOUNDS: Record<keyof Pick<
  NewGradThresholds,
  "list_threshold" | "pipeline_threshold" | "detail_value_threshold" | "max_years_experience"
>, Bound> = {
  list_threshold: { min: 0, max: 9, integer: true },
  pipeline_threshold: { min: 0, max: 9, integer: true },
  detail_value_threshold: { min: 0, max: 10, integer: false },
  max_years_experience: { min: 0, max: 10, integer: true },
};

function profilePath(repoRoot: string): string {
  return join(repoRoot, "config", "profile.yml");
}

function readDoc(repoRoot: string): Document.Parsed | null {
  const p = profilePath(repoRoot);
  if (!existsSync(p)) return null;
  const text = readFileSync(p, "utf-8");
  return parseDocument(text);
}

function newgradMap(doc: Document.Parsed): YAMLMap | null {
  const root = doc.contents;
  if (!isMap(root)) return null;
  const ng = root.get("newgrad_scan", true);
  return isMap(ng) ? ng : null;
}

function hardFiltersMap(ng: YAMLMap): YAMLMap | null {
  const hf = ng.get("hard_filters", true);
  return isMap(hf) ? hf : null;
}

function readNumber(map: YAMLMap | null, key: string): number | null {
  if (!map) return null;
  const node = map.get(key, true);
  if (isScalar(node) && typeof node.value === "number") return node.value;
  return null;
}

function readBool(map: YAMLMap | null, key: string): boolean | null {
  if (!map) return null;
  const node = map.get(key, true);
  if (isScalar(node) && typeof node.value === "boolean") return node.value;
  return null;
}

export function loadNewGradThresholds(repoRoot: string): NewGradThresholds {
  const doc = readDoc(repoRoot);
  if (!doc) return { ...DEFAULTS };
  const ng = newgradMap(doc);
  const hf = ng ? hardFiltersMap(ng) : null;
  return {
    list_threshold: readNumber(ng, "list_threshold") ?? DEFAULTS.list_threshold,
    pipeline_threshold:
      readNumber(ng, "pipeline_threshold") ?? DEFAULTS.pipeline_threshold,
    detail_value_threshold:
      readNumber(ng, "detail_value_threshold") ?? DEFAULTS.detail_value_threshold,
    max_years_experience:
      readNumber(hf, "max_years_experience") ?? DEFAULTS.max_years_experience,
    exclude_no_sponsorship:
      readBool(hf, "exclude_no_sponsorship") ?? DEFAULTS.exclude_no_sponsorship,
    exclude_active_security_clearance:
      readBool(hf, "exclude_active_security_clearance") ??
      DEFAULTS.exclude_active_security_clearance,
  };
}

function validateNumber(
  key: keyof typeof BOUNDS,
  value: unknown,
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${key}: expected a finite number, got ${String(value)}`);
  }
  const { min, max, integer } = BOUNDS[key];
  if (value < min || value > max) {
    throw new Error(`${key}: ${value} is outside [${min}, ${max}]`);
  }
  if (integer && !Number.isInteger(value)) {
    throw new Error(`${key}: ${value} must be an integer`);
  }
  return value;
}

function validateBool(key: string, value: unknown): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`${key}: expected boolean, got ${String(value)}`);
  }
  return value;
}

function setIfPresent(map: YAMLMap, key: string, value: number | boolean): boolean {
  const node = map.get(key, true);
  if (isScalar(node)) {
    node.value = value;
    return true;
  }
  return false;
}

export function saveNewGradThresholds(
  repoRoot: string,
  next: NewGradThresholds,
): NewGradThresholds {
  const validated: NewGradThresholds = {
    list_threshold: validateNumber("list_threshold", next.list_threshold),
    pipeline_threshold: validateNumber(
      "pipeline_threshold",
      next.pipeline_threshold,
    ),
    detail_value_threshold: Number(
      validateNumber("detail_value_threshold", next.detail_value_threshold).toFixed(2),
    ),
    max_years_experience: validateNumber(
      "max_years_experience",
      next.max_years_experience,
    ),
    exclude_no_sponsorship: validateBool(
      "exclude_no_sponsorship",
      next.exclude_no_sponsorship,
    ),
    exclude_active_security_clearance: validateBool(
      "exclude_active_security_clearance",
      next.exclude_active_security_clearance,
    ),
  };

  const p = profilePath(repoRoot);
  if (!existsSync(p)) {
    throw new Error(`profile.yml not found at ${p}`);
  }
  const doc = parseDocument(readFileSync(p, "utf-8"));
  const ng = newgradMap(doc);
  if (!ng) {
    throw new Error("profile.yml is missing the `newgrad_scan` section");
  }
  const hf = hardFiltersMap(ng);
  if (!hf) {
    throw new Error("profile.yml is missing `newgrad_scan.hard_filters`");
  }

  // Mutate scalar values; never insert/remove keys, so comments stay put.
  if (!setIfPresent(ng, "list_threshold", validated.list_threshold)) {
    throw new Error("profile.yml lacks `newgrad_scan.list_threshold`");
  }
  if (!setIfPresent(ng, "pipeline_threshold", validated.pipeline_threshold)) {
    throw new Error("profile.yml lacks `newgrad_scan.pipeline_threshold`");
  }
  if (!setIfPresent(ng, "detail_value_threshold", validated.detail_value_threshold)) {
    throw new Error("profile.yml lacks `newgrad_scan.detail_value_threshold`");
  }
  if (!setIfPresent(hf, "max_years_experience", validated.max_years_experience)) {
    throw new Error(
      "profile.yml lacks `newgrad_scan.hard_filters.max_years_experience`",
    );
  }
  if (!setIfPresent(hf, "exclude_no_sponsorship", validated.exclude_no_sponsorship)) {
    throw new Error(
      "profile.yml lacks `newgrad_scan.hard_filters.exclude_no_sponsorship`",
    );
  }
  if (
    !setIfPresent(
      hf,
      "exclude_active_security_clearance",
      validated.exclude_active_security_clearance,
    )
  ) {
    throw new Error(
      "profile.yml lacks `newgrad_scan.hard_filters.exclude_active_security_clearance`",
    );
  }

  // lineWidth: 0 disables yaml's default 80-col wrapping, which otherwise
  // re-flows long quoted strings (e.g. narrative.exit_story) on save even
  // when we only mutate scalar values inside newgrad_scan.
  writeFileSync(p, doc.toString({ lineWidth: 0 }), "utf-8");
  return validated;
}
