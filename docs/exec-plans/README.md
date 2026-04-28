# Execution Plans

This directory is intentionally compact.

## Layout

- `active/` — currently active execution plans only
- `summaries/` — canonical summaries for completed workstreams
- `archive/` — detailed historical plans retained for audit value
- `tech-debt-tracker.md` — cross-cutting debt log when present

## Operating Rules

- Prefer one active plan per workstream.
- Do not keep completed step-by-step plans in the top-level surface.
- When 3 to 5 related completed plans accumulate, compress them into one summary and move the detail to `archive/`.
- Keep summaries high signal: decisions, verification, open issues, and next steps.

## Current State

- Top-level is navigation only.
- Phase 2 consolidation on 2026-04-27 moved 107 completed scan/evaluation/debug plans out of `active/`.
- Current dated rollups:
  - `summaries/summary-2026-04-17-28-job-evaluations.md`
  - `summaries/summary-2026-04-17-28-scan-operations.md`
  - `summaries/summary-2026-04-17-28-extension-bridge-debugging.md`
- Use `python3 skills/exec-plan-consolidator/scripts/plan_inventory.py` to inspect active-plan sprawl and consolidation candidates.
