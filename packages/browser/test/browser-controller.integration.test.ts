import { afterAll, describe, expect, it } from "vitest";

import { BrowserController } from "../src/browser-controller.js";

const SKIP = process.env.SKIP_BROWSER_INTEGRATION === "1";

let controller: BrowserController | null = null;

afterAll(async () => {
  await controller?.close().catch(() => undefined);
});

describe.skipIf(SKIP)("BrowserController integration (requires real Chrome)", () => {
  it("ensure → openTab → evaluate → close", async () => {
    controller = await BrowserController.ensure({
      // Use an isolated test profile so the real ~/.auto-job/chrome-profile is untouched.
      profileDir: `${process.cwd()}/.test-chrome-profile`,
      port: 47322,
    });
    const tab = await controller.openTab("about:blank");
    try {
      const result = await tab.evaluate<number>("1 + 1");
      expect(result).toBe(2);
    } finally {
      await tab.close();
    }
  }, 60_000);
});
