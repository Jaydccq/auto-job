/**
 * High-level vault API. Uses the keychain.ts wrapper underneath.
 *
 * Key naming convention (architecture decision D5):
 *   `auto-job:<ats>-<tenant>` — e.g. "auto-job:workday-amazon"
 * Use `vaultKey(ats, tenant)` to construct keys consistently.
 */

import { generatePassword, type GenerateOptions } from "./password-gen.js";
import {
  securityAdd,
  securityDelete,
  securityFind,
  securityList,
} from "./keychain.js";

const KEY_PREFIX = "auto-job:";

export interface VaultEntry {
  email: string;
  password: string;
}

export function vaultKey(ats: string, tenant: string): string {
  if (!ats) throw new Error("vaultKey: ats is required");
  if (!tenant) throw new Error("vaultKey: tenant is required");
  return `${KEY_PREFIX}${ats.toLowerCase()}-${tenant.toLowerCase()}`;
}

export async function vaultPut(key: string, email: string, password: string): Promise<void> {
  if (!key.startsWith(KEY_PREFIX)) {
    throw new Error(`vaultPut: key must start with "${KEY_PREFIX}"`);
  }
  if (!email) throw new Error("vaultPut: email is required");
  if (!password) throw new Error("vaultPut: password is required");
  await securityAdd(key, email, password);
}

export async function vaultGet(key: string): Promise<VaultEntry> {
  const { account, password } = await securityFind(key);
  return { email: account, password };
}

export async function vaultDelete(key: string): Promise<void> {
  await securityDelete(key);
}

/**
 * Generate a strong random password, store it under `key` with the given
 * `email`, and return the generated password. Use this when you want a
 * unique strong password per site.
 *
 * Architecture decision A3: this is OPTIONAL. The primary `vaultPut` path
 * lets the user supply any password (including reused-across-sites for
 * convenience).
 */
export async function vaultGenerate(
  key: string,
  email: string,
  opts?: GenerateOptions,
): Promise<string> {
  const password = generatePassword(opts);
  await vaultPut(key, email, password);
  return password;
}

/** List vault keys (names only — never values). */
export async function vaultList(): Promise<readonly string[]> {
  return securityList(KEY_PREFIX);
}
