import { expect, test } from "vitest";

import {
  hasExternalNewGradUrl,
  isJobrightUrl,
  pickBestNewGradUrl,
  pickPipelineEntryUrl,
  pipelineEntryUrlCandidates,
} from "./newgrad-links.js";

test("pickBestNewGradUrl prefers a known ATS link over Jobright", () => {
  const best = pickBestNewGradUrl(
    "https://jobright.ai/jobs/info/abc123",
    "https://boards.greenhouse.io/embed/job_app?token=7786397&utm_source=jobright",
  );

  expect(best).toBe(
    "https://boards.greenhouse.io/embed/job_app?token=7786397&utm_source=jobright",
  );
});

test("pickBestNewGradUrl ignores noisy social/company metadata links", () => {
  const best = pickBestNewGradUrl(
    "https://www.linkedin.com/company/example",
    "https://www.crunchbase.com/organization/example",
    "https://company.example/careers/software-engineer",
  );

  expect(best).toBe("https://company.example/careers/software-engineer");
});

test("pickBestNewGradUrl returns null when every candidate is social or company noise", () => {
  const best = pickBestNewGradUrl(
    "https://www.linkedin.com/company/example",
    "https://www.linkedin.com/in/example",
    "https://www.facebook.com/example",
  );

  expect(best).toBeNull();
});

test("pickBestNewGradUrl canonicalizes LinkedIn search-result job URLs", () => {
  const best = pickBestNewGradUrl(
    "https://www.linkedin.com/jobs/search-results/?currentJobId=4347121472&refId=abc",
  );

  expect(best).toBe("https://www.linkedin.com/jobs/view/4347121472/");
});

test("pickPipelineEntryUrl falls back to row.applyUrl when detail links stay on Jobright", () => {
  const best = pickPipelineEntryUrl(
    {
      originalPostUrl: "https://jobright.ai/jobs/info/internal-1",
      applyNowUrl: "",
      applyFlowUrls: [],
    },
    {
      applyUrl: "https://jobs.ashbyhq.com/example/123",
      detailUrl: "https://jobright.ai/jobs/info/internal-1",
    },
  );

  expect(best).toBe("https://jobs.ashbyhq.com/example/123");
});

test("pickPipelineEntryUrl still returns Jobright when no better candidate exists", () => {
  const best = pickPipelineEntryUrl(
    {
      originalPostUrl: "",
      applyNowUrl: "",
      applyFlowUrls: [],
    },
    {
      applyUrl: "https://jobright.ai/jobs/info/internal-2",
      detailUrl: "https://jobright.ai/jobs/info/internal-2",
    },
  );

  expect(best).toBe("https://jobright.ai/jobs/info/internal-2");
  expect(isJobrightUrl(best)).toBe(true);
  expect(hasExternalNewGradUrl(best)).toBe(false);
});

test("pipelineEntryUrlCandidates keeps company apply and source job aliases", () => {
  const candidates = pipelineEntryUrlCandidates(
    {
      originalPostUrl: "https://www.linkedin.com/jobs/view/4347121472/",
      applyNowUrl: "https://job-boards.greenhouse.io/example/jobs/7839298?gh_jid=7839298",
      applyFlowUrls: [
        "https://job-boards.greenhouse.io/example/jobs/7839298?gh_jid=7839298",
      ],
    },
    {
      applyUrl: "https://www.linkedin.com/jobs/view/4347121472/",
      detailUrl: "https://www.linkedin.com/jobs/view/4347121472/",
    },
  );

  expect(candidates).toEqual([
    "https://job-boards.greenhouse.io/example/jobs/7839298?gh_jid=7839298",
    "https://www.linkedin.com/jobs/view/4347121472/",
  ]);
});

test("pickPipelineEntryUrl prefers concrete Jobright detail over Jobright recommendations", () => {
  const best = pickPipelineEntryUrl(
    {
      originalPostUrl: "https://jobright.ai/jobs/recommend",
      applyNowUrl: "https://jobright.ai/jobs/recommend",
      applyFlowUrls: [],
    },
    {
      applyUrl: "https://jobright.ai/jobs/recommend",
      detailUrl: "https://jobright.ai/jobs/info/sun-west-role",
    },
  );

  expect(best).toBe("https://jobright.ai/jobs/info/sun-west-role");
});

test("pickPipelineEntryUrl does not prefer bare company homepage over Jobright detail", () => {
  const best = pickPipelineEntryUrl(
    {
      originalPostUrl: "https://www.goldmansachs.com/",
      applyNowUrl: "https://www.goldmansachs.com/",
      applyFlowUrls: [],
    },
    {
      applyUrl: "https://jobright.ai/jobs/info/goldman-role",
      detailUrl: "https://jobright.ai/jobs/info/goldman-role",
    },
  );

  expect(best).toBe("https://jobright.ai/jobs/info/goldman-role");
});

test("pickPipelineEntryUrl accepts LinkedIn job views but ignores LinkedIn company pages", () => {
  const best = pickPipelineEntryUrl(
    {
      originalPostUrl: "https://www.linkedin.com/company/example",
      applyNowUrl: "https://www.linkedin.com/in/recruiter",
      applyFlowUrls: [],
    },
    {
      applyUrl: "https://www.linkedin.com/jobs/view/4347121472/",
      detailUrl: "https://www.linkedin.com/jobs/view/4347121472/",
    },
  );

  expect(best).toBe("https://www.linkedin.com/jobs/view/4347121472/");
});

test("pickPipelineEntryUrl prefers LinkedIn Apply flow external URLs over LinkedIn job views", () => {
  const best = pickPipelineEntryUrl(
    {
      originalPostUrl: "https://www.linkedin.com/jobs/view/4404332749/",
      applyNowUrl: "https://careers.truist.com/us/en/job/tbjtbfusr0103225externalenus/software-engineer-iii-real-estate-mortgage-servicing?source=linkedin",
      applyFlowUrls: [
        "https://www.linkedin.com/jobs/view/4404332749/",
        "https://careers.truist.com/us/en/job/tbjtbfusr0103225externalenus/software-engineer-iii-real-estate-mortgage-servicing?source=linkedin",
      ],
    },
    {
      applyUrl: "https://www.linkedin.com/jobs/view/4404332749/",
      detailUrl: "https://www.linkedin.com/jobs/view/4404332749/",
    },
  );

  expect(best).toBe(
    "https://careers.truist.com/us/en/job/tbjtbfusr0103225externalenus/software-engineer-iii-real-estate-mortgage-servicing?source=linkedin",
  );
});

test("pickPipelineEntryUrl returns Flexport Greenhouse URL captured from LinkedIn Apply", () => {
  const best = pickPipelineEntryUrl(
    {
      originalPostUrl: "https://www.linkedin.com/jobs/view/4405051625/",
      applyNowUrl: "https://job-boards.greenhouse.io/flexport/jobs/7839298?gh_jid=7839298",
      applyFlowUrls: [
        "https://www.linkedin.com/jobs/view/4405051625/",
        "https://job-boards.greenhouse.io/flexport/jobs/7839298?gh_jid=7839298",
      ],
    },
    {
      applyUrl: "https://www.linkedin.com/jobs/view/4405051625/",
      detailUrl: "https://www.linkedin.com/jobs/view/4405051625/",
    },
  );

  expect(best).toBe("https://job-boards.greenhouse.io/flexport/jobs/7839298?gh_jid=7839298");
});

test("pickPipelineEntryUrl accepts LinkedIn Apply redirect hosts captured from the click", () => {
  const best = pickPipelineEntryUrl(
    {
      originalPostUrl: "https://www.linkedin.com/jobs/view/4404466625/",
      applyNowUrl: "https://click.appcast.io/t/orxmr7zovw5kwrxqxs59tkxrb40gyhc5e4lxuxd0rd4=",
      applyFlowUrls: [
        "https://click.appcast.io/t/orxmr7zovw5kwrxqxs59tkxrb40gyhc5e4lxuxd0rd4=",
      ],
    },
    {
      applyUrl: "https://www.linkedin.com/jobs/view/4404466625/",
      detailUrl: "https://www.linkedin.com/jobs/view/4404466625/",
    },
  );

  expect(best).toBe("https://click.appcast.io/t/orxmr7zovw5kwrxqxs59tkxrb40gyhc5e4lxuxd0rd4=");
});

test("pickPipelineEntryUrl prefers opaque external Apply redirects over LinkedIn job views", () => {
  const best = pickPipelineEntryUrl(
    {
      originalPostUrl: "https://www.linkedin.com/jobs/view/4405249033/",
      applyNowUrl: "https://dsp.prng.co/voof7ub",
      applyFlowUrls: [
        "https://dsp.prng.co/voof7ub",
        "https://www.linkedin.com/jobs/view/4405249033/",
      ],
    },
    {
      applyUrl: "https://www.linkedin.com/jobs/view/4405249033/",
      detailUrl: "https://www.linkedin.com/jobs/view/4405249033/",
    },
  );

  expect(best).toBe("https://dsp.prng.co/voof7ub");
});

test("pickPipelineEntryUrl ignores auth and analytics URLs captured during apply probing", () => {
  const best = pickPipelineEntryUrl(
    {
      originalPostUrl: "https://accounts.google.com/gsi/log?client_id=abc&event=onetap",
      applyNowUrl: "",
      applyFlowUrls: [
        "https://accounts.google.com/gsi/log?client_id=abc&event=onetap",
      ],
    },
    {
      applyUrl: "https://jobright.ai/jobs/info/twitch-role",
      detailUrl: "https://jobright.ai/jobs/info/twitch-role",
    },
  );

  expect(best).toBe("https://jobright.ai/jobs/info/twitch-role");
});

test("pickPipelineEntryUrl prefers a traced apply-flow URL over Jobright detail links", () => {
  const best = pickPipelineEntryUrl(
    {
      originalPostUrl: "https://jobright.ai/jobs/info/internal-3",
      applyNowUrl: "https://jobright.ai/jobs/info/internal-3",
      applyFlowUrls: [
        "https://jobright.ai/jobs/info/internal-3",
        "https://careers.avisbudgetgroup.com/job/parsippany/accelerate-deployed-transformation-engineer/12345",
      ],
    },
    {
      applyUrl: "https://jobright.ai/jobs/info/internal-3",
      detailUrl: "https://jobright.ai/jobs/info/internal-3",
    },
  );

  expect(best).toBe(
    "https://careers.avisbudgetgroup.com/job/parsippany/accelerate-deployed-transformation-engineer/12345",
  );
});
