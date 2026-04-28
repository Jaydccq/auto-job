/**
 * bridge-wire.ts — extension-side view of the bridge HTTP contract.
 *
 * The canonical definitions live in @career-ops/shared. This file
 * re-exports them under a single name the extension code imports from,
 * so individual modules don't reach into the workspace package directly.
 *
 * CONTRACTS ONLY. No runtime.
 */

export * from "@career-ops/shared";
