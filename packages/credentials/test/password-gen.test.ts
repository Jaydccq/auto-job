import { describe, expect, it } from "vitest";

import { generatePassword } from "../src/password-gen.js";

describe("generatePassword", () => {
  it("default length is 24, minimum enforced at 20", () => {
    expect(generatePassword().length).toBe(24);
    expect(generatePassword({ length: 10 }).length).toBe(20);
    expect(generatePassword({ length: 30 }).length).toBe(30);
  });

  it("contains at least one of each required char class", () => {
    for (let i = 0; i < 50; i++) {
      const pwd = generatePassword();
      expect(pwd).toMatch(/[a-z]/);
      expect(pwd).toMatch(/[A-Z]/);
      expect(pwd).toMatch(/[0-9]/);
      expect(pwd).toMatch(/[!@#$%^&*()\-_=+[\]{};:,.<>?]/);
    }
  });

  it("two consecutive calls return different passwords", () => {
    const a = generatePassword();
    const b = generatePassword();
    expect(a).not.toBe(b);
  });

  it("respects custom symbol set", () => {
    const pwd = generatePassword({ symbols: "$@" });
    expect(pwd).toMatch(/[$@]/);
    expect(pwd).not.toMatch(/[!#%]/);
  });
});
