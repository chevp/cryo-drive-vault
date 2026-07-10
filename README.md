# cryo-drive-vault

Backup vault module for [kosmos](https://github.com/chevp/kosmos) — configure and run
filesystem backups via `.cdv` config files (a YAML dialect, one config per vault).

Used two ways:
- as a CLI (`cdv`) for ad-hoc backup/restore from a shell
- as a library (`import { ... } from "cryo-drive-vault"`) from kosmos-container, so the
  same config files drive backups triggered from the container UI

## `.cdv` config

```yaml
name: my-vault
sources:
  - path: ./data
    exclude: ["node_modules", "*.tmp"]
destination:
  path: ./backups/my-vault
retention:
  keep: 7
```

- `sources` — one or more paths to back up; each entry may exclude files/dirs by name
  (`*`/`?` globs, matched against the basename).
- `destination.path` — where timestamped snapshot directories are written.
- `retention.keep` — number of most recent snapshots to keep (older ones are pruned
  after each backup).

## CLI

```bash
cdv init my-vault.cdv              # scaffold a new config
cdv validate my-vault.cdv          # check a config for errors
cdv backup my-vault.cdv            # run a backup, writes a new snapshot
cdv list my-vault.cdv              # list snapshots
cdv restore my-vault.cdv ./out     # restore the latest snapshot into ./out
cdv restore my-vault.cdv ./out --id 20260710T140512Z
```

## Library

```ts
import { loadConfig, runBackup, listSnapshots, runRestore } from "cryo-drive-vault";

const config = loadConfig("my-vault.cdv");
const result = runBackup(config);
```

## Dev

```bash
npm install
npm run dev -- backup my-vault.cdv
npm run build
```

Zero runtime dependencies — YAML parsing and CLI dispatch are hand-rolled in-tree
(see [src/yaml.ts](src/yaml.ts), [src/index.ts](src/index.ts)), following the same
convention as [luma](https://github.com/chevp/luma).
