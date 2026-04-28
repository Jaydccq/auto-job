# Resolve AI CV Generation Execution Plan

## Background

The user provided the Resolve AI AI Agent Engineer posting and asked for a
tailored `cv.pdf` plus the application response to "Why do you want to work at
Resolve AI?" The role emphasizes autonomous AI production engineering,
production troubleshooting, customer outcomes, backend/distributed systems,
cloud infrastructure, observability, CI/CD, Kubernetes, databases, messaging,
and LLM-powered autonomous workflows.

## Goal

Generate an English ATS-friendly PDF CV for Hongxi Chen tailored to Resolve AI's
AI Agent Engineer role, and draft a concise, role-specific "Why Resolve AI?"
answer for the application.

## Scope

- Use `cv.md` and `config/profile.yml` as the factual source of truth.
- Use the user-provided JD text as the only job source.
- Generate the PDF under `output/`, including an upload-friendly `output/cv.pdf`.
- Store the application-answer draft under `output/`.
- Do not submit the application or alter tracker state.
- Do not add unsupported skills or claims.

## Assumptions

- US on-site role means letter paper format.
- The strongest truthful CV framing is AI agent systems plus production
  reliability, distributed backend, observability, and customer-outcome
  ownership.
- Hongxi is comfortable relocating/on-site because `config/profile.yml` says he
  is open to on-site opportunities and targets San Francisco.

## Uncertainties

- The application portal may rename the uploaded file to `Hongxi_Chen_resume`;
  this does not affect the local artifact.
- Resolve AI's exact ATS keyword list is unknown, so the CV targets the
  explicit responsibilities and requirements in the provided JD.

## Simplest Viable Path

1. Build a tailored HTML CV from the existing template styling and verified
   `cv.md` evidence.
   Verify: generated HTML contains no unresolved placeholders and no unsupported
   claims.
2. Render the HTML with `generate-pdf.mjs`.
   Verify: `file` reports a PDF and the renderer reports page count and size.
3. Extract text from the PDF and check JD keyword coverage.
   Verify: core terms such as AI agents, production troubleshooting,
   observability, AWS, Kubernetes, CI/CD, distributed systems, databases,
   messaging, LLM, RAG, and evaluations are present.
4. Save the "Why Resolve AI?" answer as a versioned repository artifact.
   Verify: answer is specific to Resolve AI and grounded in Hongxi's existing
   experience.

## Implementation Steps

- [x] Read repository instructions, PDF mode, profile, CV, template, and PDF
  renderer.
- [x] Generate tailored HTML and PDF artifacts.
- [x] Verify PDF validity and text/keyword coverage.
- [x] Save and review the application answer draft.
- [x] Record final outcome and remaining risks.

## Verification Approach

- `node generate-pdf.mjs /tmp/cv-hongxi-chen-resolve-ai.html output/cv-resolve-ai-ai-agent-engineer-2026-04-24.pdf --format=letter`
- `file output/cv-resolve-ai-ai-agent-engineer-2026-04-24.pdf output/cv.pdf`
- `pdftotext output/cv.pdf - | rg -i "...keywords..."`
- Check generated HTML for unresolved `{{...}}` placeholders.

## Progress Log

- 2026-04-24: Created this plan after reading `CLAUDE.md`,
  `docs/CODEX.md`, `modes/pdf.md`, `cv.md`, `config/profile.yml`,
  `templates/cv-template.html`, `generate-pdf.mjs`, and the current exec-plan
  conventions.
- 2026-04-24: Generated tailored HTML at
  `/tmp/cv-hongxi-chen-resolve-ai.html` with no unresolved template
  placeholders.
- 2026-04-24: Rendered
  `output/cv-resolve-ai-ai-agent-engineer-2026-04-24.pdf` with
  `node generate-pdf.mjs ... --format=letter`, then copied it to
  `output/cv.pdf` for upload convenience. Renderer reported 3 pages and
  153.7 KB.
- 2026-04-24: Verified both PDF files with `file`; both report as PDF 1.4,
  3-page documents.
- 2026-04-24: `pdftotext` was unavailable, so text extraction used bundled
  Python plus `pypdf`. Keyword checks passed for AI Agents, LLM, RAG,
  production troubleshooting, observability, AWS, Kubernetes, CI/CD,
  distributed systems, high-concurrency, databases, messaging, evaluation,
  customer outcomes, and system design.
- 2026-04-24: Saved the local application-answer draft to
  `output/resolve-ai-application-answers-2026-04-24.md` and recorded the
  durable draft below because `output/` is intentionally gitignored.
- 2026-04-24: Added an email draft at
  `output/resolve-ai-email-draft-2026-04-24.md` and recorded the durable draft
  below because `output/` is intentionally gitignored.

## Application Answer Draft

### Why Resolve AI?

I want to work at Resolve AI because the problem is both technically deep and
immediately useful: engineering teams lose enormous time debugging production
systems, and an autonomous AI Production Engineer can only work if it combines
LLM reasoning with real observability, infrastructure context, reliable state,
and measurable customer outcomes. That is the kind of AI system I want to build.

Resolve AI also stands out because of the OpenTelemetry and Splunk Observability
lineage. The team is not treating AI agents as a demo layer; it is applying them
to the operational workflows where correctness, trust, and end-to-end ownership
matter most.

My strongest projects map directly to that direction. I have built an AI agent
platform with RAG, typed tools, queued ingestion, streaming, Redis-backed state
transitions, Prometheus telemetry, and replayable audit logs, plus distributed
backend systems with RabbitMQ, Redis, WebSockets, AWS deployment, and CI/CD. I
am excited by a role where I can work directly with customers, understand their
production failures, build the fix myself, and evaluate whether the solution
actually improves their experience.

## Email Draft

### Subject

AI Agent Engineer application - Hongxi Chen

### Body

Hi Resolve AI team,

I am writing to express my interest in the AI Agent Engineer role in San
Francisco. Resolve AI stands out to me because it is applying autonomous AI to
one of the highest-leverage problems in engineering: production troubleshooting
and software maintenance. The combination of AI agents, observability context,
infrastructure workflows, and measurable customer outcomes is exactly the kind
of system I want to build.

I am completing my M.S. in Software Engineering at Duke and have built
production-style AI and distributed systems, including an AI agent platform with
RAG, typed tool orchestration, queued ingestion, SSE streaming, Redis-backed
state transitions, Prometheus telemetry, and replayable audit logs. I have also
built high-concurrency backend systems with RabbitMQ, Redis, WebSockets, AWS
deployment, CI/CD, and performance instrumentation.

What especially interests me about Resolve AI is the chance to own the full arc:
understand a customer's production problem, define the technical scope and
success criteria, build the solution, and evaluate whether it actually improves
the customer's workflow. I would be excited to bring my AI systems, backend, and
production reliability experience to the team.

I have attached my resume for your review. Thank you for your time, and I would
welcome the opportunity to speak with you.

Best,

Hongxi Chen

## Key Decisions

- Lead the CV with FinSentinel because it is the strongest evidence for AI
  agent workflows, RAG, tool orchestration, streaming, observability, and
  evaluation-adjacent engineering.
- Use Mini-UPS, HTTP Caching Proxy, and Operating Systems/Concurrency as the
  core backend/distributed-systems proof for reliability, messaging,
  high-concurrency, and production troubleshooting.
- Mention Kubernetes only in skills, where it already exists in `cv.md`, not as
  a project implementation claim.

## Risks and Blockers

- Hongxi's direct industry experience is below the JD's 4+ year preference; the
  CV should emphasize production-style systems and measurable project outcomes
  without overstating professional tenure.
- The role is on-site in San Francisco and may require sponsorship support; this
  should be handled honestly in the application process.

## Final Outcome

Generated and verified the Resolve AI tailored CV:

- `output/cv-resolve-ai-ai-agent-engineer-2026-04-24.pdf`
- `output/cv.pdf`

Also generated the local application-answer draft:

- `output/resolve-ai-application-answers-2026-04-24.md`
- `output/resolve-ai-email-draft-2026-04-24.md`

Remaining risk: the CV is intentionally honest about experience and does not
hide that Hongxi is still completing the Duke M.S.; Resolve AI's 4+ year
industry-experience preference remains the main fit risk.
