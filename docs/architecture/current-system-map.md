# Current System Map

Auto-Job is a local-first job search workspace. The current production shape
is a npm-first app/package layout plus root scanner/document scripts.

```text
User / Codex / Chrome extension
        |
        v
root package scripts
        |
        +--> scripts/*scan*.ts and scan.mjs
        |
        +--> apps/server local bridge and dashboard
        |          |
        |          +--> packages/shared HTTP and job contracts
        |          +--> batch prompts, reports, tracker TSVs
        |
        +--> apps/extension MV3 capture and autofill client
        |
        +--> web dashboard static build
```

## Retained Commands

- `npm run verify`
- `npm run newgrad-scan`
- `npm run linkedin-scan`
- `npm run builtin-scan`
- `npm run indeed-scan`
- `npm run ext:build`
- `npm run server`
- `npm run dashboard:build`

The repository does not use a default external system-updater. Project changes
land as normal repository edits and must pass relevant verification.
