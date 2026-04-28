#!/usr/bin/env node
// Deprecated — the dashboard is now served by the bridge at
//   http://127.0.0.1:47319/dashboard/
// Run `bun run server` and open the URL above.
//
// Helpers that used to live here moved to web/dashboard-handlers.mjs
// and are now imported by apps/server/src/routes/dashboard.ts.
console.error(
  "web/dashboard-server.mjs is deprecated.\n" +
  "The dashboard is now served by the bridge at http://127.0.0.1:47319/dashboard/\n" +
  "Run `bun run server` and open the URL above.\n"
);
process.exit(1);
