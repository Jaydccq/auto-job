import { describe, expect, test } from "vitest";

import { __internal } from "./claude-pipeline.js";

describe("evaluation artifact contract", () => {
  test("parses terminal JSON, report headers, tracker rows, and merge summaries", () => {
    const terminal = __internal.extractTerminalJsonObject(
      [
        "worker output",
        '{"status":"completed","id":"job-441","report_num":"441","company":"Acme","role":"Software Engineer","score":4.2,"tldr":"Strong local fit.","archetype":"software","legitimacy":"High Confidence","pdf":null,"report":"reports/441-acme-2026-04-27.md","error":null}',
      ].join("\n"),
    );
    expect(terminal).toMatchObject({
      status: "completed",
      id: "job-441",
      report_num: "441",
      company: "Acme",
      role: "Software Engineer",
      score: 4.2,
      tldr: "Strong local fit.",
      archetype: "software",
      legitimacy: "High Confidence",
      pdf: null,
      report: "reports/441-acme-2026-04-27.md",
      error: null,
    });

    const quick = __internal.extractQuickTerminalJsonObject(
      '{"status":"completed","id":"job-quick","company":"Acme","role":"Software Engineer","score":8.6,"tldr":"Worth deep eval.","legitimacy":"legit","decision":"deep_eval","reasons":["strong_match"],"blockers":[],"error":null}',
    );
    expect(quick.decision).toBe("deep_eval");

    const report = __internal.parseReportMarkdown(
      [
        "# Evaluation: Acme - Software Engineer",
        "",
        "**Date:** 2026-04-27",
        "**Archetype:** Software Engineer",
        "**Score:** 4.2/5",
        "**URL:** https://jobs.example.com/role/123",
        "**PDF:** output/acme.pdf",
        "",
        "| Field | Value |",
        "|---|---|",
        "| TL;DR | Strong local fit. |",
      ].join("\n"),
    );
    expect(report).toEqual({
      company: "Acme",
      role: "Software Engineer",
      date: "2026-04-27",
      score: 4.2,
      archetype: "Software Engineer",
      url: "https://jobs.example.com/role/123",
      pdf: "output/acme.pdf",
      tldr: "Strong local fit.",
    });

    const trackerRow = __internal.buildTrackerRow({
      num: 441,
      date: report.date,
      company: report.company,
      role: report.role,
      score: report.score,
      reportPath: "/repo/reports/441-acme-2026-04-27.md",
      pdfPath: null,
      tldr: report.tldr,
    });
    expect(trackerRow).toMatchObject({
      num: 441,
      status: "Evaluated",
      score: "4.2/5",
      pdf: "\u274c",
      report: "[441](reports/441-acme-2026-04-27.md)",
    });

    const trackerRows = __internal.parseTrackerRows(
      [
        "| # | Date | Company | Role | Score | Status | PDF | Report | Notes |",
        "|---|------|---------|------|-------|--------|-----|--------|-------|",
        `| ${trackerRow.num} | ${trackerRow.date} | ${trackerRow.company} | ${trackerRow.role} | ${trackerRow.score} | ${trackerRow.status} | ${trackerRow.pdf} | ${trackerRow.report} | ${trackerRow.notes} |`,
      ].join("\n"),
    );
    expect(trackerRows).toHaveLength(1);
    expect(trackerRows[0]).toMatchObject({
      company: "Acme",
      role: "Software Engineer",
      status: "Evaluated",
      score: "4.2/5",
    });

    expect(
      __internal.parseMergeSummary("Merge complete: +1 added, \u{1f504}2 updated, \u{23ed}\ufe0f3 skipped"),
    ).toEqual({ added: 1, updated: 2, skipped: 3 });
  });

  test("rejects malformed required artifacts", () => {
    expect(() => __internal.extractTerminalJsonObject('{"status":"completed","report_num":"441"}')).toThrow(
      "Unable to parse terminal JSON",
    );
    expect(() =>
      __internal.extractTerminalJsonObject(
        '{"status":"completed","id":"job-441","report_num":"441","company":"Acme","role":"Software Engineer","score":4.2,"tldr":"Strong local fit.","archetype":"software","pdf":null,"report":"reports/441-acme-2026-04-27.md","error":null}',
      ),
    ).toThrow("Unable to parse terminal JSON");
    expect(() => __internal.extractQuickTerminalJsonObject('{"status":"completed","id":"job"}')).toThrow(
      "Unable to parse quick terminal JSON",
    );
    expect(() =>
      __internal.parseReportMarkdown(
        [
          "# Evaluation: Acme - Software Engineer",
          "",
          "**Date:** 2026-04-27",
          "**Archetype:** Software Engineer",
        ].join("\n"),
      ),
    ).toThrow("report header missing Score");
    expect(__internal.parseTrackerRows("| malformed | row |")).toEqual([]);
  });
});
