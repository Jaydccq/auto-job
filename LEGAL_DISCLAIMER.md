# Legal Disclaimer

`auto-job` is a personal, local-first job-search runtime. Use it on your own
data, on your own machine, against your own targets. By running this code or
using artifacts it produces, you agree to the following.

## What this software does

- Reads job postings you direct it at.
- Calls third-party APIs (LLM providers, ATS public APIs, search engines) on
  your behalf using credentials you configure.
- Writes evaluation reports, application drafts, CV PDFs, cover letters,
  follow-up drafts, and tracker rows to your local repo.
- Surfaces a local web dashboard on `127.0.0.1` for review.

## What this software never does on its own

- Submit an application.
- Click Apply / Next / Continue / Submit on a page.
- Send a message to a recruiter, hiring manager, or interviewer.
- Upload a file to any third-party service that you have not authorized.
- Edit your CV (`cv.md`), portfolio sources, or any file outside the working
  copy of this repo.

The user is the only actor that performs irreversible actions.

## What you are responsible for

- The truth of every claim, metric, and proof point in `cv.md`,
  `article-digest.md`, generated PDFs, and outreach messages.
- Compliance with each target company's terms of service, application
  policies, and any platform you touch (LinkedIn, Indeed, ATS).
- Any contractual obligations to a current employer (non-compete, IP
  assignment, moonlighting clauses) — the runtime does not check those.
- Tax, immigration, and employment-law implications of your applications.

## Third-party services

If you configure backends like Anthropic Claude, OpenAI, OpenRouter, Codex
CLI, Google Gemini, or Gmail OAuth, you are subject to those services'
terms. The runtime's role is limited to forwarding requests on your behalf.

The job postings, company names, salary data, and Glassdoor / Levels.fyi
references this software fetches belong to their respective owners.
`auto-job` performs read-only retrieval for the user's personal evaluation
and stores results locally.

## Honesty rules baked in

The system prompt and prompt templates explicitly forbid:

- Inventing experience, metrics, or proof points.
- Recommending below-market compensation.
- Omitting the source for any cited number.
- Submitting low-fit applications without an explicit user override.

If you observe the runtime producing output that violates these rules,
treat that as a bug and stop using the affected output.

## No warranty

This software is provided "as is", without warranty of any kind. The author
is not responsible for outcomes related to your job search, including but
not limited to: rejected applications, incorrect evaluations, missed
deadlines, contractual disputes, or any consequence of acting on output the
runtime produced.
