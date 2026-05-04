/**
 * Load ApplicationData from config/profile.yml.
 *
 * Required schema (in YAML):
 *   name: { first: ..., last: ... }
 *   email: ...
 *   phone: ...
 *   location: { city: ..., state?: ..., country?: ... }
 *   links: { linkedin?: ..., github?: ..., portfolio?: ... }
 *   resume_path: <absolute path to PDF>
 *   work_authorization: us_citizen | permanent_resident | h1b | needs_sponsorship | other
 *   requires_sponsorship: true | false
 *   default_cover_letter: <optional multiline string>
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { parse as parseYaml } from "yaml";

import { MissingProfileFieldError, MissingResumeError } from "./errors.js";
import type { ApplicationData } from "./types.js";

export interface LoadOptions {
  /** Path to profile.yml. Default: config/profile.yml relative to cwd. */
  profilePath?: string;
}

const DEFAULT_PROFILE_PATH = "config/profile.yml";

interface RawProfile {
  name?: { first?: string; last?: string };
  email?: string;
  phone?: string;
  location?: { city?: string; state?: string; country?: string };
  links?: { linkedin?: string; github?: string; portfolio?: string };
  resume_path?: string;
  work_authorization?: string;
  requires_sponsorship?: boolean;
  default_cover_letter?: string;
}

const VALID_WORK_AUTH = new Set([
  "us_citizen",
  "permanent_resident",
  "h1b",
  "needs_sponsorship",
  "other",
]);

export function loadApplicationData(opts: LoadOptions = {}): ApplicationData {
  const path = opts.profilePath ?? DEFAULT_PROFILE_PATH;
  if (!existsSync(path)) {
    throw new MissingProfileFieldError("(file)", path);
  }
  const raw = parseYaml(readFileSync(path, "utf-8")) as RawProfile | null;
  if (!raw || typeof raw !== "object") {
    throw new MissingProfileFieldError("(any)", path);
  }
  const need = <T>(value: T | undefined | null, field: string): T => {
    if (value === undefined || value === null || value === "") {
      throw new MissingProfileFieldError(field, path);
    }
    return value;
  };

  const firstName = need(raw.name?.first, "name.first");
  const lastName = need(raw.name?.last, "name.last");
  const email = need(raw.email, "email");
  const phone = need(raw.phone, "phone");
  const city = need(raw.location?.city, "location.city");
  const resumePathRaw = need(raw.resume_path, "resume_path");
  const workAuth = need(raw.work_authorization, "work_authorization");
  if (!VALID_WORK_AUTH.has(workAuth)) {
    throw new MissingProfileFieldError(
      `work_authorization (got "${workAuth}", expected one of ${[...VALID_WORK_AUTH].join(", ")})`,
      path,
    );
  }
  const requiresSponsorship = need(
    raw.requires_sponsorship,
    "requires_sponsorship (boolean)",
  );

  const resumePath = resolve(resumePathRaw);
  if (!existsSync(resumePath)) {
    throw new MissingResumeError(resumePath);
  }

  const data: ApplicationData = {
    name: { first: firstName, last: lastName },
    email,
    phone,
    location: { city, ...(raw.location?.state ? { state: raw.location.state } : {}), ...(raw.location?.country ? { country: raw.location.country } : {}) },
    links: {
      ...(raw.links?.linkedin ? { linkedin: raw.links.linkedin } : {}),
      ...(raw.links?.github ? { github: raw.links.github } : {}),
      ...(raw.links?.portfolio ? { portfolio: raw.links.portfolio } : {}),
    },
    resumePath,
    workAuthorization: workAuth as ApplicationData["workAuthorization"],
    requiresSponsorship,
    ...(raw.default_cover_letter ? { defaultCoverLetter: raw.default_cover_letter } : {}),
  };
  return data;
}
