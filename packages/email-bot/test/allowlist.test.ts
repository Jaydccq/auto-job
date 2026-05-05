import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { loadAllowlist } from "../src/allowlist.js";

describe("loadAllowlist", () => {
  let dir: string;
  let p: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "allowlist-"));
    p = join(dir, "allowlist.yml");
  });

  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("returns empty allowlist when file missing", () => {
    const a = loadAllowlist({ filePath: p });
    expect(a.entries).toEqual([]);
    expect(a.byHost.size).toBe(0);
  });

  it("parses well-formed allowlist", () => {
    writeFileSync(
      p,
      `hosts:
  - host: myworkdayjobs.com
    auto_click: true
    confirm_button_selector: "button[data-test='confirm']"
  - host: TALENT.icims.com
    auto_click: false
`,
    );
    const a = loadAllowlist({ filePath: p });
    expect(a.entries).toHaveLength(2);
    expect(a.entries[0]).toEqual({
      host: "myworkdayjobs.com",
      autoClick: true,
      confirmButtonSelector: "button[data-test='confirm']",
    });
    // Lowercased
    expect(a.entries[1]?.host).toBe("talent.icims.com");
    expect(a.entries[1]?.autoClick).toBe(false);
  });

  it("ignores entries missing a host", () => {
    writeFileSync(p, `hosts:\n  - auto_click: true\n  - host: ""\n  - host: ok.com\n    auto_click: true\n`);
    const a = loadAllowlist({ filePath: p });
    expect(a.entries).toHaveLength(1);
    expect(a.entries[0]?.host).toBe("ok.com");
  });

  it("treats unset auto_click as false", () => {
    writeFileSync(p, `hosts:\n  - host: x.com\n`);
    const a = loadAllowlist({ filePath: p });
    expect(a.entries[0]?.autoClick).toBe(false);
  });
});
