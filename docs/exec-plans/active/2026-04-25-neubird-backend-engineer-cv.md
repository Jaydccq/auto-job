# NeuBird Backend Engineer CV Generation

## Background

The user provided the NeuBird Backend Engineer posting and asked to generate a
CV for the role. The role is onsite in the San Francisco Bay Area and emphasizes
Agentic AI SRE, backend services, Python APIs, orchestration systems, AI model
integration, performance, reliability, distributed systems, cloud, SaaS,
microservices, and Kubernetes.

## Goal

Generate an English ATS-friendly CV for Hongxi Chen tailored to NeuBird's
Backend Engineer role.

## Scope

- Use `cv.md`, `config/profile.yml`, `modes/_profile.md`, and
  `article-digest.md` as the factual candidate sources.
- Use the user-provided JD text as the only job source.
- Generate local application-ready artifacts under `output/`.
- Do not submit the application or alter tracker state.
- Do not add unsupported skills, employment history, or claims.

## Assumptions

- US onsite role means letter paper format.
- The strongest truthful framing is backend-first AI infrastructure: reliable
  agent orchestration, distributed backend services, observability, and
  real-time systems.
- The candidate can target San Francisco Bay Area onsite roles because
  `config/profile.yml` lists San Francisco as a target city and says the
  candidate is open to onsite opportunities.

## Uncertainties

- The posting does not specify visa sponsorship support.
- The exact ATS keyword weighting is unknown, so the CV targets explicit JD
  requirements and phrasing.
- The job asks for 2-6 years of backend experience; the candidate is an
  early-career MS student, so the CV should emphasize project depth without
  overstating professional tenure.

## Simplest Viable Path

1. Build a tailored HTML CV from the existing HTML template and verified
   candidate evidence.
   Verify: no unresolved template placeholders and no unsupported claims.
2. Render the HTML to PDF with `generate-pdf.mjs`.
   Verify: renderer completes and `file` reports a PDF.
3. Check CV text for NeuBird keyword coverage.
   Verify: terms such as backend services, AI agents, Python, APIs,
   orchestration, distributed systems, cloud, Kubernetes, microservices,
   reliability, observability, and performance are present.
4. Record output paths and verification results in this plan.

## Implementation Steps

- [x] Read repository instructions, candidate profile, source CV, proof-point
  library, template, and PDF generation flow.
- [x] Generate tailored HTML and PDF artifacts.
- [x] Verify PDF validity and keyword coverage.
- [x] Record final outcome and remaining risks.

## Verification Approach

- `rg "\\{\\{" output/cv-neubird-backend-engineer-2026-04-25.html`
- `node generate-pdf.mjs output/cv-neubird-backend-engineer-2026-04-25.html output/cv-neubird-backend-engineer-2026-04-25.pdf --format=letter`
- `file output/cv-neubird-backend-engineer-2026-04-25.pdf output/cv.pdf`
- Extract PDF text and search for the targeted JD keywords.

## Progress Log

- 2026-04-25: Created this execution plan after reading repository
  instructions, `cv.md`, `config/profile.yml`, `modes/_profile.md`,
  `article-digest.md`, `modes/pdf.md`, `templates/cv-template.html`, and prior
  CV-generation plan conventions.
- 2026-04-25: Generated the tailored HTML artifact at
  `output/cv-neubird-backend-engineer-2026-04-25.html`. Placeholder scan passed
  with no unresolved `{{...}}` tokens and no unsupported Go/Golang claim.
- 2026-04-25: Rendered
  `output/cv-neubird-backend-engineer-2026-04-25.pdf` using
  `node generate-pdf.mjs ... --format=letter`; renderer reported 2 pages and
  139.4 KB. Copied the same PDF to `output/cv.pdf` for upload convenience.
- 2026-04-25: Verified both PDFs with `file`; both report PDF 1.4, 2-page
  documents.
- 2026-04-25: `pdftotext` was unavailable, and the system Python did not have
  `pypdf`/`PyPDF2`; used the bundled workspace Python with `pypdf` to verify
  text extraction and keyword coverage. Checks passed for backend, AI agent,
  Python, API, orchestration, distributed systems, cloud, Kubernetes,
  microservices, reliability, observability, performance, Redis, PostgreSQL,
  and Docker.
- 2026-04-25: Added a local email draft at
  `output/neubird-email-draft-2026-04-25.md` for the user's manual send to
  `careers@neubird.ai`.

## Key Decisions

- Lead with backend and agent infrastructure rather than generic AI framing.
- Use the Autonomous Investment Research & Risk Platform, Mini-UPS / Amazon
  World Simulation, Casino Training Pro, and HTTP Caching Proxy Server as the
  most relevant project evidence.
- Keep the research internship concise and emphasize Python/ETL/distributed
  data processing relevance.

## Risks and Blockers

- NeuBird's posting asks for 2-6 years of backend experience; the CV can show
  deep backend project evidence but should not claim full-time backend tenure.
- The posting does not mention sponsorship, so application viability may need
  confirmation before submission.

## Job Description Source

Company: NeuBird

Role: Backend Engineer

Location: Onsite, San Francisco Bay Area

Core role summary: build foundational backend services and orchestration
systems for NeuBird's Agentic AI SRE, an autonomous AI agent that detects,
diagnoses, and resolves production incidents in real time.

Responsibilities:

- Build and scale backend services that power AI-driven automation.
- Develop Python-based APIs and orchestration systems that integrate with AI
  models and agentic workflows.
- Optimize performance, reliability, and resilience across large-scale
  distributed systems.
- Collaborate with AI and product teams to embed intelligence into backend
  services.
- Help drive architectural decisions and engineering best practices in a
  fast-paced environment.

Requirements:

- 2-6 years of strong backend experience building high-performance APIs and
  distributed systems.
- Solid programming skills in Python, Go, or similar languages.
- Knowledge of cloud platforms, SaaS, microservices, and Kubernetes.
- Proven ability to scale and optimize backend systems.
- Curiosity about emerging technologies, with AI/ML integration experience as a
  plus.

## Final Outcome

Generated a NeuBird-tailored ATS CV in English:

- `output/cv-neubird-backend-engineer-2026-04-25.html`
- `output/cv-neubird-backend-engineer-2026-04-25.pdf`
- `output/cv.pdf`
- `output/neubird-email-draft-2026-04-25.md`

The CV uses a backend-first AI infrastructure framing and selects the
Autonomous Investment Research & Risk Platform, Mini-UPS / Amazon World
Simulation, Casino Training Pro, and HTTP Caching Proxy Server as the strongest
truthful evidence for NeuBird's AI SRE/backend orchestration role. Verification
passed for template placeholders, PDF validity, text extraction, and targeted
JD keyword coverage. Remaining risk: NeuBird asks for 2-6 years of backend
experience and does not state sponsorship support, so submission viability may
need confirmation before applying.
