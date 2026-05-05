import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { runSignupFlow } from "../src/run.js";
import {
  RequiresPhoneVerificationError,
  RiskAckMissingError,
  SignupQuotaExceededError,
  SignupSubmitFailedError,
} from "../src/errors.js";
import type { SignupQuotaPolicy } from "../src/types.js";

const VALID_ACK =
  "I, Test, acknowledge the risks documented in `docs/superpowers/specs/2026-05-04-auto-job-architecture-design.md` (sections A2, A7, Threat Model §3) on 2026-05-05.\n";

const enabledPolicy: SignupQuotaPolicy = {
  total_per_week: 3,
  per_ats_per_week: { workday: 2, greenhouse: 2 },
};

const identity = {
  email: "user@gmail.com",
  firstName: "Hongxi",
  lastName: "Chen",
  phone: "555-555-5555",
};

const noCooldown = () => ({ active: false as const });

function makeFakeTab(opts: { html?: string; afterUrl?: string }) {
  return {
    url: "https://x.com/signup",
    async evaluate(code: string) {
      if (code.includes("querySelector(")) {
        // Adapter querySelector probes — return true so adapter discovers
        // selectors successfully.
        return true;
      }
      return opts.html ?? "<html><body><p>Welcome!</p></body></html>";
    },
    async screenshot() {
      return Buffer.alloc(0);
    },
    async fill() {},
    async click(_selector: string) {
      this.url = opts.afterUrl ?? this.url;
    },
    async navigate() {},
    async press() {},
    async close() {},
  };
}

function makeController(tab: ReturnType<typeof makeFakeTab>) {
  return {
    openTab: vi.fn(async () => tab),
  } as unknown as Parameters<typeof runSignupFlow>[0];
}

describe("runSignupFlow", () => {
  let dir: string;
  let snapshotRoot: string;
  let ackPath: string;
  let vaultCalls: { key: string; email: string; password: string | undefined }[];

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "signup-run-"));
    snapshotRoot = join(dir, "snapshots");
    ackPath = join(dir, "RISK_ACK.md");
    vaultCalls = [];
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  function fakeVaultWriter() {
    return async (key: string, email: string, override: string | undefined) => {
      vaultCalls.push({ key, email, password: override });
      return { vaultRef: key, password: override ?? "GeneratedPassword123!" };
    };
  }

  it("RISK_ACK missing → refuses BEFORE opening any tab", async () => {
    const tab = makeFakeTab({});
    const ctrl = makeController(tab);
    await expect(
      runSignupFlow(
        ctrl,
        { id: "x", ats: "workday", tenant: "amazon", signupUrl: "https://wd5.myworkdayjobs.com/x" },
        {
          identity,
          quotaPolicy: enabledPolicy,
          history: [],
          snapshotRoot,
          filePath: ackPath,
          cooldownQuery: noCooldown,
          vaultWriter: fakeVaultWriter(),
        },
      ),
    ).rejects.toBeInstanceOf(RiskAckMissingError);
    expect((ctrl.openTab as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(0);
  });

  it("quota exceeded → refuses without opening tab", async () => {
    writeFileSync(ackPath, VALID_ACK);
    const tab = makeFakeTab({});
    const ctrl = makeController(tab);
    const overQuota = Array.from({ length: 2 }, () => ({
      ats: "workday",
      startedAt: new Date().toISOString(),
      outcome: "succeeded" as const,
    }));
    await expect(
      runSignupFlow(
        ctrl,
        { id: "x", ats: "workday", tenant: "amazon", signupUrl: "https://wd5.myworkdayjobs.com/x" },
        {
          identity,
          quotaPolicy: enabledPolicy,
          history: overQuota,
          snapshotRoot,
          filePath: ackPath,
          cooldownQuery: noCooldown,
          vaultWriter: fakeVaultWriter(),
        },
      ),
    ).rejects.toBeInstanceOf(SignupQuotaExceededError);
    expect((ctrl.openTab as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(0);
  });

  it("vault is written BEFORE submit (vault-FIRST contract)", async () => {
    writeFileSync(ackPath, VALID_ACK);
    const tab = makeFakeTab({ html: "<html><body>verify your email please</body></html>" });
    const ctrl = makeController(tab);
    const result = await runSignupFlow(
      ctrl,
      { id: "x", ats: "workday", tenant: "amazon", signupUrl: "https://wd5.myworkdayjobs.com/x" },
      {
        identity,
        quotaPolicy: enabledPolicy,
        history: [],
        snapshotRoot,
        filePath: ackPath,
        cooldownQuery: noCooldown,
        vaultWriter: fakeVaultWriter(),
      },
    );
    expect(vaultCalls).toHaveLength(1);
    expect(vaultCalls[0]?.key).toBe("auto-job:workday-amazon");
    expect(vaultCalls[0]?.email).toBe("user@gmail.com");
    expect(result.vaultRef).toBe("auto-job:workday-amazon");
    expect(result.requiresEmailVerification).toBe(true);
    expect(result.snapshotDir.startsWith(snapshotRoot)).toBe(true);
  });

  it("vault writer throws → submit never called (vault precedence)", async () => {
    writeFileSync(ackPath, VALID_ACK);
    let submitCalled = false;
    const tab = {
      ...makeFakeTab({}),
      async click() {
        submitCalled = true;
      },
    };
    const ctrl = makeController(tab);
    const failingVault = async () => {
      throw new Error("keychain unavailable");
    };
    await expect(
      runSignupFlow(
        ctrl,
        { id: "x", ats: "workday", tenant: "amazon", signupUrl: "https://wd5.myworkdayjobs.com/x" },
        {
          identity,
          quotaPolicy: enabledPolicy,
          history: [],
          snapshotRoot,
          filePath: ackPath,
          cooldownQuery: noCooldown,
          vaultWriter: failingVault,
        },
      ),
    ).rejects.toThrow(/keychain unavailable/);
    expect(submitCalled).toBe(false);
    // No tab should have been opened either.
    expect((ctrl.openTab as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(0);
  });

  it("phone-verification page detected pre-submit → throws + records signal", async () => {
    writeFileSync(ackPath, VALID_ACK);
    const tab = makeFakeTab({
      html: "<html><body>Please enter the code we sent to your phone</body></html>",
    });
    const ctrl = makeController(tab);
    await expect(
      runSignupFlow(
        ctrl,
        { id: "x", ats: "workday", tenant: "amazon", signupUrl: "https://wd5.myworkdayjobs.com/x" },
        {
          identity,
          quotaPolicy: enabledPolicy,
          history: [],
          snapshotRoot,
          filePath: ackPath,
          cooldownQuery: noCooldown,
          vaultWriter: fakeVaultWriter(),
        },
      ),
    ).rejects.toBeInstanceOf(RequiresPhoneVerificationError);
  });

  it("submit returning appearsSuccessful=false → SignupSubmitFailedError", async () => {
    writeFileSync(ackPath, VALID_ACK);
    const tab = makeFakeTab({ html: "<html>Error: invalid email</html>" });
    const ctrl = makeController(tab);
    await expect(
      runSignupFlow(
        ctrl,
        { id: "x", ats: "workday", tenant: "amazon", signupUrl: "https://wd5.myworkdayjobs.com/x" },
        {
          identity,
          quotaPolicy: enabledPolicy,
          history: [],
          snapshotRoot,
          filePath: ackPath,
          cooldownQuery: noCooldown,
          vaultWriter: fakeVaultWriter(),
        },
      ),
    ).rejects.toBeInstanceOf(SignupSubmitFailedError);
  });
});
