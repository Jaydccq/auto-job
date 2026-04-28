export type JobBoardDetailSource = "builtin" | "indeed";

const DESCRIPTION_START_RE =
  /^(job description|full job description|about the role|about this role|the role|overview|what you(?:'ll| will) do|responsibilities|requirements|qualifications|minimum qualifications|preferred qualifications|who you are|what you bring)\b/i;

const DESCRIPTION_STOP_RE =
  /^(similar jobs|related jobs|recommended jobs|more jobs|jobs you may like|view all jobs|apply now|apply for this job|share this job|report job|job details|about the company|company info|company information|explore jobs|search jobs|post a job)\b/i;

const JUNK_LINE_RE =
  /^(skip to main content|apply|apply now|save|saved|share|back to jobs|sign in|log in|create alert|job alert|upload your resume|post a job|find jobs|company reviews|find salaries|employers|privacy|terms|cookies?|built in|indeed)$/i;

export function htmlToReadableText(value: string): string {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(br|\/p|\/li|\/div|\/section|\/article|\/h[1-6])\b[^>]*>/gi, "\n")
    .replace(/<li\b[^>]*>/gi, "\n- ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .split(/\r?\n/)
    .map((line) => compact(line))
    .filter(Boolean)
    .join("\n");
}

export function normalizeJobBoardSalary(value: string | null | undefined): string | null {
  const cleaned = compact(value ?? "");
  if (!cleaned) return null;
  if (/turbo for students|get hired faster/i.test(cleaned)) return null;
  if (/\$\s?\d|\b\d{2,3}(?:,\d{3})?\s*[-–]\s*\d{2,3}(?:,\d{3})?\b|\b\d{2,3}k\b/i.test(cleaned)) {
    return cleaned;
  }
  return null;
}

export function sanitizeJobBoardDetailText(
  source: JobBoardDetailSource,
  rawText: string,
  fallbackText = "",
): string {
  const lines = readableLines(rawText);
  const sectionText = extractDescriptionSection(lines);
  if (isUsefulDescription(sectionText)) return sectionText.slice(0, 20_000);

  const cleanedText = cleanLines(lines).join("\n");
  if (isUsefulDescription(cleanedText) && !looksLikeBoardShell(source, cleanedText)) {
    return cleanedText.slice(0, 20_000);
  }

  const fallback = cleanLines(readableLines(fallbackText)).join("\n");
  return isUsefulFallback(fallback) ? fallback.slice(0, 20_000) : "";
}

function readableLines(value: string): string[] {
  const asText = value.includes("<") && value.includes(">")
    ? htmlToReadableText(value)
    : value;
  const out: string[] = [];
  let previous = "";
  for (const raw of asText.split(/\r?\n/)) {
    const line = compact(raw);
    if (!line || line === previous) continue;
    previous = line;
    out.push(line);
  }
  return out;
}

function cleanLines(lines: readonly string[]): string[] {
  return lines
    .map((line) => compact(line))
    .filter((line) => line && !JUNK_LINE_RE.test(line))
    .filter((line) => !/^(\d+\s+)?jobs? found\b/i.test(line))
    .filter((line) => !/\b(upload your resume|create a job alert|post your resume)\b/i.test(line));
}

function extractDescriptionSection(lines: readonly string[]): string {
  const cleaned = cleanLines(lines);
  for (let start = 0; start < cleaned.length; start += 1) {
    if (!DESCRIPTION_START_RE.test(cleaned[start] ?? "")) continue;
    const section: string[] = [];
    for (const line of cleaned.slice(start)) {
      if (section.length > 0 && DESCRIPTION_STOP_RE.test(line)) break;
      section.push(line);
      if (section.join("\n").length >= 20_000) break;
    }
    const text = section.join("\n").trim();
    if (isUsefulDescription(text)) return text;
  }
  return "";
}

function isUsefulDescription(value: string): boolean {
  const normalized = compact(value);
  if (normalized.length < 180) return false;
  if (hasStrongDescriptionSignal(normalized)) return true;
  return normalized.length >= 500 &&
    /\b(build|design|develop|implement|maintain|collaborate|support|own|ship|optimize|test|deploy)\b/i.test(normalized) &&
    /\b(software|engineer|engineering|application|platform|systems|services|product|customers|data|cloud|team)\b/i.test(normalized);
}

function isUsefulFallback(value: string): boolean {
  const normalized = compact(value);
  if (normalized.length < 50 || looksLikeAnyShell(normalized)) return false;
  if (hasStrongDescriptionSignal(normalized)) return true;
  return /\b(build|design|develop|implement|maintain|collaborate|support|ship|optimize|test|deploy)\b/i.test(normalized) &&
    /\b(software|engineer|engineering|application|platform|systems|services|python|java|sql|cloud|data)\b/i.test(normalized);
}

function hasStrongDescriptionSignal(value: string): boolean {
  return /\b(job description|responsibilities|requirements|qualifications|minimum qualifications|preferred qualifications|what you(?:'ll| will) do|about the role|about this role|you will|we are looking for|what you bring|who you are)\b/i.test(value);
}

function looksLikeBoardShell(source: JobBoardDetailSource, value: string): boolean {
  const normalized = value.toLowerCase().replace(/\s+/g, " ");
  if (source === "indeed") {
    return normalized.includes("find jobs company reviews") ||
      normalized.includes("upload your resume") ||
      normalized.includes("employers / post job") ||
      normalized.includes("please verify") ||
      normalized.includes("additional verification required");
  }
  return normalized.includes("built in") &&
    normalized.includes("search jobs") &&
    normalized.includes("post a job");
}

function looksLikeAnyShell(value: string): boolean {
  const normalized = value.toLowerCase().replace(/\s+/g, " ");
  return normalized.includes("find jobs company reviews") ||
    normalized.includes("upload your resume") ||
    (
      normalized.includes("built in") &&
      normalized.includes("search jobs") &&
      normalized.includes("post a job")
    );
}

function compact(value: string): string {
  return value.replace(/\u00a0/g, " ").replace(/[ \t]+/g, " ").trim();
}
