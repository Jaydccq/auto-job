import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createServer } from "./index.js";

const ORIGINAL_MODEL = process.env.OPENROUTER_MODEL;
const ORIGINAL_API_KEY = process.env.OPENROUTER_API_KEY;
const ORIGINAL_BRIDGE_MODE = process.env.AUTO_JOB_BRIDGE_MODE;
const ORIGINAL_REAL_EXECUTOR = process.env.AUTO_JOB_REAL_EXECUTOR;
const ORIGINAL_REPO_ROOT = process.env.AUTO_JOB_REPO_ROOT;

// loadConfig() requires cv.md, modes/, data/, batch/ at the repo root.
// cv.md is in .gitignore (user-data layer per DATA_CONTRACT.md), so on a
// fresh CI checkout no real repo root satisfies the check. Build a
// minimal fixture in tmp and point AUTO_JOB_REPO_ROOT at it for the
// duration of this suite.
let fixtureRoot: string;

beforeAll(() => {
  fixtureRoot = mkdtempSync(join(tmpdir(), "auto-job-server-test-"));
  writeFileSync(join(fixtureRoot, "cv.md"), "# fixture cv\n", "utf-8");
  mkdirSync(join(fixtureRoot, "modes"), { recursive: true });
  mkdirSync(join(fixtureRoot, "data"), { recursive: true });
  mkdirSync(join(fixtureRoot, "batch", "tracker-additions"), { recursive: true });
  process.env.AUTO_JOB_REPO_ROOT = fixtureRoot;
});

afterAll(() => {
  if (ORIGINAL_REPO_ROOT === undefined) delete process.env.AUTO_JOB_REPO_ROOT;
  else process.env.AUTO_JOB_REPO_ROOT = ORIGINAL_REPO_ROOT;
  if (fixtureRoot) rmSync(fixtureRoot, { recursive: true, force: true });
});

afterEach(() => {
  // Restore mutated env so other tests aren't affected.
  if (ORIGINAL_MODEL === undefined) delete process.env.OPENROUTER_MODEL;
  else process.env.OPENROUTER_MODEL = ORIGINAL_MODEL;
  if (ORIGINAL_API_KEY === undefined) delete process.env.OPENROUTER_API_KEY;
  else process.env.OPENROUTER_API_KEY = ORIGINAL_API_KEY;
  if (ORIGINAL_BRIDGE_MODE === undefined) delete process.env.AUTO_JOB_BRIDGE_MODE;
  else process.env.AUTO_JOB_BRIDGE_MODE = ORIGINAL_BRIDGE_MODE;
  if (ORIGINAL_REAL_EXECUTOR === undefined) delete process.env.AUTO_JOB_REAL_EXECUTOR;
  else process.env.AUTO_JOB_REAL_EXECUTOR = ORIGINAL_REAL_EXECUTOR;
});

describe("createServer openrouterModel option", () => {
  it("writes process.env.OPENROUTER_MODEL when option is provided", () => {
    delete process.env.OPENROUTER_MODEL;
    createServer({ backend: "fake", openrouterModel: "openai/gpt-4o-mini" });
    expect(process.env.OPENROUTER_MODEL).toBe("openai/gpt-4o-mini");
  });

  it("trims whitespace before persisting the model env", () => {
    delete process.env.OPENROUTER_MODEL;
    createServer({ backend: "fake", openrouterModel: "  meta-llama/llama-3.3-70b-instruct  " });
    expect(process.env.OPENROUTER_MODEL).toBe("meta-llama/llama-3.3-70b-instruct");
  });

  it("clears OPENROUTER_MODEL when option is an empty string", () => {
    process.env.OPENROUTER_MODEL = "stale/value";
    createServer({ backend: "fake", openrouterModel: "" });
    expect(process.env.OPENROUTER_MODEL).toBeUndefined();
  });

  it("leaves OPENROUTER_MODEL untouched when option is omitted", () => {
    process.env.OPENROUTER_MODEL = "preserved/value";
    createServer({ backend: "fake" });
    expect(process.env.OPENROUTER_MODEL).toBe("preserved/value");
  });
});
