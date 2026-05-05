import { describe, expect, it } from "vitest";

import { analyzeForDetection } from "../src/analyze.js";

describe("analyzeForDetection", () => {
  it("flags reCAPTCHA iframe as captcha", () => {
    const html = `<iframe src="https://www.google.com/recaptcha/api2/anchor?ar=1"></iframe>`;
    const result = analyzeForDetection({ html });
    expect(result?.signal).toBe("captcha");
  });

  it("flags hCaptcha widget as captcha", () => {
    const html = `<div class="h-captcha" data-sitekey="abc"></div>`;
    expect(analyzeForDetection({ html })?.signal).toBe("captcha");
  });

  it("flags Turnstile widget as captcha", () => {
    const html = `<div class="cf-turnstile-widget"></div>`;
    expect(analyzeForDetection({ html })?.signal).toBe("captcha");
  });

  it("flags HTTP 403 over textual matches", () => {
    expect(
      analyzeForDetection({ html: "<p>access denied</p>", statusCode: 403 })?.signal,
    ).toBe("http_403");
  });

  it("flags HTTP 429", () => {
    expect(analyzeForDetection({ html: "<p>ok</p>", statusCode: 429 })?.signal).toBe("http_429");
  });

  it("flags verification text", () => {
    expect(analyzeForDetection({ html: "Please verify you are human" })?.signal).toBe(
      "verification_required",
    );
    expect(analyzeForDetection({ html: "Are you human?" })?.signal).toBe("verification_required");
    expect(analyzeForDetection({ html: "Security check" })?.signal).toBe(
      "verification_required",
    );
  });

  it("flags login redirect when finalUrl host doesn't match expected", () => {
    const r = analyzeForDetection({
      html: "<p>ok</p>",
      finalUrl: "https://login.workday.com/login?return=...",
      expectedHostSuffix: "myworkdayjobs.com",
    });
    expect(r?.signal).toBe("login_redirect");
  });

  it("flags login redirect when path matches /login even on expected host", () => {
    const r = analyzeForDetection({
      html: "<p>ok</p>",
      finalUrl: "https://wd5.myworkdayjobs.com/login?continue=apply",
      expectedHostSuffix: "myworkdayjobs.com",
    });
    expect(r?.signal).toBe("login_redirect");
  });

  it("does NOT flag login redirect when on expected host and not on a login path", () => {
    const r = analyzeForDetection({
      html: "<p>ok</p>",
      finalUrl: "https://wd5.myworkdayjobs.com/apply/step1",
      expectedHostSuffix: "myworkdayjobs.com",
    });
    expect(r).toBeNull();
  });

  it("flags silent_degradation when threshold flag set", () => {
    expect(
      analyzeForDetection({ html: "<p>ok</p>", formStandardFieldsBelowThreshold: true })?.signal,
    ).toBe("silent_degradation");
  });

  it("returns null on clean snapshot", () => {
    expect(
      analyzeForDetection({
        html: "<form><input name='email' /></form>",
        statusCode: 200,
        finalUrl: "https://wd5.myworkdayjobs.com/apply/step1",
        expectedHostSuffix: "myworkdayjobs.com",
      }),
    ).toBeNull();
  });
});
