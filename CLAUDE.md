# CLAUDE.md — cryo-drive-vault

Backup vault module for kosmos. Configs are `.cdv` files (a YAML dialect); one config
describes one vault (engine, mode, sources, destination, retention). The kosmos
container spawns `cdv serve` and drives backups over JSON-RPC.

## Conventions

- **Zero runtime dependencies.** `dependencies` in package.json stays empty. YAML
  parsing ([src/yaml.ts](src/yaml.ts)), CLI dispatch ([src/index.ts](src/index.ts)),
  and the JSON-RPC host ([src/rpc/server.ts](src/rpc/server.ts)) are hand-rolled
  in-tree, mirroring [luma](https://github.com/chevp/luma)'s ADR-002/ADR-003. Adding
  a runtime dependency needs a deliberate reason, not a reflex.
- **The bytes are moved by a professional external CLI, not by us.** The default
  engine shells out to **robocopy** (`src/engine/robocopy.ts`) for mirror/sync. The
  `builtin` engine (`src/engine/builtin.ts` → `src/vault/*`, pure Node fs) is the
  cross-platform fallback and the only one that keeps timestamped snapshots. Both
  sit behind the `BackupEngine` interface in `src/engine/types.ts`.
- **robocopy specifics** (see `src/engine/robocopy.ts` + `robocopy-parse.ts`):
  exit code `< 8` = success (bit flags, not 0); the summary table is **localized**,
  so progress is parsed structurally (a digits-only field + a path field per line),
  never by keyword; `/R:2 /W:2` override robocopy's hang-forever defaults; a `/L`
  pre-scan sizes the progress bar. When touching the parser, re-check against real
  robocopy output — it's German on this box.
- **Three entry points**: `bin/cdv` (CLI), `cdv serve` (JSON-RPC/NDJSON daemon over
  stdio — same transport/envelope as kosmos-runtime), and `src/lib.ts` (direct
  programmatic API). The container uses the daemon for live progress.
- Each CLI command lives in `src/commands/<name>.ts` and exports `run(argv): Promise<number>`;
  `src/index.ts` is a plain `Record<string, CommandRunner>` dispatch table.
- Snapshot directories (builtin engine) are named by UTC timestamp
  (`YYYYMMDDTHHMMSSZ`) so they sort and prune lexicographically — see `src/vault/snapshot.ts`.

## Structure

| Path | Purpose |
|---|---|
| `src/config.ts` | `.cdv` schema (engine/mode/sources/destination/retention) + loader/validator |
| `src/yaml.ts` | hand-rolled YAML subset parser (strips BOM) |
| `src/engine/` | `BackupEngine` interface, robocopy engine + parser, builtin fallback, selector |
| `src/vault/` | builtin snapshot copy, restore, list, retention, exclude-matching |
| `src/rpc/` | JSON-RPC 2.0 protocol + stdio host (`cdv serve`) |
| `src/commands/` | CLI command implementations |
| `src/index.ts` | CLI dispatcher (entry via `bin/cdv`) |
| `src/lib.ts` | library entry point for consumers like kosmos-container |
