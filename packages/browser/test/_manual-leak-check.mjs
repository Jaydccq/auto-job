/**
 * Manual probe: open a tab, run anti-bot detection script, dump results.
 * Run with: tsx test/_manual-leak-check.mjs
 */
import { BrowserController } from "../src/browser-controller.ts";

const controller = await BrowserController.ensure();
const tab = await controller.openTab("about:blank");

const probe = await tab.evaluate(`(() => ({
  webdriver: navigator.webdriver,
  pluginsLength: navigator.plugins?.length ?? 0,
  pluginNames: Array.from(navigator.plugins ?? []).map(p => p.name),
  languages: navigator.languages,
  language: navigator.language,
  chromeExists: typeof window.chrome,
  chromeRuntimeExists: typeof window.chrome?.runtime,
  userAgent: navigator.userAgent,
  permissions: typeof navigator.permissions?.query,
  hardwareConcurrency: navigator.hardwareConcurrency,
  platform: navigator.platform,
  vendor: navigator.vendor,
  webGLVendor: (() => {
    try {
      const c = document.createElement('canvas');
      const gl = c.getContext('webgl');
      const ext = gl?.getExtension('WEBGL_debug_renderer_info');
      return ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : null;
    } catch { return null; }
  })(),
  webGLRenderer: (() => {
    try {
      const c = document.createElement('canvas');
      const gl = c.getContext('webgl');
      const ext = gl?.getExtension('WEBGL_debug_renderer_info');
      return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : null;
    } catch { return null; }
  })(),
}))()`);

console.log(JSON.stringify(probe, null, 2));

await tab.close();
await controller.close();
process.exit(0);
