/**
 * DOM extractors for BuiltIn job listing and detail pages.
 *
 * Exported functions are self-contained so they can be passed directly to
 * chrome.scripting.executeScript({ func: ... }).
 */

export interface BuiltInRow {
  source?: string;
  position: number;
  title: string;
  postedAgo: string;
  applyUrl: string;
  detailUrl: string;
  workModel: string;
  location: string;
  company: string;
  salary: string | null;
  companySize: string | null;
  industry: string | null;
  qualifications: string | null;
  h1bSponsored: boolean;
  sponsorshipSupport: "yes" | "no" | "unknown";
  confirmedSponsorshipSupport: "yes" | "no" | "unknown";
  requiresActiveSecurityClearance: boolean;
  confirmedRequiresActiveSecurityClearance: boolean;
  isNewGrad: boolean;
}

export interface BuiltInDetail {
  position: number;
  title: string;
  company: string;
  location: string;
  employmentType: string | null;
  workModel: string | null;
  seniorityLevel: string | null;
  salaryRange: string | null;
  matchScore: number | null;
  expLevelMatch: number | null;
  skillMatch: number | null;
  industryExpMatch: number | null;
  description: string;
  industries: readonly string[];
  recommendationTags: readonly string[];
  responsibilities: readonly string[];
  requiredQualifications: readonly string[];
  skillTags: readonly string[];
  taxonomy: readonly string[];
  companyWebsite: string | null;
  companyDescription: string | null;
  companySize: string | null;
  companyLocation: string | null;
  companyFoundedYear: string | null;
  companyCategories: readonly string[];
  h1bSponsorLikely: boolean | null;
  sponsorshipSupport: "yes" | "no" | "unknown";
  h1bSponsorshipHistory: readonly { year: string; count: number }[];
  requiresActiveSecurityClearance: boolean;
  confirmedSponsorshipSupport: "yes" | "no" | "unknown";
  confirmedRequiresActiveSecurityClearance: boolean;
  insiderConnections: number | null;
  originalPostUrl: string;
  applyNowUrl: string;
  applyFlowUrls: readonly string[];
}

export async function extractBuiltInList(): Promise<BuiltInRow[]> {
  await new Promise((resolve) => setTimeout(resolve, 350));

  function text(el: Element | null | undefined): string {
    if (!el) return "";
    return ((el as HTMLElement).innerText ?? el.textContent ?? "").trim();
  }

  function compact(value: string): string {
    return value.replace(/\u00a0/g, " ").replace(/[ \t]+/g, " ").trim();
  }

  function lines(value: string): string[] {
    return value
      .split(/\r?\n/)
      .map((line) => compact(line))
      .filter(Boolean);
  }

  function absoluteUrl(value: string | null | undefined): string {
    if (!value) return "";
    try {
      const url = new URL(value, window.location.href);
      url.hash = "";
      return url.toString();
    } catch {
      return "";
    }
  }

  function isBuiltInJobLink(anchor: HTMLAnchorElement): boolean {
    const url = absoluteUrl(anchor.href || anchor.getAttribute("href"));
    if (!url) return false;
    try {
      const parsed = new URL(url);
      const host = parsed.hostname.toLowerCase();
      return (
        (host === "builtin.com" || host.endsWith(".builtin.com")) &&
        parsed.pathname.startsWith("/job/") &&
        compact(text(anchor)).length > 1
      );
    } catch {
      return false;
    }
  }

  function closestJobCard(anchor: HTMLAnchorElement): Element {
    let current: Element | null = anchor.parentElement;
    let fallback: Element = anchor;
    while (current && current !== document.body) {
      const body = compact(text(current));
      if (body.length > 70 && body.length < 6000) {
        fallback = current;
        if (
          /\b(ago|saved|top skills|annually|hourly|remote|hybrid|in-office|level|internship|easy apply)\b/i.test(body)
        ) {
          return current;
        }
      }
      current = current.parentElement;
    }
    return fallback;
  }

  function cleanCompanyLine(line: string, title: string): string {
    const normalized = compact(line)
      .replace(/^Image:\s*/i, "")
      .replace(/\s+Logo$/i, "")
      .replace(/\s*\|\s*Built In$/i, "")
      .trim();
    if (!normalized) return "";
    if (normalized.toLowerCase() === title.toLowerCase()) return "";
    if (/^(saved|new|easy apply|top skills:?|remote|hybrid|in-office|on-site|onsite)$/i.test(normalized)) return "";
    if (/\b(annually|hourly|level|internship|locations?)\b/i.test(normalized)) return "";
    if (normalized.length > 80) return "";
    return normalized;
  }

  function companyFromCard(card: Element, title: string): string {
    const companyAnchor = Array.from(card.querySelectorAll<HTMLAnchorElement>("a[href]"))
      .find((anchor) => {
        const href = anchor.href || anchor.getAttribute("href") || "";
        const label = compact(text(anchor));
        return (
          /\/compan(?:y|ies)\//i.test(href) &&
          label.length > 0 &&
          label.toLowerCase() !== title.toLowerCase()
        );
      });
    if (companyAnchor) return compact(text(companyAnchor));

    const cardLines = lines(text(card));
    const titleIndex = cardLines.findIndex((line) => line.toLowerCase() === title.toLowerCase());
    if (titleIndex > 0) {
      for (let i = titleIndex - 1; i >= 0; i--) {
        const candidate = cleanCompanyLine(cardLines[i] ?? "", title);
        if (candidate) return candidate;
      }
    }
    for (const line of cardLines) {
      const candidate = cleanCompanyLine(line, title);
      if (candidate) return candidate;
    }
    return "";
  }

  function normalizePostedAgo(cardText: string): string {
    const value = compact(cardText);
    if (/\b(reposted\s+)?an?\s+hour\s+ago\b/i.test(value)) return "1 hour ago";
    const minutes = value.match(/\b(?:reposted\s+)?(\d+)\s+minutes?\s+ago\b/i);
    if (minutes) return `${minutes[1]} minutes ago`;
    const hours = value.match(/\b(?:reposted\s+)?(\d+)\s+hours?\s+ago\b/i);
    if (hours) return `${hours[1]} hours ago`;
    if (/\byesterday\b/i.test(value)) return "1 day ago";
    const days = value.match(/\b(?:reposted\s+)?(\d+)\s+days?\s+ago\b/i);
    if (days) return `${days[1]} days ago`;
    const weeks = value.match(/\b(?:reposted\s+)?(\d+)\s+weeks?\s+ago\b/i);
    if (weeks) return `${weeks[1]} weeks ago`;
    const months = value.match(/\b(?:reposted\s+)?(\d+)\s+months?\s+ago\b/i);
    if (months) return `${months[1]} months ago`;
    return "unknown";
  }

  function salaryFromText(cardText: string): string | null {
    const match = compact(cardText).match(
      /\$?\d+(?:,\d{3})?(?:\.\d+)?\s*[Kk]?\s*-\s*\$?\d+(?:,\d{3})?(?:\.\d+)?\s*[Kk]?\s+(?:Annually|Yearly|Hourly|Monthly)\b/i,
    );
    return match ? compact(match[0]) : null;
  }

  function workModelFromText(cardText: string): string {
    if (/\bRemote or Hybrid\b/i.test(cardText)) return "Remote or Hybrid";
    if (/\bHybrid\b/i.test(cardText)) return "Hybrid";
    if (/\bRemote\b/i.test(cardText)) return "Remote";
    if (/\bIn-Office\b/i.test(cardText)) return "In-Office";
    if (/\b(On-site|Onsite)\b/i.test(cardText)) return "On-site";
    return "";
  }

  function isLocationLine(line: string, workModel: string | null): boolean {
    const blocked = /^(saved|new|easy apply|top skills:?|remote|hybrid|remote or hybrid|in-office|on-site|onsite)$/i;
    const salary = /\b(annually|hourly|monthly|yearly|level|internship)\b/i;
    if (blocked.test(line) || salary.test(line)) return false;
    if (workModel && line.toLowerCase() === workModel.toLowerCase()) return false;
    if (/\b\d+\s+Locations\b/i.test(line)) return true;
    if (/\b(?:USA|CAN|GBR|IND|IRL|AUS|SGP|KOR|ISR|DEU|FRA|MEX|ZAF|AUT|POL|PRT|TUR)\b$/i.test(line)) return true;
    if (/\b[A-Z][a-z]+(?: [A-Z][a-z]+)*,\s*[A-Z]{2}\b/.test(line)) return true;
    if (/\bUSA\b/i.test(line)) return true;
    if (/Hiring Remotely/i.test(line)) return true;
    return false;
  }

  function locationNearIcon(card: Element, workModel: string | null): string {
    const icon = Array.from(card.querySelectorAll<Element>("i, svg, [class]"))
      .find((element) => /\b(?:fa-)?location-dot\b/i.test(String(element.getAttribute("class") ?? "")));
    let current = icon?.parentElement ?? null;
    for (let depth = 0; current && depth < 5; depth++) {
      const candidate = lines(text(current)).find((line) => isLocationLine(line, workModel));
      if (candidate) return candidate;
      current = current.parentElement;
    }
    return "";
  }

  function locationFromLines(cardLines: string[], workModel: string): string {
    for (const line of cardLines) {
      if (isLocationLine(line, workModel)) return line;
      if (workModel === "Remote" && /\bRemote\b/i.test(line)) return line;
    }
    return "";
  }

  function industryFromLines(cardLines: string[]): string | null {
    const line = cardLines.find((candidate) => {
      return candidate.includes("•") && !/^top skills/i.test(candidate) && candidate.length <= 180;
    });
    return line ?? null;
  }

  function parseSponsorshipStatus(value: string): "yes" | "no" | "unknown" {
    const normalized = value.toLowerCase().replace(/\s+/g, " ");
    const negative = [
      "no sponsorship",
      "without sponsorship",
      "unable to sponsor",
      "cannot sponsor",
      "can't sponsor",
      "will not sponsor",
      "does not provide sponsorship",
      "sponsorship not available",
      "must be authorized to work without sponsorship",
    ];
    if (negative.some((signal) => normalized.includes(signal))) return "no";
    const positive = [
      "visa sponsorship available",
      "sponsorship available",
      "will sponsor",
      "immigration support",
    ];
    if (positive.some((signal) => normalized.includes(signal))) return "yes";
    return "unknown";
  }

  function requiresActiveClearance(value: string): boolean {
    const normalized = value.toLowerCase().replace(/\s+/g, " ");
    if (!/(security clearance|secret clearance|top secret|ts\/sci|sci clearance)/.test(normalized)) return false;
    if (/\b(ability to obtain|eligible to obtain|obtain and maintain|preferred|nice to have)\b/.test(normalized)) {
      return false;
    }
    return true;
  }

  function isEarlyCareer(title: string, cardText: string): boolean {
    const normalized = `${title}\n${cardText}`.toLowerCase();
    return /\b(new grad|new graduate|graduate|entry level|junior|associate|early career|university|software engineer i|engineer i|developer i)\b/.test(normalized);
  }

  const anchors = Array.from(document.querySelectorAll<HTMLAnchorElement>("a[href]"))
    .filter(isBuiltInJobLink);
  const seen = new Set<string>();
  const rows: BuiltInRow[] = [];

  for (const anchor of anchors) {
    const detailUrl = absoluteUrl(anchor.href || anchor.getAttribute("href"));
    if (!detailUrl || seen.has(detailUrl)) continue;
    seen.add(detailUrl);

    const title = compact(text(anchor));
    if (!title) continue;
    const card = closestJobCard(anchor);
    const cardText = compact(text(card));
    const cardLines = lines(text(card));
    const company = companyFromCard(card, title);
    const workModel = workModelFromText(cardText);
    const sponsorshipSupport = parseSponsorshipStatus(cardText);
    const clearance = requiresActiveClearance(cardText);
    const topSkillsLine = cardLines.find((line) => /^Top Skills:/i.test(line)) ?? "";

    rows.push({
      source: "builtin.com",
      position: rows.length + 1,
      title,
      postedAgo: normalizePostedAgo(cardText),
      applyUrl: detailUrl,
      detailUrl,
      workModel,
      location: locationNearIcon(card, workModel) || locationFromLines(cardLines, workModel),
      company,
      salary: salaryFromText(cardText),
      companySize: null,
      industry: industryFromLines(cardLines),
      qualifications: [topSkillsLine, cardText].filter(Boolean).join("\n").slice(0, 3000),
      h1bSponsored: sponsorshipSupport === "yes",
      sponsorshipSupport,
      confirmedSponsorshipSupport: "unknown",
      requiresActiveSecurityClearance: clearance,
      confirmedRequiresActiveSecurityClearance: false,
      isNewGrad: isEarlyCareer(title, cardText),
    });
  }

  return rows;
}

export async function extractBuiltInDetail(): Promise<BuiltInDetail> {
  await new Promise((resolve) => setTimeout(resolve, 500));

  const MAX_DESC_CHARS = 20000;

  function text(el: Element | null | undefined): string {
    if (!el) return "";
    return ((el as HTMLElement).innerText ?? el.textContent ?? "").trim();
  }

  function compact(value: string): string {
    return value.replace(/\u00a0/g, " ").replace(/[ \t]+/g, " ").trim();
  }

  function bodyText(): string {
    const main = document.querySelector("main") ?? document.body;
    return text(main);
  }

  function lines(value: string): string[] {
    return value
      .split(/\r?\n/)
      .map((line) => compact(line))
      .filter(Boolean);
  }

  function absoluteUrl(value: string | null | undefined): string {
    if (!value) return "";
    try {
      const url = new URL(value, window.location.href);
      url.hash = "";
      return url.toString();
    } catch {
      return "";
    }
  }

  function titleFromPage(): string {
    const h1 = compact(text(document.querySelector("h1")));
    if (h1) return h1;
    return compact(document.title.replace(/\s*\|\s*Built In.*$/i, "").replace(/\s+-\s+.*$/i, ""));
  }

  function companyFromPage(title: string): string {
    const companyAnchor = Array.from(document.querySelectorAll<HTMLAnchorElement>("a[href]"))
      .find((anchor) => /\/compan(?:y|ies)\//i.test(anchor.href || anchor.getAttribute("href") || ""));
    const anchorText = compact(text(companyAnchor));
    if (anchorText && anchorText.toLowerCase() !== title.toLowerCase()) return anchorText;

    const titleParts = document.title.split(/\s+-\s+/);
    if (titleParts.length >= 2) {
      const maybeCompany = compact((titleParts[1] ?? "").replace(/\s*\|\s*Built In.*$/i, ""));
      if (maybeCompany) return maybeCompany;
    }
    return "";
  }

  function salaryFromText(value: string): string | null {
    const match = compact(value).match(
      /\$?\d+(?:,\d{3})?(?:\.\d+)?\s*[Kk]?\s*-\s*\$?\d+(?:,\d{3})?(?:\.\d+)?\s*[Kk]?\s+(?:Annually|Yearly|Hourly|Monthly)\b/i,
    );
    return match ? compact(match[0]) : null;
  }

  function workModelFromText(value: string): string | null {
    if (/\bRemote or Hybrid\b/i.test(value)) return "Remote or Hybrid";
    if (/\bHybrid\b/i.test(value)) return "Hybrid";
    if (/\bRemote\b/i.test(value)) return "Remote";
    if (/\bIn-Office\b/i.test(value)) return "In-Office";
    if (/\b(On-site|Onsite)\b/i.test(value)) return "On-site";
    return null;
  }

  function seniorityFromText(value: string): string | null {
    const match = value.match(/\b(Entry level|Junior|Mid level|Senior level|Expert\/Leader|Internship)\b/i);
    return match ? compact(match[1] ?? "") : null;
  }

  function employmentTypeFromText(value: string): string | null {
    const match = value.match(/\b(Full[- ]time|Part[- ]time|Contract|Temporary|Internship)\b/i);
    return match ? compact(match[1] ?? "").replace(" ", "-") : null;
  }

  function isLocationLine(line: string, workModel: string | null): boolean {
    if (workModel && line.toLowerCase() === workModel.toLowerCase()) return false;
    if (/^HQ:/i.test(line)) return false;
    if (/\b\d+\s+Locations\b/i.test(line)) return true;
    if (/\b(?:USA|CAN|GBR|IND|IRL|AUS|SGP|KOR|ISR|DEU|FRA|MEX|ZAF|AUT|POL|PRT|TUR)\b$/i.test(line)) return true;
    if (/\b[A-Z][a-z]+(?: [A-Z][a-z]+)*,\s*[A-Z]{2}\b/.test(line)) return true;
    if (/\bUSA\b/i.test(line)) return true;
    if (/Hiring Remotely/i.test(line)) return true;
    return false;
  }

  function locationNearIcon(workModel: string | null): string {
    const icons = Array.from(document.querySelectorAll<Element>("i, svg, [class]"))
      .filter((element) => /\b(?:fa-)?location-dot\b/i.test(String(element.getAttribute("class") ?? "")));
    for (const icon of icons) {
      let current = icon.parentElement;
      for (let depth = 0; current && depth < 5; depth++) {
        const candidate = lines(text(current)).find((line) => isLocationLine(line, workModel));
        if (candidate) return candidate;
        current = current.parentElement;
      }
    }
    return "";
  }

  function locationFromLines(pageLines: string[], workModel: string | null): string {
    for (const line of pageLines) {
      if (isLocationLine(line, workModel)) return line;
    }
    return "";
  }

  function parseSponsorshipStatus(value: string): "yes" | "no" | "unknown" {
    const normalized = value.toLowerCase().replace(/\s+/g, " ");
    const negative = [
      "no sponsorship",
      "without sponsorship",
      "unable to sponsor",
      "cannot sponsor",
      "can't sponsor",
      "will not sponsor",
      "does not provide sponsorship",
      "sponsorship not available",
      "must be authorized to work without sponsorship",
    ];
    if (negative.some((signal) => normalized.includes(signal))) return "no";
    const positive = [
      "visa sponsorship available",
      "sponsorship available",
      "will sponsor",
      "immigration support",
    ];
    if (positive.some((signal) => normalized.includes(signal))) return "yes";
    return "unknown";
  }

  function requiresActiveClearance(value: string): boolean {
    const normalized = value.toLowerCase().replace(/\s+/g, " ");
    if (!/(security clearance|secret clearance|top secret|ts\/sci|sci clearance)/.test(normalized)) return false;
    if (/\b(ability to obtain|eligible to obtain|obtain and maintain|preferred|nice to have)\b/.test(normalized)) {
      return false;
    }
    return true;
  }

  function extractTopSkills(value: string): string[] {
    const found = new Set<string>();
    const pageLines = lines(value);
    for (let i = 0; i < pageLines.length; i++) {
      const line = pageLines[i] ?? "";
      if (/^Top Skills:?/i.test(line)) {
        const inline = line.replace(/^Top Skills:?\s*/i, "");
        for (const part of inline.split(/[,•|]/)) {
          const skill = compact(part);
          if (skill && skill.length <= 40) found.add(skill);
        }
        const next = pageLines[i + 1] ?? "";
        if (next && !/^(Posted|Apply|Responsibilities|Requirements|About)/i.test(next)) {
          for (const part of next.split(/[,•|]/)) {
            const skill = compact(part);
            if (skill && skill.length <= 40) found.add(skill);
          }
        }
      }
    }
    return Array.from(found).slice(0, 30);
  }

  function isHeading(line: string): boolean {
    return (
      line.length <= 80 &&
      /^(About|The Role|Responsibilities|Requirements|Qualifications|What You|You Will|Who You|Minimum|Preferred|Benefits|Compensation|Equal Opportunity|Apply)/i.test(line)
    );
  }

  function extractSectionItems(value: string, headings: RegExp[], maxItems: number): string[] {
    const pageLines = lines(value);
    const items: string[] = [];
    let active = false;
    for (const line of pageLines) {
      if (headings.some((heading) => heading.test(line))) {
        active = true;
        continue;
      }
      if (active && isHeading(line)) break;
      if (!active) continue;
      const cleaned = compact(line.replace(/^[-*•]\s*/, ""));
      if (cleaned.length < 12 || cleaned.length > 400) continue;
      if (/^(Apply|Saved|Share|Back to jobs)$/i.test(cleaned)) continue;
      items.push(cleaned);
      if (items.length >= maxItems) break;
    }
    return Array.from(new Set(items));
  }

  function hasDescriptionSignal(value: string): boolean {
    return /\b(job description|responsibilities|requirements|qualifications|minimum qualifications|preferred qualifications|what you(?:'ll| will) do|about the role|about this role|you will|what you bring|who you are)\b/i
      .test(value);
  }

  function looksLikeBuiltInShell(value: string): boolean {
    const normalized = value.toLowerCase().replace(/\s+/g, " ");
    return normalized.includes("built in") &&
      normalized.includes("search jobs") &&
      normalized.includes("post a job");
  }

  function structuredDescriptionFromSections(
    requirements: readonly string[],
    responsibilities: readonly string[],
  ): string {
    return [
      requirements.length > 0
        ? ["Requirements", ...requirements.map((item) => `- ${item}`)].join("\n")
        : "",
      responsibilities.length > 0
        ? ["Responsibilities", ...responsibilities.map((item) => `- ${item}`)].join("\n")
        : "",
    ].filter(Boolean).join("\n\n");
  }

  function selectDescription(
    rawDescription: string,
    requirements: readonly string[],
    responsibilities: readonly string[],
  ): string {
    const structured = structuredDescriptionFromSections(requirements, responsibilities);
    if (structured && looksLikeBuiltInShell(rawDescription)) return structured;
    if (rawDescription.length < 250 && structured) return structured;
    if (rawDescription && hasDescriptionSignal(rawDescription)) return rawDescription;
    return structured || rawDescription;
  }

  function industriesFromText(value: string): string[] {
    const industryLine = lines(value).find((line) => line.includes("•") && line.length <= 180 && !/^Top Skills/i.test(line));
    if (!industryLine) return [];
    return industryLine.split("•").map((part) => compact(part)).filter(Boolean).slice(0, 16);
  }

  function addCandidate(set: Set<string>, value: string | null | undefined): void {
    const url = absoluteUrl(value);
    if (!url) return;
    try {
      const parsed = new URL(url);
      if (!/^https?:$/.test(parsed.protocol)) return;
      set.add(parsed.toString());
    } catch {
      return;
    }
  }

  function scoreUrlCandidate(candidate: string): number {
    try {
      const parsed = new URL(candidate);
      const host = parsed.hostname.toLowerCase();
      const path = parsed.pathname.toLowerCase();
      const full = `${host}${path}${parsed.search.toLowerCase()}`;
      const atsHosts = [
        "greenhouse",
        "ashbyhq.com",
        "lever.co",
        "workdayjobs.com",
        "myworkdayjobs.com",
        "smartrecruiters.com",
        "jobvite.com",
        "icims.com",
      ];
      const noiseHosts = [
        "linkedin.com",
        "facebook.com",
        "instagram.com",
        "x.com",
        "twitter.com",
        "youtube.com",
        "builtin.com/company",
      ];
      const applyHints = [
        "/apply",
        "/job",
        "/jobs",
        "/career",
        "/careers",
        "/position",
        "/positions",
        "jobid",
        "job_id",
        "requisition",
        "req_id",
      ];

      if (noiseHosts.some((pattern) => full.includes(pattern))) return -100;
      let score = 0;
      if (atsHosts.some((pattern) => host.includes(pattern))) score += 100;
      if (applyHints.some((pattern) => full.includes(pattern))) score += 24;
      if (/\b(apply|job|jobs|career|careers|position|opening|opportunit)\b/.test(full)) score += 12;
      if (host === "builtin.com" || host.endsWith(".builtin.com")) {
        score += 8;
        if (path.startsWith("/job/")) score += 25;
        if (path === "/jobs") score -= 20;
      } else {
        score += 40;
      }
      if (candidate === absoluteUrl(window.location.href)) score += 20;
      return score;
    } catch {
      return Number.NEGATIVE_INFINITY;
    }
  }

  function pickBestUrl(candidates: Iterable<string>): string {
    let best = "";
    let bestScore = Number.NEGATIVE_INFINITY;
    for (const candidate of candidates) {
      const score = scoreUrlCandidate(candidate);
      if (score > bestScore) {
        best = candidate;
        bestScore = score;
      }
    }
    return best;
  }

  function collectApplyUrls(): string[] {
    const urls = new Set<string>();
    for (const element of Array.from(document.querySelectorAll<HTMLElement>("a[href], form[action], [data-url], [data-href], [data-apply-url]"))) {
      const label = compact(text(element)).toLowerCase();
      if (
        label.includes("apply") ||
        label.includes("job") ||
        label.includes("career") ||
        element instanceof HTMLFormElement
      ) {
        addCandidate(urls, (element as HTMLAnchorElement).href);
        if (element instanceof HTMLFormElement) addCandidate(urls, element.action);
        addCandidate(urls, element.dataset.url);
        addCandidate(urls, element.dataset.href);
        addCandidate(urls, element.dataset.applyUrl);
      }
    }
    addCandidate(urls, window.location.href);
    return Array.from(urls);
  }

  const rawText = bodyText();
  const pageLines = lines(rawText);
  const title = titleFromPage();
  const company = companyFromPage(title);
  const workModel = workModelFromText(rawText);
  const applyCandidates = collectApplyUrls();
  const bestApplyUrl = pickBestUrl(applyCandidates) || window.location.href;
  const sponsorshipSupport = parseSponsorshipStatus(rawText);
  const clearance = requiresActiveClearance(rawText);
  const responsibilities = extractSectionItems(rawText, [
    /^Responsibilities\b/i,
    /^What You'll Do\b/i,
    /^What You Will Do\b/i,
    /^You Will\b/i,
    /^In This Role\b/i,
  ], 12);
  const requiredQualifications = extractSectionItems(rawText, [
    /^Requirements\b/i,
    /^Qualifications\b/i,
    /^Minimum Qualifications\b/i,
    /^Preferred Qualifications\b/i,
    /^You'll Be a Good Fit If\b/i,
    /^What You Bring\b/i,
    /^About You\b/i,
  ], 12);

  return {
    position: 1,
    title,
    company,
    location: locationNearIcon(workModel) || locationFromLines(pageLines, workModel),
    employmentType: employmentTypeFromText(rawText),
    workModel,
    seniorityLevel: seniorityFromText(rawText),
    salaryRange: salaryFromText(rawText),
    matchScore: null,
    expLevelMatch: null,
    skillMatch: null,
    industryExpMatch: null,
    description: selectDescription(compact(rawText), requiredQualifications, responsibilities).slice(0, MAX_DESC_CHARS),
    industries: industriesFromText(rawText),
    recommendationTags: [],
    responsibilities,
    requiredQualifications,
    skillTags: extractTopSkills(rawText),
    taxonomy: [],
    companyWebsite: null,
    companyDescription: null,
    companySize: null,
    companyLocation: null,
    companyFoundedYear: null,
    companyCategories: industriesFromText(rawText),
    h1bSponsorLikely: sponsorshipSupport === "yes" ? true : sponsorshipSupport === "no" ? false : null,
    sponsorshipSupport,
    h1bSponsorshipHistory: [],
    requiresActiveSecurityClearance: clearance,
    confirmedSponsorshipSupport: "unknown",
    confirmedRequiresActiveSecurityClearance: false,
    insiderConnections: null,
    originalPostUrl: bestApplyUrl,
    applyNowUrl: bestApplyUrl,
    applyFlowUrls: applyCandidates.filter((url) => url !== bestApplyUrl).slice(0, 12),
  };
}
