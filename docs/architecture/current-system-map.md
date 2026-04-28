# Current System Map

Career-Ops is a local-first job search workspace. The current production shape
is a Bun-first app/package layout plus root scanner/document scripts.

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

- `bun run verify`
- `bun run newgrad-scan`
- `bun run linkedin-scan`
- `bun run builtin-scan`
- `bun run indeed-scan`
- `bun run ext:build`
- `bun run server`
- `bun run dashboard:build`

The repository does not use a default external system-updater. Project changes
land as normal repository edits and must pass relevant verification.
