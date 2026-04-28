import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { jobCompanyRoleKey, normalizeJobUrl } from "./job-identity.js";

export interface EvaluatedJobIdentities {
  urls: Set<string>;
  companyRoles: Set<string>;
}

export function loadEvaluatedReportUrls(repoRoot: string): Set<string> {
  return loadEvaluatedJobIdentities(repoRoot).urls;
}

export function loadEvaluatedJobIdentities(repoRoot: string): EvaluatedJobIdentities {
  const reportsDir = join(repoRoot, "reports");
  const identities: EvaluatedJobIdentities = {
    urls: new Set<string>(),
    companyRoles: new Set<string>(),
  };

  if (!existsSync(reportsDir)) return identities;

  for (const file of readdirSync(reportsDir)) {
    if (!file.endsWith(".md")) continue;

    const markdown = readFileSync(join(reportsDir, file), "utf-8");
    const match = markdown.match(/^\*\*URL:\*\*\s+(.+)$/m);
    const canonical = normalizeJobUrl(match?.[1]);
    if (canonical) {
      identities.urls.add(canonical);
    }

    const parsedTitle = parseReportTitle(markdown);
    if (parsedTitle) {
      const key = jobCompanyRoleKey(parsedTitle.company, parsedTitle.role);
      if (key) identities.companyRoles.add(key);
    }
  }

  return identities;
}

function parseReportTitle(markdown: string): { company: string; role: string } | null {
  const heading = markdown.match(/^#\s+(?:Evaluation|Evaluaci[oó]n):\s+(.+)$/m)?.[1]?.trim();
  if (!heading) return null;

  const emDash = heading.match(/^(.+?)\s+—\s+(.+)$/);
  if (emDash) {
    return {
      company: emDash[1]!.trim(),
      role: emDash[2]!.trim(),
    };
  }

  const spacedHyphen = heading.match(/^(.+?)\s+-\s+(.+)$/);
  if (spacedHyphen) {
    return {
      company: spacedHyphen[1]!.trim(),
      role: spacedHyphen[2]!.trim(),
    };
  }

  return null;
}
