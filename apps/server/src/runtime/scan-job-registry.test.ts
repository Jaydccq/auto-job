import { describe, it, expect } from "vitest";
import { createScanJobRegistry } from "./scan-job-registry.js";

describe("scan-job-registry", () => {
  it("starts a job, stores log lines, and finishes it", () => {
    const reg = createScanJobRegistry({ maxLogLines: 100 });
    const id = reg.start({ skillId: "scan", runner: "fake" });
    expect(reg.get(id)?.status).toBe("running");
    reg.appendLog(id, "stdout", "hello");
    reg.finish(id, 0);
    expect(reg.get(id)?.status).toBe("ok");
    expect(reg.tail(id)).toContainEqual(expect.objectContaining({ line: "hello" }));
  });

  it("blocks concurrent jobs while one is running", () => {
    const reg = createScanJobRegistry();
    reg.start({ skillId: "scan", runner: "fake" });
    expect(() => reg.start({ skillId: "linkedin-scan", runner: "fake" }))
      .toThrow(/another scan is running/i);
  });

  it("drops oldest log lines past the cap", () => {
    const reg = createScanJobRegistry({ maxLogLines: 3 });
    const id = reg.start({ skillId: "scan", runner: "fake" });
    for (let i = 0; i < 10; i++) reg.appendLog(id, "stdout", `line ${i}`);
    expect(reg.tail(id)).toHaveLength(3);
    expect(reg.tail(id).at(-1)?.line).toBe("line 9");
  });

  it("marks a finished job non-blocking for the next run", () => {
    const reg = createScanJobRegistry();
    const a = reg.start({ skillId: "scan", runner: "fake" });
    reg.finish(a, 0);
    const b = reg.start({ skillId: "linkedin-scan", runner: "fake" });
    expect(reg.get(b)?.status).toBe("running");
  });

  it("lastRunBySkill records failures so the UI badge survives a crash", () => {
    const reg = createScanJobRegistry();
    const id = reg.start({ skillId: "linkedin-scan", runner: "fake" });
    reg.finish(id, 1);
    const map = reg.lastRunBySkill();
    expect(map.get("linkedin-scan")?.status).toBe("failed");
    expect(map.get("linkedin-scan")?.exitCode).toBe(1);
  });
});
