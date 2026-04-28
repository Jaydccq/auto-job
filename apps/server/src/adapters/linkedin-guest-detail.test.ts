import { expect, test } from "vitest";

import { parseLinkedInGuestJobPostingHtml } from "./linkedin-guest-detail.js";

test("parses rich LinkedIn guest jobPosting description HTML", () => {
  const html = `
    <h2 class="top-card-layout__title topcard__title">Applied AI Engineer</h2>
    <a class="topcard__org-name-link">DeepIntent</a>
    <span class="topcard__flavor topcard__flavor--bullet">New York, NY</span>
    <section class="core-section-container my-3 description">
      <div class="description__text description__text--rich">
        <section class="show-more-less-html" data-max-lines="5">
          <div class="show-more-less-html__markup show-more-less-html__markup--clamp-after-5 relative overflow-hidden">
            DeepIntent is leading the healthcare advertising industry with data-driven solutions.<br><br>
            <strong>What You’ll Do<br><br></strong>
            We are looking for an Applied AI Engineer to build practical AI agent and automation solutions.<br><br>
            <strong>Build &amp; Deploy AI Agents and Automations<br><br></strong>
            <ul>
              <li>Design, build, and deploy AI agents that automate administrative and repetitive workflows.</li>
              <li>Develop solutions using LLMs, workflow automation tools, RESTful APIs, and Python scripting.</li>
            </ul>
            <strong>Who You Are<br><br></strong>
            <ul>
              <li>Bachelors or Masters degree in Computer Science, Mathematics or Engineering.</li>
              <li>Hands-on experience with AI/LLM tools, including OpenAI or Anthropic Claude.</li>
            </ul>
            Base salary range of $110,000 -$150,000.
          </div>
          <button aria-label="Show more">Show more</button>
        </section>
      </div>
      <ul class="description__job-criteria-list">
        <li><h3>Employment type</h3><span>Full-time</span></li>
      </ul>
    </section>
  `;

  const detail = parseLinkedInGuestJobPostingHtml(
    html,
    "https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/4402818809",
  );

  expect(detail.title).toBe("Applied AI Engineer");
  expect(detail.company).toBe("DeepIntent");
  expect(detail.location).toBe("New York, NY");
  expect(detail.description.length).toBeGreaterThan(500);
  expect(detail.description).toContain("What You’ll Do");
  expect(detail.description).toContain("Design, build, and deploy AI agents");
  expect(detail.salaryRange).toBe("$110,000 -$150,000");
  expect(detail.requiredQualifications).toContain(
    "Bachelors or Masters degree in Computer Science, Mathematics or Engineering.",
  );
  expect(detail.skillTags).toEqual(expect.arrayContaining(["Python", "LLM", "AI", "OpenAI", "Claude"]));
});
