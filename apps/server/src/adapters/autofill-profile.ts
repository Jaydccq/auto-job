import { existsSync, readFileSync } from "node:fs";
import { basename, join, resolve, sep } from "node:path";
import { parse } from "yaml";

import type { AutofillProfile, AutofillProfileField, AutofillFieldKind, AutofillResumeFile } from "@career-ops/shared";

type ProfileRecord = Record<string, unknown>;

const FIELD_ALIASES: Record<AutofillFieldKind, readonly string[]> = {
  fullName: ["full name", "legal name", "name"],
  title: ["title", "prefix", "salutation"],
  firstName: ["first name", "given name"],
  preferredName: ["preferred name", "nickname", "chosen name"],
  middleName: ["middle name", "middle initial"],
  lastName: ["last name", "preferred last name", "family name", "surname"],
  suffixName: ["suffix name", "name suffix", "suffix"],
  birthday: ["birthday", "birth date", "date of birth", "dob"],
  email: ["email", "email address", "e-mail"],
  phone: ["phone", "mobile", "telephone", "cell"],
  phoneCountryCode: ["country code", "phone country code", "dialing code", "calling code"],
  phoneNational: ["phone number", "mobile number", "telephone number", "cell number"],
  location: ["location", "current location", "located in today", "city and state", "city and state province", "city state", "address"],
  addressLine1: ["address line 1", "address 1", "street address", "address"],
  addressLine2: ["address line 2", "address 2", "apartment", "apt", "suite"],
  addressLine3: ["address line 3", "address 3"],
  city: ["city"],
  county: ["county"],
  state: ["state", "province", "region"],
  postalCode: ["postal code", "zip code", "zip", "postcode"],
  country: ["country"],
  linkedIn: ["linkedin", "linkedin url", "linkedin profile", "linkedin profile or website", "linkedin or website"],
  github: ["github", "github url", "github profile"],
  portfolio: ["portfolio", "website", "personal website", "portfolio url"],
  workAuthorization: ["work authorization", "authorized to work", "employment authorization", "work eligibility"],
  workAuthorizationUs: ["authorized to work in the us", "authorized to work in the united states", "us work authorization"],
  workAuthorizationCanada: ["authorized to work in canada", "canada work authorization"],
  workAuthorizationUk: ["authorized to work in the united kingdom", "authorized to work in the uk", "uk work authorization", "united kingdom work authorization"],
  sponsorship: ["sponsorship", "visa sponsorship", "require sponsorship", "need sponsorship"],
  jobSource: ["how did you hear about this job", "how did you hear about us", "job source", "source", "referral source"],
  willingToRelocate: ["willing to relocate", "relocate", "relocation"],
  desiredStartDate: ["desired start date", "available start date", "when can you start", "when is your desired start date", "how soon can you start", "start full time", "start full-time"],
  onsiteWork: ["able to work on site", "able to work onsite", "work on site", "work onsite", "on-site", "onsite"],
  age18: ["18 years of age", "at least 18", "eighteen years", "age"],
  currentVisaStatus: ["current visa status", "visa status", "immigration status", "current status"],
  futureVisaStatus: ["future visa status", "h1b", "h-1b", "future sponsorship status"],
  internalCandidate: ["internal", "internal candidate", "current employee"],
  disabilityStatus: ["disability", "voluntary self identification of disability"],
  raceEthnicity: ["race", "ethnicity", "ethnic", "hispanic", "asian"],
  lgbtqStatus: ["lgbtq", "lgbt", "identify as lgbtq", "sexual orientation"],
  gender: ["gender", "gender identity"],
  veteranStatus: ["veteran", "protected veteran", "veteran status", "are you a veteran"],
  currentSchool: ["school", "what school do you go to", "current school", "university"],
  expectedGraduationYear: ["expected graduation year", "graduation year", "grad year"],
  preferredWorkLocations: ["where would you like to work", "preferred work locations", "preferred locations", "location preferences"],
  preferredWorkLocation: ["where would you like to work", "preferred work location", "preferred location", "location preference"],
  resumeFile: ["resume", "cv", "curriculum vitae", "upload resume", "attach resume"],
  educationDegree: ["degree"],
  educationSchool: ["school", "university", "college", "institution"],
  educationStartMonth: ["start date", "start month", "from month"],
  educationStartYear: ["start date", "start year", "from year"],
  educationEndMonth: ["end date", "end month", "graduation month", "to month"],
  educationEndYear: ["end date", "end year", "graduation year", "to year"],
  educationCountry: ["country", "school country", "education country"],
  educationAreaOfStudy: ["area of study", "field of study", "major", "discipline"],
  experienceEmployer: ["employer name", "employer", "company", "organization"],
  experienceJobTitle: ["job title", "position title", "title"],
  experienceStartMonth: ["start date", "start month", "from month"],
  experienceStartYear: ["start date", "start year", "from year"],
  experienceEndMonth: ["end date", "end month", "to month"],
  experienceEndYear: ["end date", "end year", "to year"],
  experienceCurrentJob: ["current job", "currently work", "current position"],
  experienceCountry: ["employer country", "country"],
  experienceCity: ["employer city", "city"],
  experienceInternal: ["internal"],
  experienceAchievements: ["achievements", "responsibilities", "description", "summary"],
  desiredSalary: ["desired salary", "salary expectation", "expected compensation", "desired compensation", "compensation expectation"],
  minimumSalary: ["minimum salary", "minimum compensation", "walk away", "lowest salary"],
  skills: ["skills", "technical skills", "technologies", "programming languages"],
  school: ["school", "university", "college", "institution"],
  degree: ["degree", "major", "field of study", "education"],
  graduation: ["graduation", "graduation date", "expected graduation", "end date"],
};

export function readAutofillProfile(repoRoot: string, now = new Date()): AutofillProfile {
  const profilePath = join(repoRoot, "config/profile.yml");
  const cvPath = join(repoRoot, "cv.md");
  const warnings: string[] = [];
  const sources: string[] = [];
  const fields: AutofillProfileField[] = [];

  const profile = readYamlProfile(profilePath, warnings);
  if (profile) sources.push("config/profile.yml");

  const cvMarkdown = safeRead(cvPath);
  if (cvMarkdown) sources.push("cv.md");

  const candidate = objectAt(profile, "candidate");
  const address = objectAt(candidate, "address");
  const location = objectAt(profile, "location");
  const compensation = objectAt(profile, "compensation");
  const autofill = objectAt(profile, "autofill");
  const applicationQuestions = objectAt(autofill, "application_questions");
  const eeo = objectAt(autofill, "eeo");
  const firstEducation = extractFirstEducation(cvMarkdown);
  const skillSummary = extractSkillSummary(profile, cvMarkdown);
  const educationEntries = recordsAt(autofill, "education");
  const experienceEntries = recordsAt(autofill, "experience");
  const preferredWorkLocations = arrayAt(autofill, "preferred_work_locations");
  const resume = objectAt(autofill, "resume");

  addCandidateField(fields, candidate, "title", "title", "Title", false);
  addCandidateField(fields, candidate, "preferred_name", "preferredName", "Preferred name", false);
  addCandidateField(fields, candidate, "suffix_name", "suffixName", "Suffix name", false);
  addCandidateField(fields, candidate, "birthday", "birthday", "Birthday", true);

  const fullName = stringAt(candidate, "full_name") || extractMarkdownMeta(cvMarkdown, "name");
  if (fullName) {
    addField(fields, "fullName", "Full name", fullName, "config/profile.yml", 0.98);
    const parts = fullName.split(/\s+/).filter(Boolean);
    if (parts.length > 0) addField(fields, "firstName", "First name", parts[0]!, "derived", 0.92);
    if (parts.length > 2) addField(fields, "middleName", "Middle name", parts.slice(1, -1).join(" "), "derived", 0.72);
    if (parts.length > 1) addField(fields, "lastName", "Last name", parts.at(-1) ?? "", "derived", 0.9);
  }

  addCandidateField(fields, candidate, "phone_country_code", "phoneCountryCode", "Phone country code", true, (value) => value || phoneParts(stringAt(candidate, "phone")).countryCode);
  addCandidateField(fields, candidate, "phone_national", "phoneNational", "Phone number", true, (value) => nationalPhoneDigits(value || phoneParts(stringAt(candidate, "phone")).national));
  addCandidateField(fields, candidate, "email", "email", "Email", true);
  addCandidateField(fields, candidate, "phone", "phone", "Phone", true, normalizePhoneE164);
  addCandidateField(fields, candidate, "location", "location", "Location", false);
  addCandidateField(fields, candidate, "linkedin", "linkedIn", "LinkedIn", false, normalizeLinkedUrl);
  addCandidateField(fields, candidate, "github", "github", "GitHub", false, normalizeGithubUrl);
  addCandidateField(fields, candidate, "portfolio_url", "portfolio", "Portfolio", false);

  addStringField(fields, "addressLine1", "Address line 1", stringAt(address, "line1"), "config/profile.yml", 0.96, true);
  addStringField(fields, "addressLine2", "Address line 2", stringAt(address, "line2"), "config/profile.yml", 0.86, true);
  addStringField(fields, "addressLine3", "Address line 3", stringAt(address, "line3"), "config/profile.yml", 0.82, true);
  addStringField(fields, "city", "City", stringAt(address, "city") || stringAt(location, "city"), "config/profile.yml", 0.9);
  addStringField(fields, "county", "County", stringAt(address, "county"), "config/profile.yml", 0.88);
  addStringField(fields, "state", "State", stringAt(address, "state"), "config/profile.yml", 0.9);
  addStringField(fields, "postalCode", "Postal code", stringAt(address, "postal_code"), "config/profile.yml", 0.92, true);
  addStringField(fields, "country", "Country", stringAt(address, "country") || stringAt(location, "country"), "config/profile.yml", 0.9);
  addStringField(fields, "workAuthorization", "Work authorization", stringAt(applicationQuestions, "legally_authorized_to_work"), "config/profile.yml", 0.94);
  addStringField(fields, "workAuthorizationUs", "US work authorization", stringAt(applicationQuestions, "authorized_to_work_us"), "config/profile.yml", 0.94);
  addStringField(fields, "workAuthorizationCanada", "Canada work authorization", stringAt(applicationQuestions, "authorized_to_work_canada"), "config/profile.yml", 0.9);
  addStringField(fields, "workAuthorizationUk", "UK work authorization", stringAt(applicationQuestions, "authorized_to_work_uk"), "config/profile.yml", 0.9);
  addStringField(fields, "sponsorship", "Sponsorship", stringAt(applicationQuestions, "require_sponsorship") || sponsorshipAnswer(stringAt(location, "visa_status")), "config/profile.yml", 0.9);
  addStringField(fields, "jobSource", "Job source", stringAt(applicationQuestions, "heard_about_job"), "config/profile.yml", 0.84);
  addStringField(fields, "willingToRelocate", "Willing to relocate", stringAt(applicationQuestions, "willing_to_relocate"), "config/profile.yml", 0.84);
  addStringField(fields, "desiredStartDate", "Desired start date", stringAt(applicationQuestions, "desired_start_date"), "config/profile.yml", 0.82);
  addStringField(fields, "onsiteWork", "Able to work on-site", stringAt(applicationQuestions, "able_to_work_onsite"), "config/profile.yml", 0.84);
  addStringField(fields, "age18", "At least 18", stringAt(applicationQuestions, "age_18"), "config/profile.yml", 0.92);
  addStringField(fields, "currentVisaStatus", "Current visa status", stringAt(applicationQuestions, "current_visa_status") || stringAt(location, "current_visa_status"), "config/profile.yml", 0.86);
  addStringField(fields, "futureVisaStatus", "Future visa status", stringAt(applicationQuestions, "future_visa_status") || stringAt(location, "future_visa_status"), "config/profile.yml", 0.84);
  addStringField(fields, "internalCandidate", "Internal candidate", stringAt(applicationQuestions, "internal_candidate"), "config/profile.yml", 0.82);
  addStringField(fields, "disabilityStatus", "Disability status", stringAt(eeo, "disability_status"), "config/profile.yml", 0.82);
  addStringField(fields, "raceEthnicity", "Race/ethnicity", stringAt(eeo, "race_ethnicity"), "config/profile.yml", 0.8);
  addStringField(fields, "lgbtqStatus", "LGBTQ+ status", stringAt(eeo, "lgbtq_status"), "config/profile.yml", 0.78);
  addStringField(fields, "gender", "Gender", stringAt(eeo, "gender"), "config/profile.yml", 0.78);
  addStringField(fields, "veteranStatus", "Veteran status", stringAt(eeo, "veteran_status"), "config/profile.yml", 0.82);
  addStringField(fields, "currentSchool", "Current school", stringAt(applicationQuestions, "current_school") || stringAt(educationEntries.at(-1) ?? null, "school"), "config/profile.yml", 0.86);
  addStringField(fields, "expectedGraduationYear", "Expected graduation year", stringAt(applicationQuestions, "expected_graduation_year") || stringAt(educationEntries.at(-1) ?? null, "end_year"), "config/profile.yml", 0.86);
  addStringField(fields, "preferredWorkLocations", "Preferred work locations", preferredWorkLocations.join(", "), "config/profile.yml", 0.78);
  addStringField(fields, "resumeFile", "Resume", resumeFilename(repoRoot, stringAt(resume, "path")), "config/profile.yml", 0.92, true);
  addStringField(fields, "desiredSalary", "Desired salary", stringAt(compensation, "target_range"), "config/profile.yml", 0.76);
  addStringField(fields, "minimumSalary", "Minimum salary", stringAt(compensation, "minimum"), "config/profile.yml", 0.72);

  for (const [index, locationName] of preferredWorkLocations.entries()) {
    addField(fields, "preferredWorkLocation", `Preferred work location ${index + 1}`, locationName, "config/profile.yml", 0.8, false, "preferredWorkLocation", index);
  }

  for (const [index, entry] of educationEntries.entries()) {
    addEntryField(fields, entry, "degree", "educationDegree", "Education degree", index, "education", 0.9);
    addEntryField(fields, entry, "school", "educationSchool", "Education school", index, "education", 0.9);
    addEntryField(fields, entry, "start_month", "educationStartMonth", "Education start month", index, "education", 0.78);
    addEntryField(fields, entry, "start_year", "educationStartYear", "Education start year", index, "education", 0.78);
    addEntryField(fields, entry, "end_month", "educationEndMonth", "Education end month", index, "education", 0.84);
    addEntryField(fields, entry, "end_year", "educationEndYear", "Education end year", index, "education", 0.84);
    addEntryField(fields, entry, "country", "educationCountry", "Education country", index, "education", 0.78);
    addEntryField(fields, entry, "area_of_study", "educationAreaOfStudy", "Area of study", index, "education", 0.82);
  }

  for (const [index, entry] of experienceEntries.entries()) {
    addEntryField(fields, entry, "employer", "experienceEmployer", "Employer", index, "experience", 0.9);
    addEntryField(fields, entry, "job_title", "experienceJobTitle", "Job title", index, "experience", 0.88);
    addEntryField(fields, entry, "start_month", "experienceStartMonth", "Experience start month", index, "experience", 0.78);
    addEntryField(fields, entry, "start_year", "experienceStartYear", "Experience start year", index, "experience", 0.78);
    addEntryField(fields, entry, "end_month", "experienceEndMonth", "Experience end month", index, "experience", 0.82);
    addEntryField(fields, entry, "end_year", "experienceEndYear", "Experience end year", index, "experience", 0.82);
    addEntryField(fields, entry, "current_job", "experienceCurrentJob", "Current job", index, "experience", 0.82);
    addEntryField(fields, entry, "country", "experienceCountry", "Employer country", index, "experience", 0.78);
    addEntryField(fields, entry, "city", "experienceCity", "Employer city", index, "experience", 0.78);
    addEntryField(fields, entry, "internal", "experienceInternal", "Internal", index, "experience", 0.8);
    addEntryField(fields, entry, "achievements", "experienceAchievements", "Achievements", index, "experience", 0.76);
  }

  addStringField(fields, "skills", "Skills", skillSummary, skillSummary ? "cv.md" : "config/profile.yml", 0.74);
  addStringField(fields, "school", "School", firstEducation.school, "cv.md", 0.8);
  addStringField(fields, "degree", "Degree", firstEducation.degree, "cv.md", 0.78);
  addStringField(fields, "graduation", "Graduation", firstEducation.graduation, "cv.md", 0.72);

  if (!profile) warnings.push("config/profile.yml missing or unreadable");
  if (!cvMarkdown) warnings.push("cv.md missing or unreadable");
  if (fields.length === 0) warnings.push("no autofill fields could be assembled");

  return {
    generatedAt: now.toISOString(),
    fields,
    sources,
    warnings,
  };
}

export function readAutofillResume(repoRoot: string): AutofillResumeFile {
  const profilePath = join(repoRoot, "config/profile.yml");
  const warnings: string[] = [];
  const profile = readYamlProfile(profilePath, warnings);
  const resume = objectAt(objectAt(profile, "autofill"), "resume");
  const absolutePath = safeRepoPath(repoRoot, stringAt(resume, "path") || "docs/Hongxi_Chen_full_stack.pdf");
  const bytes = readFileSync(absolutePath);
  return {
    filename: basename(absolutePath),
    mimeType: "application/pdf",
    sizeBytes: bytes.byteLength,
    dataBase64: bytes.toString("base64"),
  };
}

function readYamlProfile(path: string, warnings: string[]): ProfileRecord | null {
  if (!existsSync(path)) return null;
  try {
    const parsed = parse(readFileSync(path, "utf-8"));
    return isRecord(parsed) ? parsed : null;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    warnings.push(`failed to parse config/profile.yml: ${message}`);
    return null;
  }
}

function safeRepoPath(repoRoot: string, relativePath: string): string {
  const root = resolve(repoRoot);
  const absolutePath = resolve(root, relativePath);
  if (absolutePath !== root && !absolutePath.startsWith(root + sep)) {
    throw new Error(`autofill resume path escapes repo root: ${relativePath}`);
  }
  return absolutePath;
}

function resumeFilename(repoRoot: string, relativePath: string): string {
  const absolutePath = safeRepoPath(repoRoot, relativePath || "docs/Hongxi_Chen_full_stack.pdf");
  return existsSync(absolutePath) ? basename(absolutePath) : "";
}

function safeRead(path: string): string {
  try {
    return readFileSync(path, "utf-8");
  } catch {
    return "";
  }
}

function isRecord(value: unknown): value is ProfileRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function objectAt(record: ProfileRecord | null, key: string): ProfileRecord | null {
  if (!record) return null;
  const value = record[key];
  return isRecord(value) ? value : null;
}

function stringAt(record: ProfileRecord | null, key: string): string {
  if (!record) return "";
  const value = record[key];
  return typeof value === "string" ? value.trim() : "";
}

function addCandidateField(
  fields: AutofillProfileField[],
  candidate: ProfileRecord | null,
  profileKey: string,
  key: AutofillFieldKind,
  label: string,
  sensitive: boolean,
  transform: (value: string) => string = (value) => value,
): void {
  const value = transform(stringAt(candidate, profileKey));
  addStringField(fields, key, label, value, "config/profile.yml", 0.96, sensitive);
}

function addStringField(
  fields: AutofillProfileField[],
  key: AutofillFieldKind,
  label: string,
  value: string | undefined,
  source: AutofillProfileField["source"],
  confidence: number,
  sensitive = false,
): void {
  if (!value) return;
  addField(fields, key, label, value, source, confidence, sensitive);
}

function addField(
  fields: AutofillProfileField[],
  key: AutofillFieldKind,
  label: string,
  value: string,
  source: AutofillProfileField["source"],
  confidence: number,
  sensitive = false,
  group?: AutofillProfileField["group"],
  groupIndex?: number,
): void {
  const trimmed = value.trim();
  if (!trimmed) return;
  fields.push({
    key,
    label,
    value: trimmed,
    source,
    confidence,
    aliases: FIELD_ALIASES[key],
    ...(sensitive ? { sensitive: true } : {}),
    ...(group ? { group } : {}),
    ...(groupIndex !== undefined ? { groupIndex } : {}),
  });
}

function addEntryField(
  fields: AutofillProfileField[],
  entry: ProfileRecord,
  profileKey: string,
  key: AutofillFieldKind,
  label: string,
  index: number,
  group: NonNullable<AutofillProfileField["group"]>,
  confidence: number,
): void {
  addField(fields, key, `${label} ${index + 1}`, stringAt(entry, profileKey), "config/profile.yml", confidence, false, group, index);
}

function normalizeLinkedUrl(value: string): string {
  if (!value) return "";
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

function normalizeGithubUrl(value: string): string {
  if (!value) return "";
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

function normalizePhoneE164(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return trimmed;
  return digits.startsWith("1") ? `+${digits}` : `+1${digits}`;
}

function phoneParts(value: string): { countryCode: string; national: string } {
  const trimmed = value.trim();
  const match = trimmed.match(/^(\+\d{1,3})[-\s]*(.+)$/);
  if (!match) return { countryCode: "", national: trimmed };
  return {
    countryCode: match[1] ?? "",
    national: (match[2] ?? "").trim(),
  };
}

function nationalPhoneDigits(value: string): string {
  const digits = value.replace(/\D/g, "");
  return digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
}

function sponsorshipAnswer(visaStatus: string): string {
  const lower = visaStatus.toLowerCase();
  if (!lower) return "";
  if (/\b(no sponsorship|do not need sponsorship|no sponsor)/.test(lower)) return "No";
  if (/\b(require|requires|need|needs|sponsorship support)/.test(lower)) return "Yes";
  return visaStatus;
}

function extractMarkdownMeta(markdown: string, key: "name"): string {
  if (!markdown) return "";
  if (key === "name") {
    const match = markdown.match(/^#\s+(.+)$/m);
    return match?.[1]?.trim() ?? "";
  }
  return "";
}

function extractFirstEducation(markdown: string): { school: string; degree: string; graduation: string } {
  const section = extractSection(markdown, "Education");
  const headings = Array.from(section.matchAll(/^###\s+(.+)$/gm)).map((match) => match[1]?.trim() ?? "");
  const degree = section.match(/\*\*([^*\n]*(?:Bachelor|Master|Science|Engineering|Degree)[^*\n]*)\*\*/i)?.[1]?.trim() ?? "";
  const graduation = section.match(/\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{4}\s*[–-]\s*(?:Present|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+)?\d{4}\b/i)?.[0]?.trim() ?? "";
  return {
    school: headings[0] ?? "",
    degree,
    graduation,
  };
}

function extractSkillSummary(profile: ProfileRecord | null, markdown: string): string {
  const profileSkills = arrayAt(objectAt(objectAt(profile, "newgrad_scan"), "skill_keywords"), "terms");
  const skills = profileSkills.length > 0 ? profileSkills : splitSkillSection(extractSection(markdown, "Skills"));
  return Array.from(new Set(skills.map((skill) => skill.trim()).filter(Boolean))).slice(0, 35).join(", ");
}

function arrayAt(record: ProfileRecord | null, key: string): string[] {
  if (!record) return [];
  const value = record[key];
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function recordsAt(record: ProfileRecord | null, key: string): ProfileRecord[] {
  if (!record) return [];
  const value = record[key];
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord);
}

function extractSection(markdown: string, heading: string): string {
  if (!markdown) return "";
  const pattern = new RegExp(`^##\\s+${escapeRegExp(heading)}\\s*$([\\s\\S]*?)(?=^##\\s+|(?![\\s\\S]))`, "im");
  return markdown.match(pattern)?.[1] ?? "";
}

function splitSkillSection(section: string): string[] {
  return section
    .replace(/\*\*[^*]+:\*\*/g, "")
    .split(/[,|\n]/)
    .map((part) => part.replace(/^[-*]\s*/, "").trim())
    .filter((part) => part.length > 1);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
