# CLAUDE.md — cryo-drive-vault

Backup vault module for kosmos. Configs are `.cdv` files (a YAML dialect); one config
describes one vault (sources, destination, retention).

## Conventions

- **Zero runtime dependencies.** `dependencies` in package.json stays empty. YAML
  parsing ([src/yaml.ts](src/yaml.ts)) and CLI dispatch ([src/index.ts](src/index.ts))
  are hand-rolled in-tree, mirroring [luma](https://github.com/chevp/luma)'s ADR-002/ADR-003.
  Adding a runtime dependency needs a deliberate reason, not a reflex.
- **Two entry points**: `bin/cdv` (CLI, built from `src/index.ts`) and `src/lib.ts`
  (programmatic API for kosmos-container to import directly instead of shelling out).
- Each CLI command lives in `src/commands/<name>.ts` and exports `run(argv): Promise<number>`;
  `src/index.ts` is a plain `Record<string, CommandRunner>` dispatch table.
- Vault logic (backup/restore/list/retention) lives in `src/vault/*` and is pure
  Node fs — no child_process, no shelling out to zip/tar.
- Snapshot directories are named by UTC timestamp (`YYYYMMDDTHHMMSSZ`) so they sort
  and prune lexicographically — see `src/vault/snapshot.ts`.

## Structure

| Path | Purpose |
|---|---|
| `src/config.ts` | `.cdv` schema + loader/validator |
| `src/yaml.ts` | hand-rolled YAML subset parser |
| `src/vault/` | backup, restore, list, retention, exclude-matching |
| `src/commands/` | CLI command implementations |
| `src/index.ts` | CLI dispatcher (entry via `bin/cdv`) |
| `src/lib.ts` | library entry point for consumers like kosmos-container |
