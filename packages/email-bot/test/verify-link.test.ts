import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { verifyLink, MIN_READING_DELAY_MS } from "../src/verify-link.js";
import {
  ConfirmButtonNotFoundError,
  EmailBotDisabledError,
  LinkHostNotAllowedError,
} from "../src/errors.js";
import type { Allowlist } from "../src/allowlist.js";

function allowlist(hosts: { host: string; autoClick: boolean; sel?: string }[]): Allowlist {
  const entries = hosts.map((h) => {
    const e: { host: string; autoClick: boolean; confirmButtonSelector?: string } = {
      host: h.host,
      autoClick: h.autoClick,
    };
    if (h.sel) e.confirmButtonSelector = h.sel;
    return e;
  });
  const byHost = new Map(entries.map((e) => [e.host, e]));
  return { entries, byHost };
}

function makeFakeTab(opts: { foundText?: string | null; afterUrl?: string }) {
  const evals: string[] = [];
  return {
    url: "https://workday.com/before",
    async evaluate(code: string) {
      evals.push(code);
      // Detect the resolveConfirmButton inline IIFE; return foundText.
      if (code.includes("hasTextMatch") || code.includes("querySelector")) {
        return opts.foundText ?? null;
      }
      // HTML-capture path
      return "<html>captured</html>";
    },
    async screenshot() {
      return Buffer.from("png-bytes");
    },
    async click(_selector: string) {
      this.url = opts.afterUrl ?? "https://workday.com/after";
    },
    async fill(_selector: string, _value: string) {},
    async navigate(url: string) {
      this.url = url;
    },
    async press(_selector: string, _key: string) {},
    async close() {},
    evals,
  };
}

function makeController(tab: ReturnType<typeof makeFakeTab>) {
  return {
    openTab: vi.fn(async () => tab),
  } as unknown as Parameters<typeof verifyLink>[0];
}

describe("verifyLink", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "verify-link-"));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("throws EmailBotDisabledError when allowlist is empty", async () => {
    await expect(
      verifyLink(makeController(makeFakeTab({})), "https://workday.com/v", allowlist([])),
    ).rejects.toBeInstanceOf(EmailBotDisabledError);
  });

  it("throws LinkHostNotAllowedError when host not in allowlist", async () => {
    await expect(
      verifyLink(
        makeController(makeFakeTab({})),
        "https://evil.com/v",
        allowlist([{ host: "workday.com", autoClick: true }]),
      ),
    ).rejects.toBeInstanceOf(LinkHostNotAllowedError);
  });

  it("throws LinkHostNotAllowedError when host listed but auto_click=false", async () => {
    await expect(
      verifyLink(
        makeController(makeFakeTab({})),
        "https://workday.com/v",
        allowlist([{ host: "workday.com", autoClick: false }]),
      ),
    ).rejects.toBeInstanceOf(LinkHostNotAllowedError);
  });

  it("throws ConfirmButtonNotFoundError when no selector matches", async () => {
    const tab = makeFakeTab({ foundText: null });
    await expect(
      verifyLink(
        makeController(tab),
        "https://workday.com/v",
        allowlist([{ host: "workday.com", autoClick: true }]),
        { snapshotRoot: dir, delayMs: () => 1 },
      ),
    ).rejects.toBeInstanceOf(ConfirmButtonNotFoundError);
  });

  it("respects minimum 8s reading delay (no override)", async () => {
    const tab = makeFakeTab({ foundText: "Confirm" });
    const start = Date.now();
    await verifyLink(
      makeController(tab),
      "https://workday.com/v",
      allowlist([{ host: "workday.com", autoClick: true }]),
      { snapshotRoot: dir, delayMs: () => MIN_READING_DELAY_MS },
    );
    expect(Date.now() - start).toBeGreaterThanOrEqual(MIN_READING_DELAY_MS - 200);
  }, 20_000);

  it("uses per-host selector when provided", async () => {
    const tab = makeFakeTab({ foundText: "ok" });
    const result = await verifyLink(
      makeController(tab),
      "https://workday.com/v",
      allowlist([{ host: "workday.com", autoClick: true, sel: "button[data-id='go']" }]),
      { snapshotRoot: dir, delayMs: () => 1, messageId: "m1" },
    );
    expect(result.buttonSelector).toBe("button[data-id='go']");
    expect(result.snapshotDir.startsWith(dir)).toBe(true);
  });

  it("falls back to generic selectors when no per-host selector set", async () => {
    const tab = makeFakeTab({ foundText: "Confirm" });
    const result = await verifyLink(
      makeController(tab),
      "https://workday.com/v",
      allowlist([{ host: "workday.com", autoClick: true }]),
      { snapshotRoot: dir, delayMs: () => 1, messageId: "m1" },
    );
    // First generic that returns text wins.
    expect(result.buttonSelector).toBe('button[data-action="confirm"]');
  });

  it("writes 5 snapshot files including meta.json", async () => {
    const tab = makeFakeTab({ foundText: "Confirm", afterUrl: "https://workday.com/thanks" });
    const result = await verifyLink(
      makeController(tab),
      "https://workday.com/v",
      allowlist([{ host: "workday.com", autoClick: true }]),
      {
        snapshotRoot: dir,
        delayMs: () => 1,
        messageId: "abc",
        fromHeader: "noreply@workday.com",
        subject: "Verify your email",
      },
    );
    const files = readdirSync(result.snapshotDir).sort();
    expect(files).toEqual(["meta.json", "post-click.html", "post-click.png", "pre-click.html", "pre-click.png"]);
    const meta = JSON.parse(readFileSync(join(result.snapshotDir, "meta.json"), "utf-8"));
    expect(meta.messageId).toBe("abc");
    expect(meta.subject).toBe("Verify your email");
    expect(meta.url).toBe("https://workday.com/v");
    expect(meta.finalUrl).toBe("https://workday.com/thanks");
  });

  it("subdomain of allowlisted host is accepted", async () => {
    const tab = makeFakeTab({ foundText: "Confirm" });
    const result = await verifyLink(
      makeController(tab),
      "https://wd5.myworkdayjobs.com/v",
      allowlist([{ host: "myworkdayjobs.com", autoClick: true }]),
      { snapshotRoot: dir, delayMs: () => 1 },
    );
    expect(result.snapshotDir.startsWith(dir)).toBe(true);
  });
});
