# Target Architecture

The target is independent ownership with the current local workflow preserved:
scan, enrich, evaluate, track, and act.

```text
apps
  extension: Chrome MV3 UI, capture, and user-triggered autofill
  server: local authenticated bridge, evaluation queue, dashboard routes
  desktop: Electron wrapper around the local bridge/dashboard

packages
  shared: HTTP endpoints, envelopes, job, tracker, and autofill contracts

root workflows
  scripts: scanner and automation entry points
  modes: evaluation and document-generation instructions
  templates: CV and tracker templates
  web: dashboard build inputs

artifacts
  data, reports, jds, output, batch/tracker-additions
```

## Dependency Rule

Application surfaces may depend on shared contracts and core helpers. Core
scanner, evaluation, tracker, and document behavior must not depend on a
compatibility command frontend.

## Migration Rule

Do not move directories just to make the layout look cleaner. Move files only
after contract tests prove behavior and the move reduces real maintenance cost.
