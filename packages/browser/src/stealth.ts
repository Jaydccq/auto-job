/**
 * Defensive stealth patches applied to every new page.
 *
 * Our primary anti-bot defense is architectural: we attach to a real
 * Google Chrome via `connectOverCDP` (not `playwright.launch()`), so
 * Chrome is NOT started with `--enable-automation` and `navigator.webdriver`
 * is naturally `false`. Empirically verified against current Chrome
 * 147 on macOS (see test/_manual-leak-check.mjs).
 *
 * What this script adds is belt-and-suspenders:
 *   1. Defensively re-asserts `navigator.webdriver = false` so a hostile
 *      page script can't flip it via Object.defineProperty.
 *   2. Hardens `Object.getOwnPropertyDescriptor(navigator, 'webdriver')`
 *      to return a benign descriptor instead of `undefined` (some
 *      detectors look for the missing descriptor).
 *
 * What this script DOES NOT do:
 *   - Fake `window.chrome.runtime` — our probe shows it's `undefined`,
 *     which is normal for vanilla Chrome with no extensions. Faking
 *     can backfire (sites probe specific runtime properties).
 *   - Fake plugins / languages / WebGL — already realistic.
 *   - Inject Chrome-specific scripts that real users don't have.
 *
 * Phase 2 (auto-apply) will add mouse/keyboard humanization. Phase 1
 * is read-only via tab.evaluate(fetch) — no click humanization needed.
 */

export const STEALTH_INIT_SCRIPT = `(() => {
  // 1. Re-assert navigator.webdriver = false even if a page script tries
  //    to redefine it. Use a getter that ignores writes silently.
  try {
    Object.defineProperty(navigator, 'webdriver', {
      get: () => false,
      configurable: true,
    });
  } catch (_) {
    // If already non-configurable (shouldn't happen), accept the existing
    // value; our probe confirms the default is already false anyway.
  }

  // 2. Some detectors look at the descriptor itself, not the value.
  //    Make sure a sensible descriptor exists.
  try {
    if (!Object.getOwnPropertyDescriptor(Navigator.prototype, 'webdriver')) {
      Object.defineProperty(Navigator.prototype, 'webdriver', {
        get: () => false,
        configurable: true,
        enumerable: true,
      });
    }
  } catch (_) {}
})();`;
