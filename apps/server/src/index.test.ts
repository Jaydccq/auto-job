import { afterEach, describe, expect, it } from "vitest";
import { createServer } from "./index.js";

const ORIGINAL_MODEL = process.env.OPENROUTER_MODEL;
const ORIGINAL_API_KEY = process.env.OPENROUTER_API_KEY;
const ORIGINAL_BRIDGE_MODE = process.env.AUTO_JOB_BRIDGE_MODE;
const ORIGINAL_REAL_EXECUTOR = process.env.AUTO_JOB_REAL_EXECUTOR;

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
