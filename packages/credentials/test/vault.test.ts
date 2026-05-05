import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  KeychainEntryNotFoundError,
  setSecurityRunner,
  vaultDelete,
  vaultGenerate,
  vaultGet,
  vaultKey,
  vaultPut,
  type SecurityRunner,
} from "../src/index.js";

interface FakeStore {
  [service: string]: { account: string; password: string };
}

function makeMockRunner(initial: FakeStore = {}): { store: FakeStore; runner: SecurityRunner; calls: string[][] } {
  const store: FakeStore = { ...initial };
  const calls: string[][] = [];
  const runner: SecurityRunner = async (args) => {
    calls.push([...args]);
    const cmd = args[0];
    if (cmd === "add-generic-password") {
      const sIdx = args.indexOf("-s");
      const aIdx = args.indexOf("-a");
      const wIdx = args.indexOf("-w");
      if (sIdx < 0 || aIdx < 0 || wIdx < 0) {
        const err = new Error("missing args") as Error & { code?: number; stderr?: string };
        err.code = 1;
        err.stderr = "usage: missing args";
        throw err;
      }
      const service = args[sIdx + 1]!;
      const account = args[aIdx + 1]!;
      const password = args[wIdx + 1]!;
      store[service] = { account, password };
      return { stdout: "", stderr: "" };
    }
    if (cmd === "find-generic-password") {
      const sIdx = args.indexOf("-s");
      const service = args[sIdx + 1]!;
      const entry = store[service];
      if (!entry) {
        const err = new Error("not found") as Error & { code?: number; stderr?: string };
        err.code = 44;
        err.stderr = "security: SecKeychainSearchCopyNext: The specified item could not be found in the keychain.\n";
        throw err;
      }
      // Real `security -g` prints metadata to stdout, password to stderr.
      return {
        stdout: `keychain: "/Users/x/Library/Keychains/login.keychain-db"\nclass: "genp"\nattributes:\n    "acct"<blob>="${entry.account}"\n    "svce"<blob>="${service}"\n`,
        stderr: `password: "${entry.password}"\n`,
      };
    }
    if (cmd === "delete-generic-password") {
      const sIdx = args.indexOf("-s");
      const service = args[sIdx + 1]!;
      if (!store[service]) {
        const err = new Error("not found") as Error & { code?: number; stderr?: string };
        err.code = 44;
        err.stderr = "security: The specified item could not be found in the keychain.\n";
        throw err;
      }
      delete store[service];
      return { stdout: "", stderr: "" };
    }
    if (cmd === "dump-keychain") {
      const lines = Object.keys(store).map((svc) => `    "svce"<blob>="${svc}"`);
      return { stdout: lines.join("\n") + "\n", stderr: "" };
    }
    throw new Error(`Unhandled mock command: ${cmd}`);
  };
  return { store, runner, calls };
}

describe("vaultKey", () => {
  it("formats keys consistently", () => {
    expect(vaultKey("workday", "amazon")).toBe("auto-job:workday-amazon");
    expect(vaultKey("Workday", "AMAZON")).toBe("auto-job:workday-amazon");
  });

  it("throws on missing parts", () => {
    expect(() => vaultKey("", "amazon")).toThrow();
    expect(() => vaultKey("workday", "")).toThrow();
  });
});

describe("vault round-trip (mocked Keychain)", () => {
  let mock: ReturnType<typeof makeMockRunner>;

  beforeEach(() => {
    mock = makeMockRunner();
    setSecurityRunner(mock.runner);
  });

  afterEach(() => {
    setSecurityRunner(null);
  });

  it("put then get returns the stored credential", async () => {
    const key = vaultKey("workday", "adobe");
    await vaultPut(key, "user@gmail.com", "MyPwd123!");
    const entry = await vaultGet(key);
    expect(entry).toEqual({ email: "user@gmail.com", password: "MyPwd123!" });
  });

  it("get on missing key throws KeychainEntryNotFoundError", async () => {
    await expect(vaultGet("auto-job:nonexistent-tenant")).rejects.toBeInstanceOf(
      KeychainEntryNotFoundError,
    );
  });

  it("delete removes the entry", async () => {
    const key = vaultKey("greenhouse", "stripe");
    await vaultPut(key, "x@y.com", "secret123");
    await vaultDelete(key);
    await expect(vaultGet(key)).rejects.toBeInstanceOf(KeychainEntryNotFoundError);
  });

  it("vaultGenerate stores a strong password and returns it", async () => {
    const key = vaultKey("lever", "netflix");
    const pwd = await vaultGenerate(key, "x@y.com");
    expect(pwd.length).toBeGreaterThanOrEqual(20);
    expect(pwd).toMatch(/[a-z]/);
    expect(pwd).toMatch(/[A-Z]/);
    expect(pwd).toMatch(/[0-9]/);
    const entry = await vaultGet(key);
    expect(entry.password).toBe(pwd);
  });

  it("rejects keys without the auto-job: prefix", async () => {
    await expect(vaultPut("not-prefixed", "x@y.com", "p")).rejects.toThrow(/auto-job:/);
  });
});

describe("password value never in stderr we forward", () => {
  it("KeychainCommandFailedError stderr field has password redacted", async () => {
    const mock = makeMockRunner();
    setSecurityRunner(async (args) => {
      // Simulate a command that fails AFTER find leaked password to stderr.
      const err = new Error("synthetic") as Error & {
        code?: number;
        stderr?: string;
        stdout?: string;
      };
      err.code = 1;
      err.stderr = `password: "TOPSECRET123"\n  some other error\n`;
      throw err;
    });
    try {
      await vaultGet("auto-job:fake-tenant");
    } catch (err) {
      if (err && typeof err === "object" && "stderr" in err) {
        expect(String((err as { stderr: string }).stderr)).not.toContain("TOPSECRET123");
        expect(String((err as { stderr: string }).stderr)).toContain("<redacted>");
      }
    }
    setSecurityRunner(null);
    void mock;
  });
});
