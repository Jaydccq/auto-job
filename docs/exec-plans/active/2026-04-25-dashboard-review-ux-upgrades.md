# Dashboard Review UX Upgrades

## Background

The previous dashboard pagination pass added paging to Reports, Tracker, Pipeline, and Scan History. A follow-up UI audit showed remaining long surfaces and missing summarization:

- Apply Next still renders all cards and can reach very long page heights.
- Keyword Coverage renders large skill buckets without paging.
- Existing pagination has no first/last or direct page jump.
- Filtered tables show counts but not enough aggregate context for quick triage.

## Goal

Improve the dashboard as a working review console: make every large section paginated, make page navigation faster, and add lightweight summaries that help classify filtered results.

## Scope

- Extend pagination controls with first, previous, page jump, next, and last.
- Apply pagination to Apply Next sections and Keyword Coverage buckets.
- Add filtered summary strips for Reports, Tracker, Pipeline, and Scan History.
- Preserve current data sources, static dashboard architecture, and existing actions.
- Rebuild `web/index.html`.

Out of scope:
- Editing tracker data, scanner logic, reports, or profile material.
- Server-side persistence for dashboard-only UI state.
- Large redesigns unrelated to browsing and triage.

## Assumptions

- Client-side pagination remains acceptable because all dashboard data already lives in `window.DATA`.
- Local dashboard UI state can reset to page 1 after filters and sorting.
- Summary strips should be derived from the currently filtered rows, before pagination.

## Implementation Steps

1. Enhance shared pagination controls.
   Verify: First/Prev/Next/Last and direct page input clamp to valid page ranges.
2. Paginate Apply Next and Keyword Coverage.
   Verify: Each large bucket renders only its configured page size.
3. Add summary strips for filtered sections.
   Verify: Summaries update after filtering and sorting.
4. Rebuild static dashboard.
   Verify: `npm run dashboard:build` succeeds.
5. Run browser smoke checks at desktop and mobile widths.
   Verify: No page errors, pagination works, and mobile has no page-level horizontal overflow.

## Verification Approach

- `npm run dashboard:build`
- Headless Playwright smoke checks for pagination and page counts.
- Headless Playwright responsive checks at 320, 768, 1024, and 1440 px.

## Progress Log

- 2026-04-25: Audited current generated dashboard with Playwright metrics; identified Apply Next and Keyword Coverage as remaining long pages.
- 2026-04-25: Added pagination to Apply Next buckets and Keyword Coverage buckets.
- 2026-04-25: Enhanced shared pagination with First, Prev, direct page input, Next, and Last controls.
- 2026-04-25: Added filtered summary strips to Reports, Tracker, Pipeline, and Scan History.
- 2026-04-25: Added quick-view preset buttons for common report, tracker, pipeline, and scan review workflows.
- 2026-04-25: Added search input accessible names and table empty states.
- 2026-04-25: Rebuilt `web/index.html` and verified interactions with headless Playwright.

## Key Decisions

- Keep the existing newspaper-console visual language rather than introducing a separate design system.
- Use derived summary cards instead of charts to keep the static HTML simple and dense.
- Keep dashboard-only quick views as client-side presets because they do not change canonical tracker data.
- Use smaller default page sizes for card/grid-heavy sections so mobile review does not become another long scroll.

## Risks and Blockers

- `web/index.html` is generated and already had pre-existing modifications in the worktree before this task.

## Final Outcome

Completed.

Verification run:

- `npm run dashboard:build` succeeded with 345 reports, 248 applications, 508 pipeline items, and 1274 scan-history rows.
- Playwright interaction smoke check passed:
  - Tracker `Ready 4+` preset sets Status to `Evaluated`, min score to `4`, renders rows, and shows 4 summary cards.
  - Pipeline `Pending` preset activates the pending toggle.
  - Scan `Promoted` preset sets status to `promoted`.
  - Scan direct page input moves to page 3.
  - Apply Next renders 8 visible cards across paged buckets.
  - Keyword Coverage renders 42 visible keyword items across paged buckets.
- Responsive Playwright check at 320, 768, 1024, and 1440 px passed for Apply Next, Tracker, Keywords, and Scan with no page-level horizontal overflow.
