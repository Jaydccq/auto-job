import { describe, expect, it } from "vitest";

import { detectChromeBinary } from "../src/chrome-binary.js";
import { ChromeNotFoundError } from "../src/errors.js";

describe("detectChromeBinary", () => {
  it("returns a path or throws ChromeNotFoundError — never silent", () => {
    try {
      const p = detectChromeBinary();
      expect(typeof p).toBe("string");
      expect(p.length).toBeGreaterThan(0);
    } catch (err) {
      expect(err).toBeInstanceOf(ChromeNotFoundError);
    }
  });
});
