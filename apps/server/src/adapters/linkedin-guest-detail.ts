export interface LinkedInGuestJobDetail {
  finalUrl: string;
  title: string;
  company: string;
  location: string;
  workModel: string | null;
  employmentType: string | null;
  salaryRange: string | null;
  description: string;
  responsibilities: string[];
  requiredQualifications: string[];
  skillTags: string[];
}

export function parseLinkedInGuestJobPostingHtml(
  html: string,
  finalUrl: string,
): LinkedInGuestJobDetail {
  const descriptionHtml = extractLinkedInGuestDescriptionHtml(html);
  const rawDescription = htmlToText(descriptionHtml)
    .split(/\r?\n/)
    .filter((line) => !/^(show more|show less)$/i.test(line))
    .join("\n");
  const description = rawDescription
    ? `About the job\n${rawDescription}`.slice(0, 30_000)
    : "";
  const criteriaText = htmlToText(
    html.match(/<ul[^>]*class="[^"]*\bdescription__job-criteria-list\b[^"]*"[^>]*>([\s\S]*?)<\/ul>/i)?.[1] ?? "",
  );

  return {
    finalUrl,
    title: firstHtmlText(html, /<h2[^>]*class="[^"]*\btopcard__title\b[^"]*"[^>]*>([\s\S]*?)<\/h2>/i),
    company: firstHtmlText(html, /<a[^>]*class="[^"]*\btopcard__org-name-link\b[^"]*"[^>]*>([\s\S]*?)<\/a>/i),
    location: firstHtmlText(html, /<span[^>]*class="[^"]*\btopcard__flavor--bullet\b[^"]*"[^>]*>([\s\S]*?)<\/span>/i),
    workModel: /\bremote\b/i.test(description) ? "Remote" : /\bhybrid\b/i.test(description) ? "Hybrid" : /\b(on-site|onsite)\b/i.test(description) ? "On-site" : null,
    employmentType: /\bfull[-\s]?time\b/i.exec(criteriaText || description)?.[0] ?? null,
    salaryRange: salaryFromText(description || htmlToText(html)),
    description,
    responsibilities: sectionItems(description, /^(primary responsibilities|responsibilities|what you(?:'|’)?ll do|what you will do|you will|about the role)$/i),
    requiredQualifications: sectionItems(description, /^(requirements|qualifications|basic qualifications|required qualifications|preferred qualifications|what you bring|who you are)$/i),
    skillTags: skillTagsFromText(description),
  };
}

function extractLinkedInGuestDescriptionHtml(html: string): string {
  const descriptionSection = html.match(
    /<div[^>]*class="[^"]*\bdescription__text\b[^"]*"[^>]*>([\s\S]*?)<ul[^>]*class="[^"]*\bdescription__job-criteria-list\b/i,
  )?.[1] ?? html.match(
    /<section[^>]*class="[^"]*\bdescription\b[^"]*"[^>]*>([\s\S]*?)<section[^>]*class="[^"]*\bfind-a-referral\b/i,
  )?.[1] ?? "";
  if (!descriptionSection) return "";

  return descriptionSection.match(
    /<div[^>]*class="[^"]*\bshow-more-less-html__markup\b[^"]*"[^>]*>([\s\S]*?)<\/div>\s*(?:<button|<\/section>)/i,
  )?.[1] ?? descriptionSection;
}

function decodeHtml(value: string): string {
  const named: Record<string, string> = {
    amp: "&",
    gt: ">",
    lt: "<",
    nbsp: " ",
    quot: '"',
    apos: "'",
  };
  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (entity, code: string) => {
    if (code[0] === "#") {
      const raw = code[1]?.toLowerCase() === "x" ? code.slice(2) : code.slice(1);
      const radix = code[1]?.toLowerCase() === "x" ? 16 : 10;
      const point = Number.parseInt(raw, radix);
      return Number.isFinite(point) ? String.fromCodePoint(point) : entity;
    }
    return named[code.toLowerCase()] ?? entity;
  });
}

function htmlToText(value: string): string {
  return decodeHtml(value)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|li|ul|ol|section|strong|b)>/gi, "\n")
    .replace(/<li\b[^>]*>/gi, "")
    .replace(/<[^>]+>/g, "")
    .split(/\r?\n/)
    .map((line) => line.replace(/\u00a0/g, " ").replace(/[ \t]+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

function firstHtmlText(html: string, pattern: RegExp): string {
  const match = html.match(pattern);
  return match?.[1] ? htmlToText(match[1]) : "";
}

function sectionItems(source: string, headingPattern: RegExp): string[] {
  const sourceLines = source.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const start = sourceLines.findIndex((line) => headingPattern.test(line));
  if (start === -1) return [];

  const items: string[] = [];
  for (const line of sourceLines.slice(start + 1)) {
    if (/^(benefits|preferred qualifications|qualifications|requirements|responsibilities|skills|about|what you(?:'|’)?ll do|what you will do|you will|who you are|partner with|maintain|build & deploy)$/i.test(line)) {
      if (items.length > 0) break;
      continue;
    }
    const cleaned = line.replace(/^[-•*]\s*/, "").trim();
    if (cleaned.length < 20 || cleaned.length > 500) continue;
    items.push(cleaned);
    if (items.length >= 12) break;
  }
  return items;
}

function salaryFromText(value: string): string | null {
  const match = value.replace(/\s+/g, " ").trim().match(
    /\$\s?\d{2,3}(?:,\d{3})?(?:\.\d+)?\s*(?:k|K)?\s*(?:\/\s?(?:yr|year|hr|hour))?\s*[-–]\s*\$?\s?\d{2,3}(?:,\d{3})?(?:\.\d+)?\s*(?:k|K)?(?:\s*\/\s?(?:yr|year|hr|hour))?/i,
  );
  return match?.[0] ? match[0].replace(/\s+/g, " ").trim() : null;
}

function skillTagsFromText(value: string): string[] {
  const skills = [
    "TypeScript",
    "JavaScript",
    "Python",
    "React",
    "Node.js",
    "Java",
    "Go",
    "C++",
    "SQL",
    "AWS",
    "Azure",
    "GCP",
    "Kubernetes",
    "Docker",
    "LLM",
    "AI",
    "Machine Learning",
    "Spark",
    "Kafka",
    "Flink",
    "ClickHouse",
    "OpenAI",
    "Claude",
    "MCP",
  ];
  const normalized = value.toLowerCase();
  return skills.filter((skill) => normalized.includes(skill.toLowerCase())).slice(0, 22);
}
