import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "yaml";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(__dirname, "../../../..");

describe("desktop packaged dashboard resources", () => {
  it("ships every web module imported by dashboard-handlers.mjs", () => {
    const raw = readFileSync(
      resolve(repoRoot, "apps/desktop/electron-builder.yml"),
      "utf-8",
    );
    const config = parse(raw) as {
      extraResources?: Array<{ to?: string; filter?: string[] }>;
    };
    const webResource = config.extraResources?.find((entry) => entry.to === "web");

    expect(webResource?.filter).toEqual(
      expect.arrayContaining([
        "build-dashboard.mjs",
        "dashboard-handlers.mjs",
        "scan-runner.mjs",
        "template.html",
      ]),
    );
  });
});
