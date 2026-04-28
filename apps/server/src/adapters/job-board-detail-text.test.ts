import { describe, expect, test } from "vitest";

import {
  htmlToReadableText,
  normalizeJobBoardSalary,
  sanitizeJobBoardDetailText,
} from "./job-board-detail-text.js";

describe("job-board-detail-text", () => {
  test("extracts useful Built In detail sections and drops navigation", () => {
    const html = `
      <main>
        <nav>Built In Search Jobs Post a Job</nav>
        <h1>Software Engineer</h1>
        <section>
          <h2>Job Description</h2>
          <p>You will build customer-facing software services with product and design partners.</p>
          <h2>Responsibilities</h2>
          <ul><li>Develop TypeScript APIs and test automation.</li></ul>
          <h2>Requirements</h2>
          <ul><li>Experience with JavaScript, Python, or Java.</li></ul>
        </section>
        <aside><h2>Similar Jobs</h2><p>Other search results</p></aside>
      </main>
    `;

    const text = sanitizeJobBoardDetailText("builtin", html, "");

    expect(text).toContain("Job Description");
    expect(text).toContain("Develop TypeScript APIs");
    expect(text).toContain("Experience with JavaScript");
    expect(text).not.toContain("Similar Jobs");
    expect(text).not.toContain("Post a Job");
  });

  test("falls back to Indeed card snippet when detail fetch is verification shell", () => {
    const shell = [
      "Find jobs",
      "Company reviews",
      "Upload your resume",
      "Additional verification required",
      "Please verify you are a human",
    ].join("\n");

    const text = sanitizeJobBoardDetailText(
      "indeed",
      shell,
      "Build backend services with Python, Java, SQL, and cloud infrastructure.",
    );

    expect(text).toBe("Build backend services with Python, Java, SQL, and cloud infrastructure.");
  });

  test("normalizes salary only when it looks like pay", () => {
    expect(normalizeJobBoardSalary("$120,000 - $150,000 a year")).toBe("$120,000 - $150,000 a year");
    expect(normalizeJobBoardSalary("79K-135K Annually")).toBe("79K-135K Annually");
    expect(normalizeJobBoardSalary("Turbo for Students: Get Hired Faster!")).toBeNull();
    expect(normalizeJobBoardSalary("Full-time")).toBeNull();
  });

  test("htmlToReadableText preserves list boundaries", () => {
    expect(htmlToReadableText("<p>Requirements</p><ul><li>Java</li><li>Python</li></ul>"))
      .toContain("- Java\n- Python");
  });
});
