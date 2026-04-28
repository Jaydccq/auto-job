# Google Edge TPU Compilers Evaluation

## Background

Batch bridge run `Kb_OI4mVk41cAvYdVR1ox` needs a full evaluation for Google's
`Software Engineer, Edge TPU Compilers, Silicon` role using the cached JD file,
`cv.md`, and `article-digest.md`. The run must produce a markdown report, a
tracker addition, and a final JSON payload. PDF generation is explicitly not
confirmed for this run.

## Goal

Generate `reports/396-google-2026-04-26.md` plus the matching tracker TSV row,
then emit valid JSON with the real evaluation result and metrics.

## Scope

- Read the cached JD and repository proof sources.
- Evaluate the role across blocks A-G and write the report markdown.
- Write the tracker addition TSV row only.
- Skip PDF generation because the run does not confirm it.
- Emit the final JSON payload last.

## Assumptions

- The cached JD file is the source of truth for the role data.
- Sponsorship is a risk note, not a hard blocker, because the JD does not
  explicitly deny sponsorship.
- The candidate's strongest proof points are the AI agent platform, distributed
  systems work, low-level C/C++ systems projects, and inference-oriented
  Battleship / ML evaluation work.

## Implementation Steps

1. Read the cached JD, CV, article digest, scan history, and tracker state.
   Verify: role facts, proof points, and sequential tracker number are known.
2. Draft the full report with the required sections.
   Verify: the markdown matches the bridge format and omits draft answers if the
   score stays below 4.5.
3. Write the tracker addition TSV row.
   Verify: row format is 9 tab-separated columns with the correct sequential
   number.
4. Run lightweight validation.
   Verify: report and TSV files exist, and the JSON payload fields are filled
   from repo-derived facts.

## Verification Approach

- `git diff --check`
- spot-check the generated report and tracker row
- confirm the final JSON payload references the written files

## Progress Log

- 2026-04-26: Created the execution plan after confirming the cached JD and the
  repository source files exist.
- 2026-04-26: Current state: collecting proof points and writing the report and
  tracker artifacts for the bridge run.

## Key Decisions

- Keep the run report-only and tracker-only; do not generate a PDF without
  explicit confirmation.
- Treat sponsorship as a clarification risk rather than a blocker because the
  cached JD does not explicitly deny it.
- Frame the role as a compiler / low-level AI systems match rather than a pure
  generalist SWE role.

## Risks and Blockers

- The role is specialized in embedded compilers and accelerator inference, so
  the candidate's direct experience is adjacent rather than exact.
- The report must avoid inventing MLIR/LLVM or device-software experience that
  is not present in the repository.

## Final Outcome

Pending.
