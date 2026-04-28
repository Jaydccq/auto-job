# Company-Aware Application Tailoring

## Background

The current application-document generator no longer leaks raw report prose
into CVs and cover letters, but its role-shaping model is still too narrow. It
mainly detects ML/data/systems themes, so design-led full-stack product roles
such as Figma are overfit toward AI infrastructure, low-latency systems, and ML
evaluation instead of product craft, polished front-end work, real-time
collaboration, extensibility, and cross-functional delivery.

## Goal

Make generated application documents company- and JD-aware enough to produce
very different narratives for product full-stack roles versus ML/platform
roles, while still keeping `cv.md` unchanged.

## Scope

- Update `web/dashboard-server.mjs` theme detection and tailoring logic.
- Keep `cv.md` as the durable factual source.
- Reuse the current HTML CV template order.
- Use Figma as the main validation case for this iteration.

## Assumptions

- Evaluation reports are still useful as structured JD signal sources, but
  report archetype labels should not dominate applicant-facing document output.
- Generated output may use idealized packaging when the user explicitly asks
  for a stronger, role-optimized presentation.
- Figma's live Greenhouse JD is the source of truth for this refinement.

## Implementation Steps

1. Expand theme detection beyond ML/data/systems.
   Verify: Figma turns on product/front-end/realtime/extensibility themes.
2. Rework project selection to cover the dominant role themes.
   Verify: Figma chooses collaboration/product/extensibility projects rather
   than ML-platform-only projects.
3. Rebuild project descriptions, bullet rewrites, and skills curation around
   those themes.
   Verify: Figma output emphasizes React/TypeScript, real-time collaboration,
   APIs/extensibility, and product craft while pruning irrelevant skills.
4. Rebuild cover-letter composition for product/design-driven companies.
   Verify: Figma cover letter reads like a full-stack product-engineering
   application, not an AI-infra application.
5. Run targeted Figma smoke checks.
   Verify: generated docs omit AI-infra-heavy framing and include the expected
   Figma-aligned narratives.

## Verification Approach

- `node --check web/dashboard-server.mjs`
- Generate Figma CV/cover-letter artifacts through local helper execution
  against `reports/320-figma-2026-04-23.md`.
- Inspect generated HTML/JSON outputs for:
  - selected projects
  - skills pruning
  - cover-letter tone
  - absence of internal-report leakage
- `git diff --check -- web/dashboard-server.mjs docs/exec-plans/active/2026-04-23-company-aware-application-tailoring.md`

## Progress Log

- 2026-04-23: Read Figma's live Greenhouse JD and confirmed the role centers
  on full-stack product engineering, polished front-end experiences, realtime
  collaboration, extensibility, and cross-functional product work.
- 2026-04-23: Read `reports/320-figma-2026-04-23.md` and confirmed the current
  evaluation archetype (`AI Forward Deployed Engineer + Technical AI Product
  Manager`) would distort applicant-facing document generation if used too
  directly.
- 2026-04-23: Added explicit design-led full-stack themes, project-ranking
  heuristics, project-bullet rewrites, focus-term curation, and cover-letter
  branching in `web/dashboard-server.mjs` so Figma-style roles prioritize
  product craft, real-time collaboration, frontend quality, and extensibility
  over AI-infra-heavy framing.
- 2026-04-23: Revalidated the Figma tailored output offline against
  `reports/320-figma-2026-04-23.md`; the generated CV now selects `Casino
  Training Pro`, `Mini-UPS / Amazon World Simulation Project`, and
  `Autonomous Investment Research & Risk Platform` in that order, with the
  third project repackaged as an MCP-style extensibility platform.
- 2026-04-23: Generated fresh Figma artifacts at
  `output/cv-figma-software-engineer-full-stack-2026-04-23.pdf` and
  `output/cover-letter-figma-software-engineer-full-stack-2026-04-23.pdf`.

## Key Decisions

- Treat report archetype labels as evaluation-only metadata, not direct
  applicant-facing content signals.
- Add explicit product/full-stack themes rather than trying to approximate them
  through existing ML/system heuristics.
- Use Figma as the forcing function for company-aware narrative branching.
- For design-led product roles, rank directly user-facing collaboration and
  frontend projects above API-only or AI-heavy projects, then use extensibility
  work as supporting evidence rather than the lead story.
- Use curated focus-term allowlists for design-led roles so generated project
  focus lines stay semantic and ATS-friendly instead of drifting into generic
  JD noise.

## Risks and Blockers

- Overfitting too specifically to Figma would weaken other roles, so the new
  logic should generalize to similar design-led or product-heavy full-stack JDs.
- More aggressive idealized packaging requires careful pruning so the output
  stays coherent and does not look like pasted recruiter feedback.
- Cover-letter PDF generation required an escalated rerun outside the sandbox
  because Playwright Chromium startup hit a macOS Mach-port permission error in
  the restricted environment.

## Final Outcome

Completed. The application-document flow now branches cleanly between ML/system
roles and design-led product roles. For Figma, the generated CV/cover letter no
longer read like an AI-infrastructure application: the CV foregrounds
`Casino Training Pro`, `Mini-UPS`, and an MCP-style extensibility platform in
that order; the skill tags are pruned to relevant full-stack/product signals;
and the cover letter now leads with product craft, real-time collaboration, and
cross-functional company fit.
