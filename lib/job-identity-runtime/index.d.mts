// Type declarations for the JS-only runtime mirror.
// Mirrors the canonical signatures from
// apps/server/src/adapters/job-identity.ts so .ts call sites get
// type safety when consuming the .mjs module.

export interface JobIdentityInput {
  url?: string | null;
  company?: string | null;
  role?: string | null;
  source?: string | null;
  sourceJobId?: string | null;
  content?: string | null;
}

export interface JobIdentity {
  canonicalUrl: string;
  normalizedCompany: string;
  normalizedRole: string;
  companyRoleKey: string;
  sourceJobId: string | null;
  contentHash: string | null;
  stableKey: string;
}

export function canonicalizeJobUrl(raw: string | null | undefined): string | null;
export function normalizeJobUrl(value: string | null | undefined): string;
export function normalizeJobCompany(value: string): string;
export function normalizeJobRole(value: string): string;
export function jobCompanyRoleKey(company: string, role: string): string;
export function hashJobContent(value: string): string;
export function extractSourceJobId(url: string | null | undefined): string | null;
export function createJobIdentity(input: JobIdentityInput): JobIdentity;
