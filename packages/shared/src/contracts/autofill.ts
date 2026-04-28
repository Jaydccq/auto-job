export type AutofillFieldKind =
  | "fullName"
  | "title"
  | "firstName"
  | "preferredName"
  | "middleName"
  | "lastName"
  | "suffixName"
  | "birthday"
  | "email"
  | "phone"
  | "phoneCountryCode"
  | "phoneNational"
  | "location"
  | "addressLine1"
  | "addressLine2"
  | "addressLine3"
  | "city"
  | "county"
  | "state"
  | "postalCode"
  | "country"
  | "linkedIn"
  | "github"
  | "portfolio"
  | "workAuthorization"
  | "workAuthorizationUs"
  | "workAuthorizationCanada"
  | "workAuthorizationUk"
  | "sponsorship"
  | "jobSource"
  | "willingToRelocate"
  | "desiredStartDate"
  | "onsiteWork"
  | "age18"
  | "currentVisaStatus"
  | "futureVisaStatus"
  | "internalCandidate"
  | "disabilityStatus"
  | "raceEthnicity"
  | "lgbtqStatus"
  | "gender"
  | "veteranStatus"
  | "currentSchool"
  | "expectedGraduationYear"
  | "preferredWorkLocations"
  | "preferredWorkLocation"
  | "resumeFile"
  | "educationDegree"
  | "educationSchool"
  | "educationStartMonth"
  | "educationStartYear"
  | "educationEndMonth"
  | "educationEndYear"
  | "educationCountry"
  | "educationAreaOfStudy"
  | "experienceEmployer"
  | "experienceJobTitle"
  | "experienceStartMonth"
  | "experienceStartYear"
  | "experienceEndMonth"
  | "experienceEndYear"
  | "experienceCurrentJob"
  | "experienceCountry"
  | "experienceCity"
  | "experienceInternal"
  | "experienceAchievements"
  | "desiredSalary"
  | "minimumSalary"
  | "skills"
  | "school"
  | "degree"
  | "graduation";

export interface AutofillProfileField {
  key: AutofillFieldKind;
  label: string;
  value: string;
  source: "config/profile.yml" | "cv.md" | "derived";
  confidence: number;
  aliases: readonly string[];
  sensitive?: boolean;
  group?: "education" | "experience" | "preferredWorkLocation";
  groupIndex?: number;
}

export interface AutofillProfile {
  generatedAt: string;
  fields: readonly AutofillProfileField[];
  sources: readonly string[];
  warnings: readonly string[];
}

export interface AutofillResumeFile {
  filename: string;
  mimeType: "application/pdf";
  sizeBytes: number;
  dataBase64: string;
}
