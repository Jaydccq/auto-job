/**
 * Manual probe: try multiple Workday tenants to see which are reachable.
 */
import { BrowserController } from "../src/browser-controller.ts";

const controller = await BrowserController.ensure();
const tab = await controller.openTab("about:blank");

const TENANTS = [
  { name: "amazon", host: "amazon.wd5.myworkdayjobs.com", site: "External_Career_Site" },
  { name: "adobe", host: "adobe.wd5.myworkdayjobs.com", site: "external_experienced" },
  { name: "cisco", host: "cisco.wd1.myworkdayjobs.com", site: "External" },
  { name: "nvidia", host: "nvidia.wd5.myworkdayjobs.com", site: "NVIDIAExternalCareerSite" },
  { name: "salesforce", host: "salesforce.wd1.myworkdayjobs.com", site: "External_Career_Site" },
  { name: "vmware", host: "vmware.wd1.myworkdayjobs.com", site: "VMware" },
];

for (const t of TENANTS) {
  console.log(`\n=== Tenant: ${t.name} (${t.host})`);
  const homeUrl = `https://${t.host}/${t.site}`;
  try {
    await tab.navigate(homeUrl, { waitUntil: "load" });
  } catch (e) {
    console.log("  navigate threw:", e.message.split("\n")[0]);
  }
  await new Promise((r) => setTimeout(r, 1500));
  console.log("  tab.url after navigate:", tab.url);

  const apiUrl = `https://${t.host}/wday/cxs/${t.name}/${t.site}/jobs`;
  const probe = await tab
    .evaluate(`(async () => {
      try {
        const r = await fetch(${JSON.stringify(apiUrl)}, {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json", accept: "application/json" },
          body: JSON.stringify({ appliedFacets: {}, limit: 1, offset: 0, searchText: "" }),
        });
        const text = await r.text();
        let parsed = null;
        try { parsed = JSON.parse(text); } catch {}
        return { ok: r.ok, status: r.status, contentType: r.headers.get("content-type"), totalJobs: parsed?.total ?? null, bodyPreview: text.slice(0, 200) };
      } catch (e) {
        return { error: String(e) };
      }
    })()`)
    .catch((e) => ({ evalError: e.message.split("\n")[0] }));
  console.log("  API probe:", JSON.stringify(probe));
}

await tab.close();
await controller.close();
process.exit(0);
