/**
 * Per-ATS signup adapters.
 *
 * Each adapter exposes:
 *   detectsUrl(url)
 *   identifyForm(tab) — returns SignupFormSchema
 *   fillForm(humanizedTab, schema, data) — humanized fill
 *   submit(humanizedTab, opts) — gated single-call-site
 *
 * Selector tables are conservative starts; tune in production after
 * observing real signup pages.
 */

import type { Tab } from "@auto-job/browser";

import { SignupSubmitNotPermittedError } from "./errors.js";
import type {
  SignupFlow,
  SignupFormData,
  SignupFormSchema,
  SignupStandardField,
  SignupSubmitResult,
  SupportedSignupATS,
} from "./types.js";

interface FieldSelectorTable {
  email?: readonly string[];
  password?: readonly string[];
  passwordConfirm?: readonly string[];
  firstName?: readonly string[];
  lastName?: readonly string[];
  phone?: readonly string[];
  termsCheckbox?: readonly string[];
}

interface AdapterConfig {
  ats: SupportedSignupATS;
  detectsUrl: (url: string) => boolean;
  selectors: FieldSelectorTable;
  submitSelectors: readonly string[];
  /**
   * Pages that signal "verify your email" after submit. We check
   * the post-submit HTML against these patterns to set
   * requiresEmailVerification.
   */
  emailVerificationPatterns: readonly RegExp[];
}

async function findFirstPresent(tab: Tab, candidates: readonly string[]): Promise<string | undefined> {
  for (const sel of candidates) {
    const ok = await tab
      .evaluate<boolean>(`!!document.querySelector(${JSON.stringify(sel)})`)
      .catch(() => false);
    if (ok) return sel;
  }
  return undefined;
}

function buildAdapter(cfg: AdapterConfig): SignupFlow {
  return {
    ats: cfg.ats,
    detectsUrl: cfg.detectsUrl,
    async identifyForm(tab) {
      const standardFields: Partial<Record<SignupStandardField, string>> = {};
      for (const key of [
        "email",
        "password",
        "passwordConfirm",
        "firstName",
        "lastName",
        "phone",
        "termsCheckbox",
      ] as SignupStandardField[]) {
        const candidates = cfg.selectors[key];
        if (!candidates) continue;
        const sel = await findFirstPresent(tab, candidates);
        if (sel) standardFields[key] = sel;
      }
      const submit = await findFirstPresent(tab, cfg.submitSelectors);
      const schema: SignupFormSchema = {
        standardFields,
        pageUrl: tab.url,
      };
      if (submit) schema.submitSelector = submit;
      return schema;
    },
    async fillForm(tab, schema, data) {
      const sf = schema.standardFields;
      if (sf.email) await tab.fill(sf.email, data.email);
      if (sf.password) await tab.fill(sf.password, data.password);
      if (sf.passwordConfirm) await tab.fill(sf.passwordConfirm, data.password);
      if (sf.firstName) await tab.fill(sf.firstName, data.firstName);
      if (sf.lastName) await tab.fill(sf.lastName, data.lastName);
      if (sf.phone && data.phone) await tab.fill(sf.phone, data.phone);
      if (sf.termsCheckbox) await tab.click(sf.termsCheckbox);
    },
    async submit(tab, opts) {
      if (opts.allowSubmit !== true) {
        throw new SignupSubmitNotPermittedError();
      }
      const submitSelector = (await findFirstPresent(tab as unknown as Tab, cfg.submitSelectors)) ??
        cfg.submitSelectors[0]!;
      const submittedAt = new Date().toISOString();
      await tab.click(submitSelector);
      // Brief settle for navigation.
      await new Promise((r) => setTimeout(r, 1500));
      const finalUrl = (tab as unknown as Tab).url;
      const html = await (tab as unknown as Tab)
        .evaluate<string>("document.documentElement.outerHTML")
        .catch(() => "");
      const lower = html.toLowerCase();
      const appearsSuccessful = !/error|invalid|already (?:exists|registered)/i.test(html);
      const requiresEmailVerification = cfg.emailVerificationPatterns.some((p) => p.test(lower));
      const result: SignupSubmitResult = {
        submittedAt,
        finalUrl,
        appearsSuccessful,
        requiresEmailVerification,
      };
      return result;
    },
  };
}

export const greenhouseSignupFlow: SignupFlow = buildAdapter({
  ats: "greenhouse",
  detectsUrl: (u) => /boards\.greenhouse\.io/.test(u) || /grnh\.se/.test(u),
  selectors: {
    email: ['input[type="email"]', 'input[name="email"]', '[data-qa="email"]'],
    password: ['input[type="password"]:not([name*="confirm" i])'],
    passwordConfirm: [
      'input[name*="confirm" i]',
      'input[name*="password_confirmation"]',
    ],
    firstName: ['input[name="first_name"]', '[data-qa="first_name"]'],
    lastName: ['input[name="last_name"]', '[data-qa="last_name"]'],
    phone: ['input[type="tel"]', 'input[name="phone"]'],
    termsCheckbox: ['input[type="checkbox"][name*="terms" i]', '[data-qa="terms"]'],
  },
  submitSelectors: [
    'button[type="submit"]',
    'button:has-text("Create Account")',
    'button:has-text("Sign Up")',
  ],
  emailVerificationPatterns: [
    /please verify your email/,
    /check your email/,
    /verification email/,
    /confirm your account/,
  ],
});

export const leverSignupFlow: SignupFlow = buildAdapter({
  ats: "lever",
  detectsUrl: (u) => /jobs\.lever\.co/.test(u),
  selectors: {
    email: ['input[type="email"]', 'input[name="email"]'],
    password: ['input[type="password"]'],
    firstName: ['input[name="firstName"]', 'input[name="first_name"]'],
    lastName: ['input[name="lastName"]', 'input[name="last_name"]'],
    phone: ['input[type="tel"]', 'input[name="phone"]'],
  },
  submitSelectors: ['button[type="submit"]', 'button:has-text("Sign Up")'],
  emailVerificationPatterns: [/verify your email/, /check your inbox/],
});

export const ashbySignupFlow: SignupFlow = buildAdapter({
  ats: "ashby",
  detectsUrl: (u) => /jobs\.ashbyhq\.com/.test(u),
  selectors: {
    email: ['input[type="email"]'],
    password: ['input[type="password"]'],
    firstName: ['input[name="firstName"]', 'input[id*="first" i]'],
    lastName: ['input[name="lastName"]', 'input[id*="last" i]'],
  },
  submitSelectors: ['button[type="submit"]', 'button:has-text("Create")'],
  emailVerificationPatterns: [/verify your email/, /confirmation email/],
});

export const workdaySignupFlow: SignupFlow = buildAdapter({
  ats: "workday",
  detectsUrl: (u) => /myworkdayjobs\.com/.test(u) || /workday\.com\/(?:wday|recruiting)/.test(u),
  selectors: {
    email: [
      'input[data-automation-id="email"]',
      'input[type="email"]',
    ],
    password: [
      'input[data-automation-id="password"]',
      'input[type="password"]:not([data-automation-id*="verify" i])',
    ],
    passwordConfirm: ['input[data-automation-id="verifyPassword"]'],
    firstName: ['input[data-automation-id="firstName"]'],
    lastName: ['input[data-automation-id="lastName"]'],
    termsCheckbox: ['input[data-automation-id="createAccountCheckbox"]'],
  },
  submitSelectors: [
    'button[data-automation-id="createAccountSubmitButton"]',
    'button[type="submit"]',
    'button:has-text("Create Account")',
  ],
  emailVerificationPatterns: [/verify your email/, /a verification email/, /please activate your account/],
});

export const SIGNUP_FLOWS: Record<SupportedSignupATS, SignupFlow> = {
  greenhouse: greenhouseSignupFlow,
  lever: leverSignupFlow,
  ashby: ashbySignupFlow,
  workday: workdaySignupFlow,
};

export function signupFlowFor(ats: string): SignupFlow {
  if (ats in SIGNUP_FLOWS) {
    return SIGNUP_FLOWS[ats as SupportedSignupATS];
  }
  throw new (class extends Error {
    readonly name = "UnsupportedSignupATSError";
    constructor() {
      super(`auto-signup does not support "${ats}". See @auto-job/auto-signup README.`);
    }
  })();
}

/** Re-export so callers can use a typed reference. */
export type { SignupFormData };
