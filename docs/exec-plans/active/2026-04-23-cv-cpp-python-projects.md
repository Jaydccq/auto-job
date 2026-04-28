# CV C++ and Python Project Integration

## Background

The user provided two interview PDFs outside the repository:
`/Users/hongxichen/Downloads/interview/c_cpp_experience_summary.pdf` and
`/Users/hongxichen/Downloads/interview/python_experience_profile_detailed_en.pdf`.
The repository policy requires durable project facts to be reflected in repo
artifacts before they are relied on.

## Goal

Update `cv.md` so the resume includes one strong standalone C/C++ systems
project, preserves the existing HTTP caching proxy project, includes one
strong Python/PyTorch machine-learning systems project synthesized from the
provided materials, and adds a compact Python AI Battleship project from the
user-provided project description.

## Scope

- Edit user-layer resume content only.
- Preserve existing resume structure and style.
- Avoid claims not supported by the provided PDFs.
- Do not modify templates, scripts, tracker rows, or job reports.

## Assumptions

- The two PDFs are reliable source material for this resume update.
- A concise resume should include one consolidated non-proxy C/C++ systems
  project and one consolidated Python/ML systems project rather than every
  underlying coursework task.
- The existing `HTTP Caching Proxy Server` should remain a separate project.
- The user-provided Battleship project description is source material for the
  new resume project entry.
- Existing metrics already present in `cv.md` may remain if they are not touched.

## Implementation Steps

1. Read project instructions, current resume, profile, and PDF materials.
   Verify: source files and extracted PDF text are inspected.
2. Draft project entries using only supported claims.
   Verify: C/C++ entry covers systems, concurrency, memory, and OS work without
   replacing the existing HTTP proxy project; Python entry covers ML pipelines,
   PyTorch, vision, optimization, and generative modeling.
3. Add a compact Battleship AI project entry from the user-provided long-form
   material.
   Verify: entry preserves quantified outcomes while avoiding long-form detail.
4. Update `cv.md` surgically.
   Verify: only the project and skill text required by the request changes.
5. Run targeted validation.
   Verify: `bun run sync-check`, markdown structure checks, and grep checks for
   excluded unsafe claims.
6. Record outcome in this plan.
   Verify: progress log, key decisions, risks, and final outcome are current.

## Verification Approach

- `bun run sync-check`
- Markdown structure scan for expected project headings.
- Search `cv.md` for unsupported claims such as LoRA, PEFT, adapter tuning, and
  LLM fine-tuning.
- Search `cv.md` for the expected Battleship title and key quantified outcomes.

## Progress Log

- 2026-04-23: Read `CLAUDE.md`, `docs/CODEX.md`, `cv.md`, `config/profile.yml`,
  `article-digest.md`, and the relevant CV generation guidance.
- 2026-04-23: Ran the Auto-Job update check; the system is up to date.
- 2026-04-23: Noted a pre-existing unrelated modification in
  `docs/exec-plans/active/2026-04-23-apply-next-document-downloads.md` and left
  it untouched.
- 2026-04-23: Extracted both PDFs with bundled Python `pypdf`. The Python PDF
  explicitly says not to claim direct LoRA, PEFT, adapter tuning, or LLM
  fine-tuning based on this evidence.
- 2026-04-23: Updated `cv.md` with a new Python Machine Learning, Vision &
  Generative Modeling Portfolio entry and expanded the existing C++ proxy entry
  into a consolidated C/C++ Systems Programming & HTTP Proxy Platform entry.
- 2026-04-23: Updated `cv.md` skill keywords for directly supported Python/ML,
  computer vision, C/C++ systems, and performance-evaluation terms.
- 2026-04-23: Confirmed `cv.md` is intentionally ignored by `.gitignore` as a
  personal user-layer file, so the content change is local rather than visible in
  ordinary `git diff`.
- 2026-04-23: `bun run sync-check` passed.
- 2026-04-23: `rg -n "LoRA|PEFT|adapter tuning|adapter[- ]?tuning|fine[- ]?tuning|LLM fine" cv.md`
  returned no matches.
- 2026-04-23: `rg -n "Python Machine Learning|C/C\+\+ Systems|PyTorch|xv6|pthreads|PASCAL VOC|Gaussian-Bernoulli" cv.md`
  found the expected project headings and source-backed keywords.
- 2026-04-23: User clarified not to delete the existing
  `HTTP Caching Proxy Server` project and asked for a separate C++ project.
- 2026-04-23: Split the earlier combined C/C++ proxy entry into two projects:
  `C/C++ Systems Programming Portfolio` for allocator, pthreads, xv6, and OS
  work, plus the restored standalone `HTTP Caching Proxy Server`.
- 2026-04-23: Rewrote the Python project as `Machine Learning & Computer Vision
  System Portfolio`, emphasizing data pipelines, PyTorch training workflows,
  model orchestration, and evaluation frameworks instead of a coursework-style
  algorithm list.
- 2026-04-23: Removed student-facing phrasing such as `Academic Project
  Portfolio` and avoided `from scratch` wording in the Python project.
- 2026-04-23: Kept PASCAL VOC in the computer-vision bullet as dataset context
  and removed it from the Python tech stack.
- 2026-04-23: Replaced `real-time feature extraction` with `CNN feature
  extraction` because the provided material supports the latter more directly.
- 2026-04-23: `bun run sync-check` passed after the revision.
- 2026-04-23: `rg -n "Machine Learning & Computer Vision System Portfolio|C/C\+\+ Systems Programming Portfolio|HTTP Caching Proxy Server|Academic Project Portfolio|from scratch|LoRA|PEFT|adapter tuning|adapter[- ]?tuning|fine[- ]?tuning|LLM fine" cv.md`
  found only the three expected project headings.
- 2026-04-23: User provided C/C++ rewrite guidance to shift from
  mechanism-driven phrasing toward impact-oriented systems/infrastructure
  positioning.
- 2026-04-23: Renamed the standalone C/C++ project to `Operating Systems &
  Concurrency Project Portfolio` and rewrote bullets around memory safety,
  fragmentation risk, writer starvation, copy-on-write memory behavior, and
  systems validation/debugging.
- 2026-04-23: Did not add unsupported numeric metrics such as percentage
  fragmentation reduction, 100% stress-test pass rate, or zero memory leaks
  because those exact results are not present in the source materials.
- 2026-04-23: User provided final Python polish guidance to remove the redundant
  subtitle, foreground harness-engineering, and reduce dense algorithm/model
  enumeration.
- 2026-04-23: Updated the Python project to say `Architected and
  harness-engineered`, tightened PyTorch pipeline and computer-vision bullets,
  and consolidated generative modeling terms into broader architecture families.
- 2026-04-23: Avoided the phrase `from the ground up` to preserve the earlier
  decision to remove student-facing `from scratch`-style wording.
- 2026-04-23: User provided a long-form Battleship AI project description and
  asked to add a shorter correct Python AI project version.
- 2026-04-23: Added `Battleship AI Agent` as a standalone compact resume entry
  covering the custom Gymnasium POMDP environment, Monte Carlo solver, DAgger CNN
  policy, R2D2/DRQN negative result, ablation framework, and Java backend
  inference service integration.
- 2026-04-23: Added directly supported Battleship-related skills to the Data,
  AI & Geospatial skills line: Stable-Baselines3, Gymnasium, Reinforcement
  Learning, Imitation Learning, DAgger, and Monte Carlo inference.
- 2026-04-23: User asked to foreground the Battleship ablation framework,
  serving integration, and latency/performance tradeoff while compressing the
  R2D2/DRQN negative-result discussion.
- 2026-04-23: Reordered Battleship bullets so the parallel ablation/evaluation
  harness and Java backend JSON serving integration appear before algorithm
  details; compressed R2D2/DRQN into a value-learning instability diagnosis.
- 2026-04-23: Did not add CI/CD or AI-agent-generated test claims because the
  provided Battleship material supports pytest invariants and parallel
  experiment automation, but not those specific workflows.

## Key Decisions

- Use `cv.md` as the primary changed artifact because it is the resume source of
  truth for Auto-Job generation flows.
- Keep the existing C++ HTTP proxy project as its own project because the user
  wants it preserved as a distinct resume proof point.
- Add a separate C/C++ systems project for allocator, synchronization, xv6, and
  OS-level work instead of mixing those bullets into the proxy project.
- Add one Python/PyTorch ML project rather than several small coursework-style
  entries to keep the resume scan-friendly.
- Remove `scikit-learn` from the drafted Python tech stack because the extracted
  PDF text did not directly support it.
- Use the Python rewrite direction closest to Software Engineer / Data Engineer
  positioning: pipeline design, training infrastructure, workflow orchestration,
  and evaluation systems.
- In the final Python polish, prefer scan-friendly systems language and broader
  architecture families over dense lists of every model variant.
- Use impact-oriented C/C++ language, but keep claims bounded to supported
  outcomes rather than invented performance metrics.
- For the Battleship entry, keep the resume version compact and quantified:
  retain the baseline/result metrics and production integration, but omit
  long-form implementation sub-bullets better suited to portfolio or LinkedIn.
- In the Battleship project, lead with systems evidence: evaluation harness,
  serving integration, and latency tradeoff before deeper algorithmic diagnosis.

## Risks and Blockers

- No blocker. The main residual risk is that `cv.md` is intentionally ignored by
  Git for privacy, so preserving the exact resume content in version control
  would require an explicit repository policy change or force-add.

## Final Outcome

`cv.md` now includes a rewritten Python/PyTorch ML systems project, a compact
Battleship AI Python project, a separate Operating Systems & Concurrency C/C++
project, and the restored standalone HTTP caching proxy project. Directly
supported skill keywords remain in place. Targeted validation passed and unsafe
excluded ML claims were not introduced.
