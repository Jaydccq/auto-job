export type LinkedInAuthBlock = "login" | "checkpoint" | "authwall";

export interface LinkedInAuthStateInput {
  url?: string | null;
  title?: string | null;
  text?: string | null;
}

export interface LinkedInVisibleJobCard {
  title: string;
  company: string;
  location: string;
  postedAgo: string;
  workModel: string;
  text: string;
}

const LINKEDIN_HOST_RE = /(^|\.)linkedin\.com$/i;

export function isLinkedInHost(hostname: string | null | undefined): boolean {
  return LINKEDIN_HOST_RE.test((hostname ?? "").toLowerCase());
}

export function extractLinkedInJobId(value: string | null | undefined): string | null {
  const raw = value?.trim();
  if (!raw) return null;

  try {
    const parsed = new URL(raw);
    if (!isLinkedInHost(parsed.hostname)) return null;

    const currentJobId = parsed.searchParams.get("currentJobId");
    if (currentJobId && /^\d+$/.test(currentJobId)) return currentJobId;

    const pathMatch = parsed.pathname.match(/\/jobs\/view\/(\d+)(?:\/|$)/i);
    if (pathMatch?.[1]) return pathMatch[1];
  } catch {
    // Fall through to text patterns for raw href fragments.
  }

  const pathMatch = raw.match(/\/jobs\/view\/(\d+)(?:[/?#]|$)/i);
  if (pathMatch?.[1]) return pathMatch[1];

  const paramMatch = raw.match(/[?&]currentJobId=(\d+)(?:[&#]|$)/i);
  return paramMatch?.[1] ?? null;
}

export function canonicalLinkedInJobViewUrl(value: string | null | undefined): string | null {
  const jobId = extractLinkedInJobId(value);
  return jobId ? `https://www.linkedin.com/jobs/view/${jobId}/` : null;
}

export function isLinkedInJobsUrl(value: string | null | undefined): boolean {
  return canonicalLinkedInJobViewUrl(value) !== null;
}

export function buildLinkedInSearchPageUrls(
  searchUrl: string,
  pages: number,
  pageSize: number,
): string[] {
  if (!Number.isInteger(pages) || pages <= 0) {
    throw new Error("pages must be a positive integer");
  }
  if (!Number.isInteger(pageSize) || pageSize <= 0) {
    throw new Error("pageSize must be a positive integer");
  }

  const parsed = new URL(searchUrl);
  if (!isLinkedInHost(parsed.hostname)) {
    throw new Error("LinkedIn search URL must use linkedin.com");
  }

  return Array.from({ length: pages }, (_, index) => {
    const pageUrl = new URL(parsed.toString());
    if (index === 0) {
      return pageUrl.toString();
    }

    pageUrl.searchParams.delete("currentJobId");
    pageUrl.searchParams.set("start", String(index * pageSize));
    return pageUrl.toString();
  });
}

export function normalizeLinkedInPostedAgo(value: string | null | undefined): string {
  const normalized = compact(value ?? "").replace(/^posted\s+/i, "");
  if (!normalized) return "unknown";

  if (/\b(just now|today|moments ago|a moment ago)\b/i.test(normalized)) {
    return "today";
  }

  if (/\b(?:reposted\s+)?an?\s+minute\s+ago\b/i.test(normalized)) {
    return "1 minute ago";
  }

  if (/\b(?:reposted\s+)?an?\s+hour\s+ago\b/i.test(normalized)) {
    return "1 hour ago";
  }

  if (/\byesterday\b/i.test(normalized)) {
    return "1 day ago";
  }

  const match = normalized.match(
    /\b(?:reposted\s+)?(\d+)\s*(minutes?|mins?|hours?|hrs?|days?|weeks?|months?)\s+ago\b/i,
  );
  if (!match) return "unknown";

  const amount = Number(match[1]);
  const rawUnit = (match[2] ?? "").toLowerCase();
  if (!Number.isFinite(amount) || amount <= 0) return "unknown";

  if (rawUnit.startsWith("min")) return `${amount} minute${amount === 1 ? "" : "s"} ago`;
  if (rawUnit.startsWith("hr") || rawUnit.startsWith("hour")) {
    return `${amount} hour${amount === 1 ? "" : "s"} ago`;
  }
  if (rawUnit.startsWith("day")) return `${amount} day${amount === 1 ? "" : "s"} ago`;
  if (rawUnit.startsWith("week")) return `${amount} week${amount === 1 ? "" : "s"} ago`;
  if (rawUnit.startsWith("month")) return `${amount} month${amount === 1 ? "" : "s"} ago`;
  return "unknown";
}

export function parseLinkedInWorkModel(value: string | null | undefined): string {
  const normalized = compact(value ?? "");
  if (!normalized) return "";
  if (/\bremote\b/i.test(normalized)) return "Remote";
  if (/\bhybrid\b/i.test(normalized)) return "Hybrid";
  if (/\b(on-site|onsite)\b/i.test(normalized)) return "On-site";
  return "";
}

export function parseLinkedInVisibleJobCardText(value: string | null | undefined): LinkedInVisibleJobCard | null {
  const text = compactLines(value ?? "");
  if (!text) return null;

  const sourceLines = lines(value ?? "");
  const postedAgo = normalizeLinkedInPostedAgo(text);
  if (postedAgo === "unknown") return null;

  const linesBeforePosted = sourceLines.filter((line) => {
    if (/^posted\s+/i.test(line)) return false;
    if (normalizeLinkedInPostedAgo(line) !== "unknown") return false;
    if (line === "\u00b7" || line === "-") return false;
    return true;
  });
  const usefulLines = linesBeforePosted.filter((line) => !isLinkedInVisibleRowNoise(line));
  if (usefulLines.length < 3) return null;

  const title = normalizeLinkedInTitleLine(usefulLines[0] ?? "");
  const titleKey = title.toLowerCase();
  const company = usefulLines.find((line, index) => {
    if (index === 0) return false;
    if (normalizeLinkedInTitleLine(line).toLowerCase() === titleKey) return false;
    return isLikelyLinkedInCompanyLine(line);
  }) ?? "";
  const companyIndex = company ? usefulLines.indexOf(company) : -1;
  const location = usefulLines.find((line, index) => index > companyIndex && isLikelyLinkedInLocationLine(line)) ?? "";

  if (!title || !company || !location) return null;
  if (!isLikelyLinkedInJobTitle(title)) return null;

  return {
    title,
    company,
    location,
    postedAgo,
    workModel: parseLinkedInWorkModel(location || text),
    text,
  };
}

export function detectLinkedInAuthBlock(input: LinkedInAuthStateInput): LinkedInAuthBlock | null {
  const url = (input.url ?? "").toLowerCase();
  const title = compact(input.title ?? "").toLowerCase();
  const text = compact(input.text ?? "").toLowerCase();
  const combined = `${title}\n${text}`;

  if (url.includes("/checkpoint/") || /\bsecurity verification\b/.test(combined)) {
    return "checkpoint";
  }

  if (url.includes("/authwall") || /\bauthwall\b/.test(url)) {
    return "authwall";
  }

  if (
    url.includes("/login") ||
    url.includes("/uas/login") ||
    /\bsign in\b/.test(title) ||
    /\bjoin linkedin\b/.test(combined) ||
    /\bsign in to view\b/.test(combined)
  ) {
    return "login";
  }

  return null;
}

function compact(value: string): string {
  return value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function compactLines(value: string): string {
  return lines(value).join("\n");
}

function lines(value: string): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of value.split(/\r?\n/)) {
    const line = compact(raw);
    if (!line) continue;
    const key = line.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(line);
  }
  return result;
}

function isLinkedInVisibleRowNoise(line: string): boolean {
  return /^(viewed|promoted|easy apply|apply|save|be an early applicant|actively recruiting|skip to main content|notifications?|messaging)$/i.test(line) ||
    /^\d+\s+notifications?$/i.test(line) ||
    /\s+with verification$/i.test(line) ||
    /\b(school alumni work here|benefit|benefits?|clicked apply|applicants?|connections?)\b/i.test(line);
}

function normalizeLinkedInTitleLine(line: string): string {
  return line.replace(/\s+with verification$/i, "").trim();
}

function isLikelyLinkedInJobTitle(line: string): boolean {
  if (line.length < 3 || line.length > 180) return false;
  if (/^(past 24 hours|remote|computer vision|llm|gen ai|data|experience level|employment type|company|skip to main content)$/i.test(line)) {
    return false;
  }
  if (/^\d+\s+notifications?$/i.test(line)) return false;
  return !isLikelyLinkedInLocationLine(line);
}

function isLikelyLinkedInCompanyLine(line: string): boolean {
  if (line.length < 2 || line.length > 120) return false;
  if (isLinkedInVisibleRowNoise(line)) return false;
  if (isLikelyLinkedInLocationLine(line)) return false;
  return normalizeLinkedInPostedAgo(line) === "unknown";
}

function isLikelyLinkedInLocationLine(line: string): boolean {
  if (line.length < 2 || line.length > 160) return false;
  if (/\b(remote|hybrid|on-site|onsite)\b/i.test(line)) return true;
  if (/\bUnited States\b/i.test(line)) return true;
  if (/\b\d+\s+locations?\b/i.test(line)) return true;
  return /\b[A-Z][A-Za-z .'-]+,\s*[A-Z]{2}\b/.test(line);
}
