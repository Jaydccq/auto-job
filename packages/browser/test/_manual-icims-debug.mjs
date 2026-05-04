/**
 * Last-ditch iCIMS probe: small / academic / less-famous tenants.
 */
import { BrowserController } from "../src/browser-controller.ts";

const controller = await BrowserController.ensure();
const tab = await controller.openTab("about:blank");

const TENANTS = [
  "cornell",      // Cornell U
  "vitas",        // Vitas Healthcare
  "molina",       // Molina Healthcare
  "spx",          // SPX Tech
  "brookfield",   // Brookfield Properties
  "pcgus",        // Public Consulting Group (random non-FAANG)
  "freseniuskidneycare", // Fresenius Kidney Care
];

for (const tenant of TENANTS) {
  const url = `https://careers-${tenant}.icims.com/jobs/search?ss=1`;
  try { await tab.navigate(url, { waitUntil: "load" }); } catch {}
  await new Promise((r) => setTimeout(r, 1500));
  const probe = await tab
    .evaluate(`(() => {
      const txt = (document.body?.innerText || "").slice(0, 80).replace(/\\s+/g, " ");
      const hasJobs = !!document.querySelector('.iCIMS_JobsTableRow, .iCIMS_JobLine, table tr a[href*="/jobs/"], [data-rowindex]');
      const hasError = /If you believe this is in error|Page not found/i.test(document.body?.innerText || "");
      return { url: location.href, head: txt, hasJobs, hasError };
    })()`)
    .catch((e) => ({ err: e.message.split("\n")[0] }));
  console.log(`${tenant}: hasJobs=${probe.hasJobs} hasError=${probe.hasError} url=${probe.url}`);
}

await tab.close();
await controller.close();
process.exit(0);
