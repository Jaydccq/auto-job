# Design: Settings tabs — executor switcher + personal files editor

**Status:** approved by user 2026-05-05
**Skill:** brainstorming → writing-plans

## Problem

Two recent gaps in the desktop app surfaced from real use:

1. Switching between codex / claude / openrouter today requires either editing
   settings.json by hand or restarting the bridge from a terminal with env
   vars. The Settings window has a backend dropdown but no model / reasoning
   knobs and never restarts the bridge on save.
2. The user's "personal" files (`cv.md`, `config/profile.yml`,
   `modes/_profile.md`, `portals.yml`, `article-digest.md`) are gitignored and
   only editable from a terminal. Tuning anything in there means leaving the
   app and finding the file path.

## Scope

**In scope (Option A + B from chat):**
- Free executor switching in the app: codex / claude / openrouter / fake. Each
  with its model + reasoning-effort fields where applicable. Save persists to
  `~/.config/auto-job/settings.json` and triggers a bridge restart so the new
  executor takes effect within ~2 s.
- Personal files editor: pick from a 5-file allowlist; textarea editor; yaml
  syntax validation on save; pre-write backup; 1 MB cap.
- Tab strip in the Settings window so it doesn't grow into a single
  unscrollable page (4 tabs: General / New-grad / Personal files / Bridge).

**Out of scope (YAGNI):**
- Monaco / CodeMirror editor (bundle bloat, textarea is enough for ad-hoc
  edits).
- Per-evaluation executor override (would require server contract changes;
  user accepted the restart-based UX).
- Auto-cleanup of backup files.
- Editing files outside the 5-file allowlist.

## Architecture

```
apps/desktop/src/
├── settings.ts            ← Settings interface gains codexModel /
│                            codexReasoningEffort / anthropicModel
├── main.ts                ← startup: settings → env vars before
│                            createServer; settings:save delta-detect →
│                            restartServer when backend/model changed
├── personal-files.ts (NEW)
│   ├── ALLOWLIST: { id, relPath, kind: 'yaml' | 'markdown' }[]
│   ├── readPersonalFile(repoRoot, id)
│   ├── writePersonalFile(repoRoot, id, content)  // yaml lint + backup
│   └── backupDir(): ~/.auto-job/personal-files-backups
├── settings-window.ts     ← new IPC handlers:
│   ├── personal-files:list
│   ├── personal-files:read
│   ├── personal-files:save
│   └── existing settings:save now schedules restart on delta
├── settings-preload.ts    ← exposes the 3 personal-files calls + the
│                            extended save payload
└── settings-window.html   ← tab strip + 4 tab panes
```

The bridge itself is unchanged. All routing happens in the desktop process.

## Key decisions

### 1. settings.json schema

Extend `Settings` with three optional fields:

```ts
interface Settings {
  backend: Backend;
  startAtLogin: boolean;
  openrouterModel: string;       // existing
  codexModel?: string;            // NEW; null = use bridge default
  codexReasoningEffort?: string;  // NEW; null = use bridge default
  anthropicModel?: string;        // NEW; null = use bridge default
}
```

Empty string ⇒ unset. Whitespace trimmed before persisting.

### 2. settings → env var translation (main.ts startup)

Before `createServer()`:

```
settings.codexModel       → process.env.AUTO_JOB_CODEX_MODEL
settings.codexReasoningEffort → process.env.AUTO_JOB_CODEX_REASONING_EFFORT
settings.anthropicModel   → process.env.ANTHROPIC_MODEL
```

If a field is unset, no env-var override (bridge falls back to its built-in
defaults). This keeps settings.json cleanly representing "what the user has
explicitly chosen, not defaults".

### 3. Restart-on-save delta detection

`settings:save` handler computes a "needs-restart" flag:

```
needsRestart =
  newBackend !== oldBackend ||
  newCodexModel !== oldCodexModel ||
  newCodexReasoningEffort !== oldCodexReasoningEffort ||
  newAnthropicModel !== oldAnthropicModel ||
  newOpenrouterModel !== oldOpenrouterModel
```

If `needsRestart`, call `tray.onRestart()` (already exists) after persistence.
The Save button label switches between "Save" and "Save & Restart bridge"
based on whether any of those fields differ from the loaded values.
`startAtLogin` and personal-files don't trigger restart.

### 4. Personal files allowlist

A `PERSONAL_FILES` constant in `personal-files.ts`:

```ts
[
  { id: "cv",          relPath: "cv.md",                kind: "markdown" },
  { id: "profile",     relPath: "config/profile.yml",   kind: "yaml" },
  { id: "mode-profile", relPath: "modes/_profile.md",   kind: "markdown" },
  { id: "portals",     relPath: "portals.yml",          kind: "yaml" },
  { id: "digest",      relPath: "article-digest.md",    kind: "markdown" },
]
```

Renderer never sends paths — only `id`. Main resolves
`${AUTO_JOB_REPO_ROOT}/${relPath}` after asserting the id matches an entry.
This blocks path traversal attacks from the renderer.

### 5. Backup before write

```
backupRoot = ~/.auto-job/personal-files-backups
filename   = <id>.<unix_ms>.bak
```

Backup happens before every write, even when content is unchanged. Skipped
when the file doesn't yet exist (first creation). Backups never auto-deleted
(out of scope). User can manually `rm -rf ~/.auto-job/personal-files-backups`.

### 6. yaml validation

Before write, if `kind === "yaml"`, run `yaml.parse(content)`. On parse error,
return `{ ok: false, error: <message> }` to renderer so it can render
`error.message` (parser includes line/col). The file is **not** written.
Markdown files skip validation.

### 7. 1 MB cap

Both read and write check `Buffer.byteLength(text, "utf-8") <= 1_048_576`.
Read returns `{ ok: false, error: "file > 1 MB" }`; write returns the same.
1 MB is generous for these files (cv.md is ~5 KB, profile.yml is ~12 KB).

## UI

### Tab strip

Top of Settings window, four pills:

```
General | New-grad | Personal files | Bridge
```

Click switches `display: none` on `<section data-tab="..."`. Selected tab
gets a darker pill background. State stored in DOM only — closing and
reopening the window resets to General. (No need to persist; tabs are
discoverable via the strip.)

### General tab

```
Bridge status card (status + URL + version)
─────
Evaluation backend [select]
  ├─ codex
  │  ├─ Codex model [select: gpt-5.4-mini / gpt-5.4 / gpt-5.4-pro]
  │  └─ Reasoning effort [select: low / medium / high]
  ├─ claude
  │  └─ Anthropic model [select: claude-sonnet-4-6 / opus-4-7 / haiku-4-5]
  ├─ openrouter
  │  └─ (existing key + model selector)
  └─ fake (no extras)
─────
[ ] Start Auto Job at login
```

The Bridge status card moves out of its current standalone position into the
General tab, since it logically belongs with executor settings.

### New-grad tab

Existing 4 number inputs + 2 checkboxes + helper text. No change.

### Personal files tab

```
File [select: cv.md / profile.yml / modes/_profile.md / portals.yml / article-digest.md]
[textarea, monospace, 32 cols × 22 rows, tab=2 spaces]
[Save this file]   ← separate from the global Save & Restart
helper: "Saves a backup to ~/.auto-job/personal-files-backups/ before write."
```

Personal-file Save is its own button so the user doesn't have to switch tabs
or worry about restart side-effects. Edit indicator: button enabled only when
content differs from loaded value.

### Bridge tab

Detailed health card (mode, executor, deps, token preview, refresh). Same
content as today's full Bridge status section, just moved into a tab.

## Error handling

- Settings save fails (file write error) → show inline `<div class="error">`,
  don't close window, don't trigger restart.
- Bridge restart fails → log to console (already done), tray state goes to
  "errored", user can hit "Restart Server" from tray.
- Personal file read > 1 MB → tab shows error message; textarea stays empty.
- Personal file save with yaml syntax error → inline error message with
  parser line/col; file unchanged on disk.
- Personal file save IO error → inline error; file may or may not be partially
  written. Acceptable since backup is taken first.

## Testing

- Unit: `personal-files.test.ts` — read/write happy path; yaml lint catches
  bad syntax; allowlist rejects bogus ids; backup file exists after write;
  1 MB cap rejects oversize content. (Adds vitest dep to apps/desktop, or
  put the test file in apps/server/src and import the desktop module — pick
  whichever is simpler. Decision in plan: put the test in apps/server's
  vitest setup since vitest is already there.)
- Manual smoke after build:
  1. Open Settings → General → switch backend codex → claude → Save & Restart.
     Verify health refreshes to `realExecutor=claude` within 5 s.
  2. Switch back to codex with model override → verify env carries through.
  3. Personal files → load profile.yml → edit detail_value_threshold → save
     → reopen → value persists; backup file exists.
  4. Personal files → break yaml syntax → save → error shown, file unchanged.

## Risks

- A delta-detect bug could mean changes silently don't restart. Mitigation:
  log the delta + the "needsRestart" decision to console.
- yaml writer (used by Newgrad thresholds tab via the existing
  `profile-config.ts`) and the raw text editor (in Personal files tab) both
  edit `config/profile.yml`. If both tabs are open and the user saves
  changes from one tab while editing in the other, second save wins. The
  Personal files Save reloads from disk before showing diff button state, so
  reopening the file refreshes the view. Acceptable for a single-user app.
- Restart races: if the user clicks Save & Restart while an evaluation is
  in flight, the bridge stops mid-eval and that job phase becomes "failed".
  Documented in the Save button helper text: "In-flight evaluations will be
  cancelled."

## Done criteria

- Settings window shows 4 tabs; default tab is General.
- Switching backend + clicking Save restarts the bridge; `/v1/health` shows
  the new executor within 5 s.
- Personal files tab can read & write all 5 files with backup; yaml errors
  block save with a useful message.
- `npm --prefix apps/desktop run typecheck` and `npm run build` are clean.
- Existing Newgrad threshold flow still works.
- A working desktop .app rebuild was relaunched and manually smoke-tested.
