/**
 * Apply-queue named errors.
 *
 * Phase 2C: EntryNotApprovableError surfaces when CLI/runner tries to
 * processApprovedEntry an entry whose status forbids the transition.
 */

import type { ApplyStatus } from "./types.js";

export class EntryNotApprovableError extends Error {
  readonly name = "EntryNotApprovableError";
  constructor(
    public readonly id: string,
    public readonly currentStatus: ApplyStatus | "<missing>",
  ) {
    super(
      currentStatus === "<missing>"
        ? `apply-queue: no entry with id "${id}" (try \`auto-apply-approve list\`)`
        : `apply-queue: entry "${id}" has status "${currentStatus}"; only "awaiting_approval" can be approved`,
    );
  }
}
