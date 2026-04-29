# Fix tracker row 172

## Background

`npm run verify` fails because row `#172` in `data/applications.md` has extra pipe-delimited fields. The report title contains `Backend Engineer | Mimir | USA | Remote`, and those title separators were written into the markdown table as separate columns.

## Goal

Fix row `#172` so it matches the tracker table schema and passes pipeline verification.

## Scope

- Edit only the malformed `#172` tracker row.
- Preserve the report link, score, skip decision, and note.
- Run `npm run verify`.

## Assumptions

- The intended role title is `Backend Engineer, Mimir (USA Remote)` based on `reports/256-grafana-labs-2026-04-17.md`.
- The intended score is `1.3/5`.
- The intended status is `SKIP`.
- No PDF was generated.

## Implementation Steps

1. Confirm the malformed row and source report.
   Verify: inspect `data/applications.md` and report `256`.
2. Rewrite row `#172` to the canonical tracker columns.
   Verify: row has the same column count as the header.
3. Run pipeline verification.
   Verify: `npm run verify`.

## Verification Approach

- Use the existing repository verifier as the acceptance test.
- Also run `git diff --check` before completion.

## Progress Log

- 2026-04-18: Confirmed row `#172` has 12 data cells instead of the expected 9 because the role title contained literal pipe separators.
- 2026-04-18: Rewrote row `#172` to `Backend Engineer, Mimir (USA Remote)` with score `1.3/5`, status `SKIP`, PDF `❌`, and report `[256](reports/256-grafana-labs-2026-04-17.md)`.
- 2026-04-18: Ran `git diff --check`; passed.
- 2026-04-18: Ran `npm run verify`; passed with 0 errors and 3 duplicate warnings.

## Key Decisions

- Preserve the title details by replacing pipe separators with comma/parentheses instead of dropping `Mimir`, `USA`, or `Remote`.

## Risks and Blockers

- The verifier may still report duplicate warnings; warnings do not block success unless they are errors.

## Final Outcome

Completed. Row `#172` now matches the canonical tracker schema, and `npm run verify` reports `0 errors`.

Remaining verifier warnings are duplicate candidates already present in the tracker:

- PayPal: `#61`, `#46`
- Vast.ai: `#31`, `#32`, `#33`
- Anduril Industries: `#3`, `#8`, `#9`
