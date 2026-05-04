/**
 * Thin wrapper around the macOS `security` CLI.
 *
 * All vault operations route through here. We DO NOT depend on any native
 * Keychain bindings (e.g. node-keytar) — `security` is built into macOS,
 * has zero install cost, and is auditable.
 *
 * SECURITY CONTRACT:
 *   - Vault values (passwords) NEVER appear in logs, console, or error messages
 *   - This module makes ZERO network requests
 *   - Test mode (KEYCHAIN_MOCK env) injects a fake CLI for unit tests so
 *     real Keychain isn't polluted
 */

import { execFile } from "node:child_process";
import { platform } from "node:process";
import { promisify } from "node:util";

import {
  KeychainAccessDeniedError,
  KeychainCommandFailedError,
  KeychainEntryNotFoundError,
  KeychainNotAvailableError,
} from "./errors.js";

const exec = promisify(execFile);

export type SecurityRunner = (args: readonly string[]) => Promise<{ stdout: string; stderr: string }>;

const realRunner: SecurityRunner = async (args) => {
  return exec("security", [...args], { maxBuffer: 1024 * 1024 });
};

let activeRunner: SecurityRunner = realRunner;

/** Test-only: inject a mock security runner. */
export function setSecurityRunner(runner: SecurityRunner | null): void {
  activeRunner = runner ?? realRunner;
}

export function assertMacOS(): void {
  if (platform !== "darwin") {
    throw new KeychainNotAvailableError(platform);
  }
}

/**
 * Add or update a generic password entry. `-U` updates if it already exists.
 *
 * NOTE: We deliberately do NOT pass `-A` (allow access from any application).
 * That would lower security; we accept the per-binary confirmation prompt as
 * a feature, not a bug.
 */
export async function securityAdd(service: string, account: string, password: string): Promise<void> {
  assertMacOS();
  try {
    await activeRunner([
      "add-generic-password",
      "-U", // update if exists
      "-s", service,
      "-a", account,
      "-w", password,
    ]);
  } catch (err) {
    throw normalizeError(err, service);
  }
}

export async function securityFind(service: string): Promise<{ account: string; password: string }> {
  assertMacOS();
  let stdout = "";
  let stderr = "";
  try {
    const r = await activeRunner(["find-generic-password", "-s", service, "-g"]);
    stdout = r.stdout;
    stderr = r.stderr;
  } catch (err) {
    throw normalizeError(err, service);
  }
  // `find-generic-password -g` prints metadata to stdout and the password
  // to stderr in the form `password: "..."`.
  const passwordMatch = stderr.match(/^password:\s+"([^"]*)"\s*$/m) ?? stdout.match(/^password:\s+"([^"]*)"\s*$/m);
  const accountMatch = stdout.match(/^\s+"acct"<blob>="([^"]*)"\s*$/m);
  if (!passwordMatch) {
    throw new KeychainCommandFailedError(
      `find succeeded but password could not be extracted from output for service "${service}"`,
      0,
      "<redacted>", // do NOT include actual stderr here — may contain password
    );
  }
  return {
    account: accountMatch?.[1] ?? "",
    password: passwordMatch[1] ?? "",
  };
}

export async function securityDelete(service: string): Promise<void> {
  assertMacOS();
  try {
    await activeRunner(["delete-generic-password", "-s", service]);
  } catch (err) {
    throw normalizeError(err, service);
  }
}

export async function securityList(prefix: string): Promise<readonly string[]> {
  assertMacOS();
  try {
    // `dump-keychain` is too verbose; instead enumerate via `find-generic-password`
    // is impractical for prefix listing. We use the `security find-generic-password
    // -s <prefix>*` is not supported. Workaround: dump and grep client-side.
    const r = await activeRunner(["dump-keychain"]);
    const lines = r.stdout.split("\n");
    const services: string[] = [];
    for (const line of lines) {
      const m = line.match(/^\s+"svce"<blob>="([^"]*)"\s*$/);
      if (m && m[1] && m[1].startsWith(prefix)) {
        services.push(m[1]);
      }
    }
    return Array.from(new Set(services)).sort();
  } catch (err) {
    throw normalizeError(err, prefix);
  }
}

interface ExecError extends Error {
  code?: number | string;
  stderr?: string;
  stdout?: string;
}

function normalizeError(raw: unknown, key: string): Error {
  const err = raw as ExecError;
  const code = typeof err.code === "number" ? err.code : null;
  const stderr = err.stderr ?? "";
  if (/could not be found/i.test(stderr)) {
    return new KeychainEntryNotFoundError(key);
  }
  if (/User canceled|user.*denied|access.*denied|interaction.*not.*allowed/i.test(stderr)) {
    return new KeychainAccessDeniedError(key);
  }
  // SECURITY: Don't include stderr if it might contain the password
  // (find-generic-password -g leaks it). For other commands stderr is safe.
  const safeStderr = stderr.replace(/password:\s+"[^"]*"/g, 'password:"<redacted>"');
  return new KeychainCommandFailedError(
    err.message ?? "unknown error",
    code,
    safeStderr.slice(0, 500),
  );
}
