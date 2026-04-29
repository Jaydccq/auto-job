# Gmail Tracker Action Panel UX

## Background

The current dashboard Gmail tracker already contains the required information, but its visual priority is too close to a data table with filters. The user wants the tracker to behave like an action panel for application follow-up: first show what needs action, then show which roles are progressing, then make recent job activity easy to inspect.

## Goal

Optimize the dashboard tracker tab so a user can immediately answer:

- What should I handle now?
- Which jobs are progressing best?
- What happened recently for a specific job?

## Scope

In scope:

- Rework the tracker tab layout in `web/template.html`.
- Keep existing dashboard data sources, Gmail signal matching, filters, and local dashboard server behavior.
- Make summary numbers focus on Need attention, Interviewing, OA pending, and Active applications.
- Promote an Action Center above filters.
- Add a clickable pipeline overview by stage.
- Make each application row more compact and action-oriented.
- Make Gmail sync copy user-facing.
- Rebuild `web/index.html`.

Out of scope:

- New Gmail connector behavior or OAuth.
- Persisted snooze/reminder state.
- New tracker statuses or mutations.
- Editing `data/applications.md` or Gmail signal data.

## Assumptions

- This task targets the static dashboard generated from `web/template.html`.
- Existing derived fields such as stage, attention, latest date, and signals are enough to render the first version of the workbench.
- CTA controls can be links/buttons that filter or open existing artifacts; durable actions such as snooze can be visual placeholders unless backed by existing behavior.
- The design should remain visually compatible with the existing newspaper-console dashboard rather than introducing a new design system.

## Uncertainties

- The generated dashboard may have zero Gmail signals in static export; the layout must still communicate Gmail status clearly.
- Some action CTAs such as `Open email thread` cannot deep-link to Gmail unless a signal exposes a usable URL.
- Mobile density needs browser verification because compact application rows can overflow if company or role names are long.

## Implementation Steps

1. Add workbench structure.
   Verify: tracker tab order is summary bar, action center, pipeline overview, then compact application list.
2. Reprioritize summary and Gmail copy.
   Verify: no visible summary stat says `visible`; Gmail status uses connected/synced/failed/static-export language.
3. Replace top opportunities with actionable cards.
   Verify: cards show next step, deadline/update context, and at least one concrete existing action.
4. Add clickable pipeline stage overview.
   Verify: clicking a stage sets the tracker stage filter and rerenders the list.
5. Compact application rows.
   Verify: each row shows company, role, stage, attention, recent contact, latest thread/update, email count, and actions without large vertical labels.
6. Rebuild and test.
   Verify: `npm run dashboard:build` succeeds and browser checks pass at desktop and mobile widths.

## Verification Approach

- `npm run dashboard:build`
- Headless browser smoke check:
  - tracker tab renders action center and pipeline overview
  - summary labels are the four priority metrics
  - stage click filters tracker rows
  - no page-level horizontal overflow at 320, 768, 1024, and 1440 px

## Progress Log

- 2026-04-25: Read project rules, existing Gmail tracker plans, and tracker dashboard code.
- 2026-04-25: Confirmed setup files exist and update check returned offline for local `1.3.0`.
- 2026-04-25: Created this execution plan before implementation.
- 2026-04-25: Reworked tracker tab into Summary Bar, Action Center, Pipeline Overview, and compact Application List.
- 2026-04-25: Changed the primary tracker metrics to Need attention, Interviewing, OA / assessments, and Active applications.
- 2026-04-25: Collapsed lower-priority filters under More filters and kept search/stage/attention/sort as the default controls.
- 2026-04-25: Added clickable stage overview cards that reuse the existing tracker stage filter.
- 2026-04-25: Rebuilt `web/index.html` from `web/template.html`.

## Key Decisions

- Keep this as a presentation-layer change; no new state model or Gmail sync behavior.
- Use existing filters as a collapsed/basic control surface underneath the action and pipeline sections.
- Keep stage filtering through the existing `tracker-status` select so no parallel filter state is introduced.
- Treat `Open thread` as conditional on an existing signal URL; otherwise show only actions backed by current local artifacts.
- Keep static-export Gmail status explicit instead of showing developer-oriented refresh-command copy.

## Risks and Blockers

- Worktree already has unrelated and related uncommitted changes, including `web/template.html` and `web/index.html`; this task must not revert them.
- Some requested CTA labels imply persistence or Gmail deep links that do not yet exist. First pass will expose existing safe actions and leave non-backed actions disabled or omitted.

## Final Outcome

Completed.

Changed files:

- `web/template.html`
- `web/index.html`
- `docs/exec-plans/active/2026-04-25-gmail-tracker-action-panel-ux.md`

Verification run:

- `npm run dashboard:build` succeeded, writing `web/index.html` with 352 reports, 253 applications, 524 pipeline items, and 1,313 scan-history rows.
- Headless Playwright smoke check passed at 1440, 768, and 320 px:
  - Summary labels were `need attention`, `interviewing`, `OA / assessments`, and `active applications`.
  - Action Center rendered 6 cards.
  - Pipeline Overview rendered 6 stage cards.
  - Clicking `Applied` set the existing stage filter to `Applied` and changed shown rows from 145 to 44.
  - No page-level horizontal overflow was detected.
  - No page errors were reported.
