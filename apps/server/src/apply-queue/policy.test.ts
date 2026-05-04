import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { DISABLED_POLICY, loadPolicy } from "./policy.js";

describe("loadPolicy", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "apply-policy-test-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("returns DISABLED_POLICY when file missing", () => {
    expect(loadPolicy({ filePath: join(dir, "missing.yml") })).toEqual(DISABLED_POLICY);
  });

  it("DISABLED_POLICY has auto_threshold null and quotas 0", () => {
    expect(DISABLED_POLICY.auto_threshold).toBeNull();
    expect(DISABLED_POLICY.daily_quota.total).toBe(0);
  });

  it("loads a user-supplied YAML", () => {
    const filePath = join(dir, "policy.yml");
    writeFileSync(
      filePath,
      `
auto_threshold: 4.5
daily_quota:
  total: 5
  per_ats:
    greenhouse: 3
    lever: 3
`,
    );
    const policy = loadPolicy({ filePath });
    expect(policy.auto_threshold).toBe(4.5);
    expect(policy.daily_quota.total).toBe(5);
    expect(policy.daily_quota.per_ats.greenhouse).toBe(3);
  });

  it("merges partial config with defaults (missing fields filled in)", () => {
    const filePath = join(dir, "partial.yml");
    writeFileSync(filePath, "auto_threshold: 4.0\n");
    const policy = loadPolicy({ filePath });
    expect(policy.auto_threshold).toBe(4.0);
    expect(policy.cooldown.on_captcha_hours).toBe(168); // default
  });

  it("returns DISABLED_POLICY when YAML is empty", () => {
    const filePath = join(dir, "empty.yml");
    writeFileSync(filePath, "");
    expect(loadPolicy({ filePath })).toEqual(DISABLED_POLICY);
  });
});
