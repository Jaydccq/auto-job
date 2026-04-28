import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { readAutofillProfile, readAutofillResume } from "./autofill-profile.js";

describe("readAutofillProfile", () => {
  it("assembles common application fields from profile.yml and cv.md", () => {
    const repoRoot = mkdtempSync(join(tmpdir(), "career-ops-autofill-"));
    mkdirSync(join(repoRoot, "config"), { recursive: true });
    mkdirSync(join(repoRoot, "docs"), { recursive: true });
    writeFileSync(join(repoRoot, "docs/resume.pdf"), "%PDF-1.5 test", "utf-8");
    writeFileSync(
      join(repoRoot, "config/profile.yml"),
      [
        "candidate:",
        '  title: "Ms."',
        '  full_name: "Ada Lovelace"',
        '  preferred_name: "Ada"',
        '  suffix_name: "PhD"',
        '  birthday: "1815-12-10"',
        '  email: "ada@example.com"',
        '  phone: "+1 555 0100"',
        '  phone_country_code: "+1"',
        '  phone_national: "(555) 0100"',
        '  location: "Durham, NC"',
        '  linkedin: "linkedin.com/in/ada"',
        '  github: "github.com/ada"',
        "  address:",
        '    country: "United States"',
        '    line1: "726 Glen Hollow Dr"',
        '    city: "Durham"',
        '    county: "Durham"',
        '    state: "NC"',
        '    postal_code: "27705"',
        "location:",
        '  country: "United States"',
        '  city: "Durham"',
        '  visa_status: "Requires sponsorship / work authorization support"',
        "autofill:",
        "  resume:",
        '    path: "docs/resume.pdf"',
        "  application_questions:",
        '    age_18: "Yes"',
        '    legally_authorized_to_work: "Yes"',
        '    authorized_to_work_us: "Yes"',
        '    authorized_to_work_canada: "Yes"',
        '    authorized_to_work_uk: "Yes"',
        '    require_sponsorship: "Yes"',
        '    heard_about_job: "LinkedIn"',
        '    willing_to_relocate: "Yes"',
        '    desired_start_date: "June"',
        '    able_to_work_onsite: "Yes"',
        '    current_visa_status: "F-1 OPT"',
        '    future_visa_status: "H-1B"',
        '    internal_candidate: "No"',
        '    current_school: "Duke University"',
        '    expected_graduation_year: "2026"',
        "  eeo:",
        '    disability_status: "No, I do not have a disability and have not had one in the past"',
        '    race_ethnicity: "East Asian"',
        '    lgbtq_status: "Yes"',
        '    gender: "Female"',
        '    veteran_status: "I am not a protected veteran"',
        "  preferred_work_locations:",
        '    - "Seattle"',
        '    - "San Francisco Bay Area"',
        "  education:",
        '    - degree: "Bachelor\'s Degree"',
        '      school: "University of Nottingham"',
        '      start_month: "September"',
        '      start_year: "2020"',
        '      end_month: "June"',
        '      end_year: "2024"',
        '      country: "China"',
        '      area_of_study: "Applied Mathematics"',
        "  experience:",
        '    - employer: "Chinese Academy of Sciences"',
        '      job_title: "Researcher Intern"',
        '      start_month: "July"',
        '      start_year: "2023"',
        '      end_month: "September"',
        '      end_year: "2023"',
        '      current_job: "No"',
        '      country: "China"',
        '      city: "Beijing"',
        '      internal: "No"',
        '      achievements: "Built geospatial ETL pipelines."',
        "compensation:",
        '  target_range: "$100K-150K"',
        '  minimum: "$90K"',
        "newgrad_scan:",
        "  skill_keywords:",
        "    terms:",
        '      - "TypeScript"',
        '      - "Distributed Systems"',
      ].join("\n"),
      "utf-8",
    );
    writeFileSync(
      join(repoRoot, "cv.md"),
      [
        "# Ada Lovelace",
        "",
        "## Education",
        "",
        "### Duke University",
        "**Master of Science in Software Engineering**",
        "Aug. 2024 - May 2026",
      ].join("\n"),
      "utf-8",
    );

    const profile = readAutofillProfile(repoRoot, new Date("2026-04-26T12:00:00.000Z"));
    const byKey = new Map(profile.fields.map((field) => [field.key, field]));

    expect(profile.generatedAt).toBe("2026-04-26T12:00:00.000Z");
    expect(profile.sources).toEqual(["config/profile.yml", "cv.md"]);
    expect(byKey.get("title")?.value).toBe("Ms.");
    expect(byKey.get("fullName")?.value).toBe("Ada Lovelace");
    expect(byKey.get("preferredName")?.value).toBe("Ada");
    expect(byKey.get("suffixName")?.value).toBe("PhD");
    expect(byKey.get("birthday")).toMatchObject({ value: "1815-12-10", sensitive: true });
    expect(byKey.get("firstName")?.value).toBe("Ada");
    expect(byKey.get("lastName")?.value).toBe("Lovelace");
    expect(byKey.get("lastName")?.aliases).toContain("preferred last name");
    expect(byKey.get("phone")?.value).toBe("+15550100");
    expect(byKey.get("email")).toMatchObject({ value: "ada@example.com", sensitive: true });
    expect(byKey.get("phoneCountryCode")).toMatchObject({ value: "+1", sensitive: true });
    expect(byKey.get("phoneNational")).toMatchObject({ value: "5550100", sensitive: true });
    expect(byKey.get("linkedIn")?.value).toBe("https://linkedin.com/in/ada");
    expect(byKey.get("linkedIn")?.aliases).toContain("linkedin profile or website");
    expect(byKey.get("location")?.aliases).toEqual(expect.arrayContaining([
      "located in today",
      "city and state",
      "city and state province",
    ]));
    expect(byKey.get("addressLine1")).toMatchObject({ value: "726 Glen Hollow Dr", sensitive: true });
    expect(byKey.get("city")?.value).toBe("Durham");
    expect(byKey.get("county")?.value).toBe("Durham");
    expect(byKey.get("state")?.value).toBe("NC");
    expect(byKey.get("postalCode")).toMatchObject({ value: "27705", sensitive: true });
    expect(byKey.get("country")?.value).toBe("United States");
    expect(byKey.get("workAuthorization")?.value).toBe("Yes");
    expect(byKey.get("workAuthorizationUs")?.value).toBe("Yes");
    expect(byKey.get("workAuthorizationCanada")?.value).toBe("Yes");
    expect(byKey.get("workAuthorizationUk")?.value).toBe("Yes");
    expect(byKey.get("age18")?.value).toBe("Yes");
    expect(byKey.get("sponsorship")?.value).toBe("Yes");
    expect(byKey.get("jobSource")?.value).toBe("LinkedIn");
    expect(byKey.get("willingToRelocate")?.value).toBe("Yes");
    expect(byKey.get("desiredStartDate")?.value).toBe("June");
    expect(byKey.get("desiredStartDate")?.aliases).toContain("how soon can you start");
    expect(byKey.get("onsiteWork")?.value).toBe("Yes");
    expect(byKey.get("currentVisaStatus")?.value).toBe("F-1 OPT");
    expect(byKey.get("futureVisaStatus")?.value).toBe("H-1B");
    expect(byKey.get("internalCandidate")?.value).toBe("No");
    expect(byKey.get("disabilityStatus")?.value).toBe("No, I do not have a disability and have not had one in the past");
    expect(byKey.get("raceEthnicity")?.value).toBe("East Asian");
    expect(byKey.get("lgbtqStatus")?.value).toBe("Yes");
    expect(byKey.get("gender")?.value).toBe("Female");
    expect(byKey.get("veteranStatus")?.value).toBe("I am not a protected veteran");
    expect(byKey.get("currentSchool")?.value).toBe("Duke University");
    expect(byKey.get("expectedGraduationYear")?.value).toBe("2026");
    expect(byKey.get("preferredWorkLocations")?.value).toBe("Seattle, San Francisco Bay Area");
    expect(byKey.get("resumeFile")).toMatchObject({ value: "resume.pdf", sensitive: true });
    expect(profile.fields.filter((field) => field.key === "preferredWorkLocation").map((field) => field.value)).toEqual([
      "Seattle",
      "San Francisco Bay Area",
    ]);
    expect(byKey.get("educationDegree")).toMatchObject({ value: "Bachelor's Degree", group: "education", groupIndex: 0 });
    expect(byKey.get("educationSchool")?.value).toBe("University of Nottingham");
    expect(byKey.get("educationEndMonth")?.value).toBe("June");
    expect(byKey.get("educationEndYear")?.value).toBe("2024");
    expect(byKey.get("educationAreaOfStudy")?.value).toBe("Applied Mathematics");
    expect(byKey.get("experienceEmployer")).toMatchObject({ value: "Chinese Academy of Sciences", group: "experience", groupIndex: 0 });
    expect(byKey.get("experienceJobTitle")?.value).toBe("Researcher Intern");
    expect(byKey.get("experienceCurrentJob")?.value).toBe("No");
    expect(byKey.get("experienceInternal")?.value).toBe("No");
    expect(byKey.get("experienceAchievements")?.value).toBe("Built geospatial ETL pipelines.");
    expect(byKey.get("desiredSalary")?.value).toBe("$100K-150K");
    expect(byKey.get("minimumSalary")?.value).toBe("$90K");
    expect(byKey.get("school")?.value).toBe("Duke University");
    expect(byKey.get("degree")?.value).toBe("Master of Science in Software Engineering");
    expect(byKey.get("skills")?.value).toBe("TypeScript, Distributed Systems");

    const resume = readAutofillResume(repoRoot);
    expect(resume).toMatchObject({
      filename: "resume.pdf",
      mimeType: "application/pdf",
      sizeBytes: 13,
      dataBase64: "JVBERi0xLjUgdGVzdA==",
    });
  });
});
