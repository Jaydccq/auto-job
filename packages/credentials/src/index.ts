/**
 * @auto-job/credentials
 *
 * macOS Keychain credential vault. Local-only, never logs values, never
 * networks. Used by Phase 2+ auto-apply and signup flows.
 *
 * Surface:
 *   await vaultPut(vaultKey("workday", "amazon"), "user@gmail.com", "MyPwd!");
 *   const { email, password } = await vaultGet(vaultKey("workday", "amazon"));
 *   await vaultDelete(...);
 *   const newPwd = await vaultGenerate(vaultKey("..."), "user@gmail.com");
 *   const keys = await vaultList();  // names only
 */

export {
  vaultKey,
  vaultPut,
  vaultGet,
  vaultDelete,
  vaultGenerate,
  vaultList,
  type VaultEntry,
} from "./vault.js";

export { generatePassword, type GenerateOptions } from "./password-gen.js";

export { setSecurityRunner, assertMacOS, type SecurityRunner } from "./keychain.js";

export {
  KeychainNotAvailableError,
  KeychainEntryNotFoundError,
  KeychainAccessDeniedError,
  KeychainCommandFailedError,
} from "./errors.js";
