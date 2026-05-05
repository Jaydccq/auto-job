/**
 * Strong password generator. Used by `vaultGenerate` (optional helper).
 *
 * Constraints:
 *   - ≥20 chars (configurable)
 *   - ≥1 lowercase, ≥1 uppercase, ≥1 digit, ≥1 symbol
 *   - Uses crypto.randomBytes for entropy (not Math.random)
 *
 * The user has explicitly chosen to allow same-password reuse via vaultPut
 * (architecture decision A3). vaultGenerate is the OPTIONAL helper for users
 * who want unique strong passwords per site.
 */

import { randomBytes } from "node:crypto";

const LOWER = "abcdefghijklmnopqrstuvwxyz";
const UPPER = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const DIGITS = "0123456789";
const SYMBOLS = "!@#$%^&*()-_=+[]{};:,.<>?";

export interface GenerateOptions {
  /** Length in characters. Default: 24. Minimum enforced: 20. */
  length?: number;
  /** Override symbol set (e.g. exclude troublesome chars). */
  symbols?: string;
}

export function generatePassword(opts: GenerateOptions = {}): string {
  const len = Math.max(opts.length ?? 24, 20);
  const symbols = opts.symbols ?? SYMBOLS;
  const all = LOWER + UPPER + DIGITS + symbols;
  // Reserve at least one of each required class.
  const required = [
    pickFromCharset(LOWER),
    pickFromCharset(UPPER),
    pickFromCharset(DIGITS),
    pickFromCharset(symbols),
  ];
  // Fill the rest from the union.
  const fillers: string[] = [];
  for (let i = 0; i < len - required.length; i++) {
    fillers.push(pickFromCharset(all));
  }
  // Shuffle so required chars aren't always at the front.
  return shuffle([...required, ...fillers]).join("");
}

function pickFromCharset(charset: string): string {
  // Use rejection sampling on a single byte to avoid modulo bias.
  while (true) {
    const byte = randomBytes(1)[0]!;
    const limit = 256 - (256 % charset.length);
    if (byte < limit) return charset[byte % charset.length]!;
  }
}

function shuffle<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = randomByteBelow(i + 1);
    const tmp = out[i]!;
    out[i] = out[j]!;
    out[j] = tmp;
  }
  return out;
}

function randomByteBelow(n: number): number {
  while (true) {
    const byte = randomBytes(1)[0]!;
    const limit = 256 - (256 % n);
    if (byte < limit) return byte % n;
  }
}
