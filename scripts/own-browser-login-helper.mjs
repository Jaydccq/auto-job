#!/usr/bin/env node
/**
 * One-time login helper for the dedicated Chrome profile used by
 * @auto-job/browser. Opens LinkedIn / Indeed / Built In / JobRight one
 * by one and waits for the user to confirm login.
 *
 * Usage:
 *   npm run own-browser:login-helper
 *
 * The dedicated profile lives at ~/.auto-job/chrome-profile/. Logins
 * persist there (cookies survive across runs). Re-run if a site logs
 * you out.
 */

import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

import { BrowserController } from "../packages/browser/src/browser-controller.ts";

const SITES = [
  { name: "LinkedIn", url: "https://www.linkedin.com/login" },
  { name: "Indeed", url: "https://secure.indeed.com/auth" },
  { name: "Built In", url: "https://builtin.com/sign-in" },
  { name: "JobRight", url: "https://jobright.ai/" },
];

async function main() {
  const rl = createInterface({ input: stdin, output: stdout });
  console.log("auto-job own-browser login helper");
  console.log("This will open the dedicated Chrome profile and walk you through logging in to each scan target.");
  console.log("Profile: ~/.auto-job/chrome-profile  |  CDP port: 47320");
  console.log("");

  const controller = await BrowserController.ensure();

  try {
    for (const site of SITES) {
      console.log(`\n→ Opening ${site.name}: ${site.url}`);
      const tab = await controller.openTab(site.url);
      await rl.question(`Log in to ${site.name} in the opened tab, then press Enter to continue (or 's' to skip): `);
      await tab.close().catch(() => undefined);
    }
    console.log("\n✓ Login helper complete. Cookies persisted to ~/.auto-job/chrome-profile.");
    console.log("You can now run: npm run linkedin-scan / builtin-scan / indeed-scan / newgrad-scan");
  } finally {
    rl.close();
    await controller.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
