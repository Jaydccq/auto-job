/**
 * @career-ops/shared — types shared across the bridge server, the
 * Chrome extension, and (future) desktop client.
 *
 * CONTRACTS ONLY. No runtime code. Anything imported here must compile
 * cleanly under both NodeNext (server, tsx) and esbuild (extension).
 *
 * Populated incrementally — only add types that cross app boundaries.
 */

export * from "./contracts/envelope.js";
export * from "./contracts/jobs.js";
export * from "./contracts/api.js";
export * from "./contracts/newgrad.js";
export * from "./contracts/autofill.js";
