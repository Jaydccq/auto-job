/**
 * DOM extractors for LinkedIn Jobs search and detail pages.
 *
 * Exported functions are self-contained so they can be stringified and executed
 * through bb-browser eval. They only read page state; they never click Apply,
 * Save, Dismiss, message, or other mutating controls.
 */

export interface LinkedInRow {
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

export interface LinkedInDetail {
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
  confirmedSponsorshipSupport: "yes" | "no" | "unknown";
  h1bSponsorshipHistory: readonly { year: string; count: number }[];
  requiresActiveSecurityClearance: boolean;
  confirmedRequiresActiveSecurityClearance: boolean;
  insiderConnections: number | null;
  originalPostUrl: string;
  applyNowUrl: string;
  applyFlowUrls: readonly string[];
}

export async function extractLinkedInList(): Promise<LinkedInRow[]> {
  function text(el: Element | null | undefined): string {
    if (!el) return "";
    return ((el as HTMLElement).innerText ?? el.textContent ?? "").trim();
  }

  function compact(value: string): string {
    return value.replace(/\u00a0/g, " ").replace(/[ \t]+/g, " ").trim();
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

  function linkedInJobId(value: string | null | undefined): string {
    const raw = value?.trim();
    if (!raw) return "";
    if (/^\d+$/.test(raw)) return raw;
    try {
      const parsed = new URL(raw, window.location.href);
      const currentJobId = parsed.searchParams.get("currentJobId");
      if (currentJobId && /^\d+$/.test(currentJobId)) return currentJobId;
      const pathMatch = parsed.pathname.match(/\/jobs\/view\/(\d+)(?:\/|$)/i);
      if (pathMatch?.[1]) return pathMatch[1];
    } catch {
      // Fall through to raw-pattern extraction.
    }
    return raw.match(/\/jobs\/view\/(\d+)(?:[/?#]|$)/i)?.[1] ?? "";
  }

  function canonicalJobUrl(jobId: string): string {
    return `https://www.linkedin.com/jobs/view/${jobId}/`;
  }

  function normalizePostedAgo(value: string): string {
    const normalized = compact(value).replace(/^posted\s+/i, "");
    if (/\b(just now|today|moments ago|a moment ago)\b/i.test(normalized)) return "today";
    if (/\b(?:reposted\s+)?an?\s+minute\s+ago\b/i.test(normalized)) return "1 minute ago";
    if (/\b(?:reposted\s+)?an?\s+hour\s+ago\b/i.test(normalized)) return "1 hour ago";
    if (/\byesterday\b/i.test(normalized)) return "1 day ago";
    const match = normalized.match(
      /\b(?:reposted\s+)?(\d+)\s*(minutes?|mins?|hours?|hrs?|days?|weeks?|months?)\s+ago\b/i,
    );
    if (!match) return "";
    const amount = Number(match[1]);
    const unit = (match[2] ?? "").toLowerCase();
    if (unit.startsWith("min")) return `${amount} minute${amount === 1 ? "" : "s"} ago`;
    if (unit.startsWith("hr") || unit.startsWith("hour")) return `${amount} hour${amount === 1 ? "" : "s"} ago`;
    if (unit.startsWith("day")) return `${amount} day${amount === 1 ? "" : "s"} ago`;
    if (unit.startsWith("week")) return `${amount} week${amount === 1 ? "" : "s"} ago`;
    if (unit.startsWith("month")) return `${amount} month${amount === 1 ? "" : "s"} ago`;
    return "";
  }

  function workModelFromText(value: string): string {
    if (/\bremote\b/i.test(value)) return "Remote";
    if (/\bhybrid\b/i.test(value)) return "Hybrid";
    if (/\b(on-site|onsite)\b/i.test(value)) return "On-site";
    return "";
  }

  function salaryFromText(value: string): string | null {
    const match = compact(value).match(
      /\$\s?\d{2,3}(?:,\d{3})?(?:\.\d+)?\s*(?:k|K)?\s*(?:\/\s?(?:yr|year|hr|hour))?\s*[-–]\s*\$\s?\d{2,3}(?:,\d{3})?(?:\.\d+)?\s*(?:k|K)?(?:\s*\/\s?(?:yr|year|hr|hour))?/i,
    );
    return match?.[0] ? compact(match[0]) : null;
  }

  function requiresActiveClearance(value: string): boolean {
    const normalized = compact(value).toLowerCase();
    if (!/(security clearance|secret clearance|top secret|ts\/sci|sci clearance)/.test(normalized)) return false;
    if (/\b(ability to obtain|eligible to obtain|obtain and maintain|preferred|nice to have|public trust)\b/.test(normalized)) {
      return false;
    }
    return true;
  }

  function sponsorshipStatus(value: string): "yes" | "no" | "unknown" {
    const normalized = compact(value).toLowerCase();
    if (
      normalized.includes("no sponsorship") ||
      normalized.includes("without sponsorship") ||
      normalized.includes("unable to sponsor") ||
      normalized.includes("cannot sponsor") ||
      normalized.includes("will not sponsor") ||
      normalized.includes("sponsorship not available")
    ) {
      return "no";
    }
    if (
      normalized.includes("visa sponsorship available") ||
      normalized.includes("sponsorship available") ||
      normalized.includes("will sponsor") ||
      normalized.includes("immigration support")
    ) {
      return "yes";
    }
    return "unknown";
  }

  function isEarlyCareer(title: string, value: string): boolean {
    return /\b(new grad|new graduate|graduate|university grad|entry level|early career|junior|associate|software engineer i)\b/i
      .test(`${title}\n${value}`);
  }

  function isLocationLine(line: string, workModel: string): boolean {
    if (!line || line.length > 140) return false;
    if (/^(promoted|viewed|easy apply|apply|be an early applicant|actively recruiting)$/i.test(line)) return false;
    if (normalizePostedAgo(line)) return false;
    if (workModel && line.toLowerCase() === workModel.toLowerCase()) return true;
    if (/\b(remote|hybrid|on-site|onsite)\b/i.test(line)) return true;
    if (/\b[A-Z][a-z]+(?: [A-Z][a-z]+)*,\s*[A-Z]{2}\b/.test(line)) return true;
    if (/\bUnited States\b/i.test(line)) return true;
    return /\b\d+\s+locations?\b/i.test(line);
  }

  function cleanTitleFromDismiss(card: Element): string {
    const dismiss = Array.from(card.querySelectorAll<HTMLButtonElement>("button[aria-label]"))
      .find((button) => /^dismiss .+ job$/i.test(button.getAttribute("aria-label") ?? ""));
    const label = dismiss?.getAttribute("aria-label") ?? "";
    return compact(label.replace(/^dismiss\s+/i, "").replace(/\s+job$/i, ""));
  }

  function titleFromCard(card: Element, cardLines: string[]): string {
    const dismissedTitle = cleanTitleFromDismiss(card);
    if (dismissedTitle) return dismissedTitle;

    const anchors = Array.from(card.querySelectorAll<HTMLAnchorElement>("a[href*='/jobs/view/'], a[href*='/jobs/search-results/']"));
    const anchorTitle = anchors
      .flatMap((anchor) => lines(text(anchor)))
      .map(normalizeTitleLine)
      .find((label) => label.length > 1 && label.length <= 180 && !/\b(view|apply|company)\b/i.test(label));
    if (anchorTitle) return anchorTitle;

    return normalizeTitleLine(cardLines.find((line) => line.length > 1 && line.length <= 180) ?? "");
  }

  function normalizeTitleLine(line: string): string {
    return compact(line.replace(/\s+with verification$/i, ""));
  }

  function companyFromLines(cardLines: string[], title: string, location: string, postedAgo: string): string {
    const titleKey = title.toLowerCase();
    for (const line of cardLines) {
      const normalized = normalizeTitleLine(line).toLowerCase();
      if (normalized === titleKey) continue;
      if (normalized === `${titleKey} with verification` || /\swith verification$/i.test(line)) continue;
      if (line === location || line === postedAgo) continue;
      if (normalizePostedAgo(line)) continue;
      if (isLocationLine(line, "")) continue;
      if (/^(promoted|viewed|easy apply|apply|be an early applicant|actively recruiting|alumni)$/i.test(line)) continue;
      if (/\b(applicants?|connections?|employees?|followers?|alumni|benefits?)\b/i.test(line)) continue;
      if (line.length > 100) continue;
      return line;
    }
    return "";
  }

  const searchIsLastDay = new URLSearchParams(window.location.search).get("f_TPR") === "r86400";

  function rowFromCard(card: HTMLElement): LinkedInRow | null {
    const jobId = linkedInJobId(card.getAttribute("data-job-id")) ||
      Array.from(card.querySelectorAll<HTMLAnchorElement>("a[href]"))
        .map((anchor) => linkedInJobId(anchor.href || anchor.getAttribute("href")))
        .find(Boolean) ||
        "";
    if (!jobId) return null;

    const cardText = text(card);
    const cardLines = lines(cardText);
    const title = titleFromCard(card, cardLines);
    const workModel = workModelFromText(cardText);
    const location = cardLines.find((line) => isLocationLine(line, workModel)) ?? "";
    const postedAgo = normalizePostedAgo(cardText) || (searchIsLastDay ? "today" : "unknown");
    const company = companyFromLines(cardLines, title, location, postedAgo);
    const detailUrl = canonicalJobUrl(jobId);
    const applyUrl = detailUrl;
    const sponsorship = sponsorshipStatus(cardText);

    if (!title || !company) return null;

    return {
      source: "linkedin.com",
      position: 0,
      title,
      postedAgo,
      applyUrl,
      detailUrl,
      workModel,
      location,
      company,
      salary: salaryFromText(cardText),
      companySize: null,
      industry: null,
      qualifications: cardText.slice(0, 4000),
      h1bSponsored: sponsorship === "yes",
      sponsorshipSupport: sponsorship,
      confirmedSponsorshipSupport: "unknown",
      requiresActiveSecurityClearance: requiresActiveClearance(cardText),
      confirmedRequiresActiveSecurityClearance: false,
      isNewGrad: isEarlyCareer(title, cardText),
    };
  }

  function currentJobIdFromPage(): string {
    return linkedInJobId(window.location.href) ||
      Array.from(document.querySelectorAll<HTMLAnchorElement>("a[href*='/jobs/view/']"))
        .map((anchor) => linkedInJobId(anchor.href || anchor.getAttribute("href")))
        .find(Boolean) ||
      "";
  }

  function selectedTitleFromPage(jobId: string, bodyLines: string[]): string {
    const titleAnchor = Array.from(document.querySelectorAll<HTMLAnchorElement>("a[href*='/jobs/view/']"))
      .find((anchor) => linkedInJobId(anchor.href || anchor.getAttribute("href")) === jobId);
    const anchorTitle = compact(text(titleAnchor));
    if (anchorTitle) return anchorTitle;

    const titleMatch = document.title.match(/^(.+?)\s+\|\s+.+?\s+\|\s+LinkedIn$/i);
    const titleFromDocument = compact(titleMatch?.[1] ?? "");
    if (titleFromDocument) return titleFromDocument;

    return bodyLines.find((line) => line.length > 10 && line.length <= 180) ?? "";
  }

  function selectedCompanyFromPage(title: string, titleIndex: number, bodyLines: string[]): string {
    if (titleIndex >= 0) {
      for (const line of bodyLines.slice(titleIndex + 1, titleIndex + 5)) {
        if (!line || line === title) continue;
        if (isLocationLine(line, "")) continue;
        if (/\b(alumni|applicant|posted|saved|apply)\b/i.test(line)) continue;
        return line;
      }
    }

    const titleMatch = document.title.match(/^.+?\s+\|\s+(.+?)\s+\|\s+LinkedIn$/i);
    return compact(titleMatch?.[1] ?? "");
  }

  function selectedJobBlockFromLines(titleIndex: number, bodyLines: string[], fallbackText: string): string {
    if (titleIndex < 0) return fallbackText.slice(0, 2000);

    const maxEnd = Math.min(bodyLines.length, titleIndex + 18);
    const postedIndex = bodyLines
      .slice(titleIndex + 1, maxEnd)
      .findIndex((line) => /^posted\s+/i.test(line));

    if (postedIndex >= 0) {
      const absolutePostedIndex = titleIndex + 1 + postedIndex;
      const nextLine = bodyLines[absolutePostedIndex + 1] ?? "";
      const end = normalizePostedAgo(nextLine)
        ? absolutePostedIndex + 2
        : absolutePostedIndex + 1;
      return bodyLines.slice(titleIndex, Math.min(end, maxEnd)).join("\n");
    }

    return bodyLines.slice(titleIndex, Math.min(bodyLines.length, titleIndex + 10)).join("\n");
  }

  function rowFromSelectedJobText(): LinkedInRow | null {
    const jobId = currentJobIdFromPage();
    if (!jobId) return null;

    const bodyText = text(document.body);
    const bodyLines = lines(bodyText);
    const title = selectedTitleFromPage(jobId, bodyLines);
    if (!title) return null;

    const titleIndex = bodyLines.findIndex((line) => line === title);
    const company = selectedCompanyFromPage(title, titleIndex, bodyLines);
    if (!company) return null;

    const localBlock = selectedJobBlockFromLines(titleIndex, bodyLines, bodyText);
    const location = bodyLines.slice(Math.max(titleIndex + 2, 0), Math.max(titleIndex + 12, 12))
      .find((line) => isLocationLine(line, "")) ?? "";
    const workModel = workModelFromText(location || localBlock);
    const sponsorship = sponsorshipStatus(localBlock);

    return {
      source: "linkedin.com",
      position: 1,
      title,
      postedAgo: normalizePostedAgo(localBlock) || normalizePostedAgo(bodyText) || "unknown",
      applyUrl: canonicalJobUrl(jobId),
      detailUrl: canonicalJobUrl(jobId),
      workModel,
      location,
      company,
      salary: salaryFromText(localBlock),
      companySize: null,
      industry: null,
      qualifications: localBlock.slice(0, 4000),
      h1bSponsored: sponsorship === "yes",
      sponsorshipSupport: sponsorship,
      confirmedSponsorshipSupport: "unknown",
      requiresActiveSecurityClearance: requiresActiveClearance(localBlock),
      confirmedRequiresActiveSecurityClearance: false,
      isNewGrad: isEarlyCareer(title, localBlock),
    };
  }

  function extractVisibleRows(root: ParentNode = document): LinkedInRow[] {
    const seenIds = new Set<string>();
    const rows: LinkedInRow[] = [];
    const cards = Array.from(root.querySelectorAll<HTMLElement>("[data-job-id]"));

    for (const card of cards) {
      const row = rowFromCard(card);
      if (!row) continue;
      const key = row.detailUrl.toLowerCase();
      if (seenIds.has(key)) continue;
      seenIds.add(key);
      rows.push({ ...row, position: rows.length + 1 });
    }

    if (rows.length === 0) {
      const selectedRow = rowFromSelectedJobText();
      if (selectedRow) rows.push(selectedRow);
    }

    return rows;
  }

  return extractVisibleRows();
}

export async function extractLinkedInDetail(): Promise<LinkedInDetail> {
  await new Promise((resolve) => window.setTimeout(resolve, 600));

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

  function firstText(...selectors: string[]): string {
    for (const selector of selectors) {
      const value = compact(text(document.querySelector(selector)));
      if (value) return value;
    }
    return "";
  }

  async function expandJobDescription(): Promise<void> {
    async function wait(ms: number): Promise<void> {
      await new Promise((resolve) => window.setTimeout(resolve, ms));
    }

    async function scrollDetailPanes(): Promise<void> {
      const knownPanes = Array.from(document.querySelectorAll<HTMLElement>(
        "main, .jobs-search__job-details, .jobs-search__job-details--container, .jobs-details, .scaffold-layout__detail, .scaffold-layout__main",
      )).filter((node) => node.scrollHeight > node.clientHeight + 100);
      const documentTitle = compact(document.title.replace(/\s+\|\s+.*$/i, ""));
      const genericPanes = Array.from(document.querySelectorAll<HTMLElement>("main, section, article, div"))
        .filter((node) => node.scrollHeight > node.clientHeight + 100)
        .filter((node) => {
          const rect = node.getBoundingClientRect();
          if (rect.width < 280 || rect.height < 250) return false;
          const value = text(node);
          const hasCurrentTitle = Boolean(documentTitle && value.includes(documentTitle));
          const hasTopCardSignal = /\b(apply|saved|people clicked apply|assessing your job match)\b/i.test(value);
          const isRightSidePane = rect.left > window.innerWidth * 0.35;
          return (hasCurrentTitle && hasTopCardSignal) || isRightSidePane;
        });
      const seen = new Set<HTMLElement>();
      const panes = [...knownPanes, ...genericPanes]
        .filter((node) => {
          if (seen.has(node)) return false;
          seen.add(node);
          return true;
        })
        .sort((a, b) => b.getBoundingClientRect().left - a.getBoundingClientRect().left);

      for (const pane of panes.slice(0, 6)) {
        const originalTop = pane.scrollTop;
        for (const ratio of [0.25, 0.5, 0.75, 0.95]) {
          pane.scrollTop = Math.floor((pane.scrollHeight - pane.clientHeight) * ratio);
          pane.dispatchEvent(new Event("scroll", { bubbles: true }));
          await wait(350);
          if (/\babout the job\b|\brole summary\b|\bprimary responsibilities\b|\brequirements\b/i.test(text(pane))) {
            break;
          }
        }
        pane.scrollTop = originalTop;
        pane.dispatchEvent(new Event("scroll", { bubbles: true }));
      }
    }

    function isDescriptionLike(value: string): boolean {
      return /\babout the job\b|\bdescription\b|\brole summary\b|\bprimary responsibilities\b|\brequirements\b|\bqualifications\b/i
        .test(value);
    }

    function isFooterOrChrome(value: string): boolean {
      return linkedInChromeSignalCount(value) >= 3 && !isDescriptionLike(value);
    }

    async function waitForDescriptionSignals(): Promise<void> {
      const deadline = Date.now() + 5_000;
      while (Date.now() < deadline) {
        if (isDescriptionLike(text(document.body))) return;
        await scrollDetailPanes();
        await wait(900);
      }
    }

    await waitForDescriptionSignals();
    await scrollDetailPanes();

    const containers = Array.from(document.querySelectorAll<HTMLElement>(
      [
        ".jobs-description__content",
        ".jobs-box__html-content",
        ".jobs-description-content__text",
        ".jobs-description",
        ".jobs-description__container",
        ".description__text",
        ".show-more-less-html__markup",
        ".jobs-search__job-details",
        "main",
      ].join(", "),
    ));

    const descriptionContainers = containers.filter((node) => {
      const value = text(node);
      return isDescriptionLike(value) && !isFooterOrChrome(value);
    });

    function descriptionContextForButton(button: HTMLElement, boundary: HTMLElement): string {
      let node: HTMLElement | null = button.parentElement;
      let depth = 0;
      while (node && node !== document.body && depth < 8) {
        const value = text(node);
        if (isFooterOrChrome(value)) return "";
        if (isDescriptionLike(value)) return value;
        if (node === boundary) break;
        node = node.parentElement;
        depth += 1;
      }

      const boundaryText = text(boundary);
      return isDescriptionLike(boundaryText) && !isFooterOrChrome(boundaryText)
        ? boundaryText
        : "";
    }

    for (const container of descriptionContainers) {
      const buttons = Array.from(container.querySelectorAll<HTMLElement>(
        "button, [role='button'], a",
      ));
      const expandButton = buttons.find((button) => {
        const label = compact([
          button.getAttribute("aria-label") ?? "",
          button.getAttribute("title") ?? "",
          text(button),
        ].join(" "));
        if (!label) return false;
        if (/more options|show less|see less|collapse|try premium|post a job/i.test(label)) return false;
        if (!descriptionContextForButton(button, container)) return false;
        return /\b(show|see|read)\s+more\b|…\s*more|\.{3}\s*more|click to see more/i.test(label) ||
          label.toLowerCase() === "more";
      });
      if (!expandButton) continue;

      expandButton.scrollIntoView({ block: "center" });
      await wait(500);
      expandButton.click();
      await wait(900);
      return;
    }
  }

  function cleanDescriptionText(value: string): string {
    const stopPatterns = [
      /^looking for talent\?$/i,
      /^post a job$/i,
      /^accessibility$/i,
      /^talent solutions$/i,
      /^community guidelines$/i,
      /^privacy & terms$/i,
      /^ad choices$/i,
      /^advertising$/i,
      /^sales solutions$/i,
      /^linkedin corporation ©/i,
      /^questions\?$/i,
      /^manage your account and privacy$/i,
      /^recommendation transparency$/i,
      /^select language$/i,
      /^set alert for similar jobs/i,
      /^job search faster with premium/i,
      /^access company insights/i,
      /^millions of members use premium/i,
      /^about the company$/i,
      /^interested in working with us in the future/i,
      /^people also viewed$/i,
      /^similar jobs$/i,
      /^show more jobs$/i,
    ];
    const skipPatterns = [
      /^apply$/i,
      /^save$/i,
      /^use ai to assess how you fit$/i,
      /^promoted by hirer/i,
      /^responses managed off linkedin$/i,
      /^\d+\s+people clicked apply$/i,
      /^show more$/i,
      /^show less$/i,
    ];
    const seen = new Set<string>();
    const cleaned: string[] = [];

    for (const line of lines(value)) {
      if (stopPatterns.some((pattern) => pattern.test(line))) break;
      if (skipPatterns.some((pattern) => pattern.test(line))) continue;
      const key = line.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      cleaned.push(line);
    }

    return cleaned.join("\n").trim();
  }

  function descriptionSegment(value: string): string {
    const sourceLines = lines(value);
    const start = sourceLines.findIndex((line, index) => {
      if (/^about the job$/i.test(line)) return true;
      if (/^job description$/i.test(line)) return true;
      if (/^description$/i.test(line)) {
        const nearby = sourceLines.slice(index, index + 40).join("\n");
        return hasStrongJobDescriptionSignal(nearby) || hasWeakJobDescriptionSignal(nearby);
      }
      return /^(role summary|primary responsibilities|requirements)$/i.test(line);
    });
    if (start === -1) return value;

    const stopPatterns = [
      /^set alert for similar jobs/i,
      /^job search faster with premium/i,
      /^access company insights/i,
      /^millions of members use premium/i,
      /^try premium for/i,
      /^about the company$/i,
      /^interested in working with us in the future/i,
      /^people also viewed$/i,
      /^similar jobs$/i,
      /^show more jobs$/i,
      /^looking for talent\?$/i,
    ];
    const segment: string[] = [];

    for (const line of sourceLines.slice(start)) {
      if (segment.length >= 8 && stopPatterns.some((pattern) => pattern.test(line))) break;
      segment.push(line);
    }

    return segment.join("\n").trim();
  }

  function linkedInChromeSignalCount(value: string): number {
    const normalized = compact(value).toLowerCase();
    return [
      "looking for talent?",
      "post a job",
      "privacy & terms",
      "ad choices",
      "sales solutions",
      "linkedin corporation",
      "recommendation transparency",
      "select language",
    ].filter((signal) => normalized.includes(signal)).length;
  }

  function hasStrongJobDescriptionSignal(value: string): boolean {
    return /\b(job description|responsibilities|requirements|qualifications|basic qualifications|preferred qualifications|minimum qualifications|what you(?:'ll| will) do|about the role|about this role|you will|we are looking for|who you are|what you bring)\b/i
      .test(value);
  }

  function hasWeakJobDescriptionSignal(value: string): boolean {
    return /\b(build|design|develop|implement|maintain|collaborate|ship|own|support|optimize)\b/i.test(value) &&
      /\b(software|systems|services|platform|applications|models|data|machine learning|engineering|customers|product|team|experience|skills)\b/i.test(value);
  }

  function isLikelyJobDescription(value: string): boolean {
    const normalized = compact(value);
    if (normalized.length < 250) return false;
    if (linkedInChromeSignalCount(value) >= 3 && !hasStrongJobDescriptionSignal(value)) {
      return false;
    }
    return hasStrongJobDescriptionSignal(value) ||
      (normalized.length >= 650 && hasWeakJobDescriptionSignal(value));
  }

  function firstLikelyDescription(...selectors: string[]): string {
    for (const selector of selectors) {
      const raw = text(document.querySelector(selector));
      const candidates = Array.from(new Set([descriptionSegment(raw), raw]));
      for (const candidate of candidates) {
        const cleaned = cleanDescriptionText(candidate);
        if (cleaned && isLikelyJobDescription(cleaned)) return cleaned;
      }
    }
    return "";
  }

  function normalizeUrl(value: string | null | undefined): string {
    if (!value) return "";
    try {
      const parsed = new URL(value, window.location.href);
      if (!/^https?:$/.test(parsed.protocol)) return "";
      parsed.hash = "";
      return parsed.toString();
    } catch {
      return "";
    }
  }

  function jobIdFromUrl(value: string): string {
    if (/^\d+$/.test(value.trim())) return value.trim();
    try {
      const parsed = new URL(value, window.location.href);
      const currentJobId = parsed.searchParams.get("currentJobId");
      if (currentJobId && /^\d+$/.test(currentJobId)) return currentJobId;
      return parsed.pathname.match(/\/jobs\/view\/(\d+)(?:\/|$)/i)?.[1] ?? "";
    } catch {
      return value.match(/\/jobs\/view\/(\d+)(?:[/?#]|$)/i)?.[1] ?? "";
    }
  }

  function canonicalCurrentJobUrl(): string {
    const jobId = jobIdFromUrl(window.location.href);
    return jobId ? `https://www.linkedin.com/jobs/view/${jobId}/` : normalizeUrl(window.location.href);
  }

  function normalizePostedAgo(value: string): string {
    const normalized = compact(value).replace(/^posted\s+/i, "");
    if (/\b(just now|today|moments ago|a moment ago)\b/i.test(normalized)) return "today";
    if (/\b(?:reposted\s+)?an?\s+minute\s+ago\b/i.test(normalized)) return "1 minute ago";
    if (/\b(?:reposted\s+)?an?\s+hour\s+ago\b/i.test(normalized)) return "1 hour ago";
    if (/\byesterday\b/i.test(normalized)) return "1 day ago";
    const match = normalized.match(
      /\b(?:reposted\s+)?(\d+)\s*(minutes?|mins?|hours?|hrs?|days?|weeks?|months?)\s+ago\b/i,
    );
    if (!match) return "";
    const amount = Number(match[1]);
    const unit = (match[2] ?? "").toLowerCase();
    if (unit.startsWith("min")) return `${amount} minute${amount === 1 ? "" : "s"} ago`;
    if (unit.startsWith("hr") || unit.startsWith("hour")) return `${amount} hour${amount === 1 ? "" : "s"} ago`;
    if (unit.startsWith("day")) return `${amount} day${amount === 1 ? "" : "s"} ago`;
    if (unit.startsWith("week")) return `${amount} week${amount === 1 ? "" : "s"} ago`;
    if (unit.startsWith("month")) return `${amount} month${amount === 1 ? "" : "s"} ago`;
    return "";
  }

  function workModelFromText(value: string): string | null {
    if (/\bremote\b/i.test(value)) return "Remote";
    if (/\bhybrid\b/i.test(value)) return "Hybrid";
    if (/\b(on-site|onsite)\b/i.test(value)) return "On-site";
    return null;
  }

  function salaryFromText(value: string): string | null {
    const match = compact(value).match(
      /\$\s?\d{2,3}(?:,\d{3})?(?:\.\d+)?\s*(?:k|K)?\s*(?:\/\s?(?:yr|year|hr|hour))?\s*[-–]\s*\$\s?\d{2,3}(?:,\d{3})?(?:\.\d+)?\s*(?:k|K)?(?:\s*\/\s?(?:yr|year|hr|hour))?/i,
    );
    return match?.[0] ? compact(match[0]) : null;
  }

  function sponsorshipStatus(value: string): "yes" | "no" | "unknown" {
    const normalized = compact(value).toLowerCase();
    if (
      normalized.includes("no sponsorship") ||
      normalized.includes("without sponsorship") ||
      normalized.includes("unable to sponsor") ||
      normalized.includes("cannot sponsor") ||
      normalized.includes("will not sponsor") ||
      normalized.includes("sponsorship not available")
    ) {
      return "no";
    }
    if (
      normalized.includes("visa sponsorship available") ||
      normalized.includes("sponsorship available") ||
      normalized.includes("will sponsor") ||
      normalized.includes("immigration support")
    ) {
      return "yes";
    }
    return "unknown";
  }

  function requiresActiveClearance(value: string): boolean {
    const normalized = compact(value).toLowerCase();
    if (!/(security clearance|secret clearance|top secret|ts\/sci|sci clearance)/.test(normalized)) return false;
    if (/\b(ability to obtain|eligible to obtain|obtain and maintain|preferred|nice to have|public trust)\b/.test(normalized)) {
      return false;
    }
    return true;
  }

  function seniorityFromText(value: string): string | null {
    if (/\b(internship|intern)\b/i.test(value)) return "Internship";
    if (/\b(new grad|new graduate|entry level|early career|junior|associate|software engineer i)\b/i.test(value)) {
      return "Entry level";
    }
    if (/\bmid[-\s]?senior|senior|staff|principal|lead\b/i.test(value)) return "Senior";
    return null;
  }

  function sectionItems(source: string, headingPattern: RegExp): string[] {
    const sourceLines = lines(source);
    const start = sourceLines.findIndex((line) => headingPattern.test(line));
    if (start === -1) return [];

    const items: string[] = [];
    for (const line of sourceLines.slice(start + 1)) {
      if (/^(about|benefits|qualifications|requirements|responsibilities|skills|experience|what you|you will|who you are)$/i.test(line)) {
        if (items.length > 0) break;
        continue;
      }
      const cleaned = compact(line.replace(/^[-•*]\s*/, ""));
      if (cleaned.length < 20 || cleaned.length > 450) continue;
      items.push(cleaned);
      if (items.length >= 10) break;
    }
    return items;
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
    ];
    const normalized = value.toLowerCase();
    return skills.filter((skill) => normalized.includes(skill.toLowerCase())).slice(0, 14);
  }

  await expandJobDescription();

  const pageTitleMatch = document.title.match(/^(.+?)\s+\|\s+(.+?)\s+\|\s+LinkedIn$/i);
  const title = firstText("h1", ".job-details-jobs-unified-top-card__job-title", ".jobs-unified-top-card__job-title") ||
    compact(pageTitleMatch?.[1] ?? "");
  const company = firstText(
    ".job-details-jobs-unified-top-card__company-name a",
    ".job-details-jobs-unified-top-card__company-name",
    ".jobs-unified-top-card__company-name a",
    ".jobs-unified-top-card__company-name",
  ) || compact(pageTitleMatch?.[2] ?? "");
  const topCardText = firstText(
    ".job-details-jobs-unified-top-card",
    ".jobs-unified-top-card",
    ".jobs-search__job-details--container",
  );
  const description = firstLikelyDescription(
    ".jobs-description__content",
    ".jobs-box__html-content",
    ".jobs-description-content__text",
    ".jobs-description",
    ".jobs-description__container",
    ".description__text",
    ".show-more-less-html__markup",
    ".jobs-search__job-details",
    "main",
  ).slice(0, 20_000);
  const pageText = compact(document.body?.innerText ?? "");
  const detailUrl = canonicalCurrentJobUrl();
  const postedAgo = normalizePostedAgo(topCardText || pageText);
  const workModel = workModelFromText(`${topCardText}\n${description}`);
  const locationLine = lines(topCardText)
    .find((line) => /\b[A-Z][a-z]+(?: [A-Z][a-z]+)*,\s*[A-Z]{2}\b/.test(line) || /\bUnited States\b/i.test(line) || /\bRemote\b/i.test(line)) ?? "";
  const sponsorship = sponsorshipStatus(description || pageText);
  const requiresClearance = requiresActiveClearance(description || pageText);
  const requiredQualifications = sectionItems(description, /^(requirements|qualifications|basic qualifications|required qualifications|preferred qualifications|what you bring)$/i);
  const responsibilities = sectionItems(description, /^(primary responsibilities|responsibilities|what you will do|you will|about the role)$/i);

  return {
    position: 0,
    title,
    company,
    location: locationLine,
    employmentType: /\b(internship|intern)\b/i.test(`${title}\n${description}`) ? "Internship" : "Full-time",
    workModel,
    seniorityLevel: seniorityFromText(`${title}\n${description}`),
    salaryRange: salaryFromText(description || pageText),
    matchScore: null,
    expLevelMatch: null,
    skillMatch: null,
    industryExpMatch: null,
    description,
    industries: [],
    recommendationTags: postedAgo ? [postedAgo] : [],
    responsibilities,
    requiredQualifications,
    skillTags: skillTagsFromText(description || pageText),
    taxonomy: [],
    companyWebsite: null,
    companyDescription: null,
    companySize: null,
    companyLocation: null,
    companyFoundedYear: null,
    companyCategories: [],
    h1bSponsorLikely: null,
    sponsorshipSupport: sponsorship,
    confirmedSponsorshipSupport: sponsorship,
    h1bSponsorshipHistory: [],
    requiresActiveSecurityClearance: requiresClearance,
    confirmedRequiresActiveSecurityClearance: requiresClearance,
    insiderConnections: null,
    originalPostUrl: detailUrl,
    applyNowUrl: detailUrl,
    applyFlowUrls: [detailUrl],
  };
}
