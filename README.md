# cryo-drive-vault

Backup vault module for [kosmos](https://github.com/chevp/kosmos) — configure and run
filesystem backups via `.cdv` config files (a YAML dialect, one config per vault).
The actual copying is done by a **professional external CLI** (robocopy on Windows);
`cdv` is the orchestrator, config format, and progress/RPC layer around it.

Used three ways:
- as a CLI (`cdv`) for ad-hoc backup/restore from a shell
- as a JSON-RPC daemon (`cdv serve`) that the kosmos container spawns and drives, with
  live progress streamed back over stdio
- as a library (`import { ... } from "cryo-drive-vault"`) for direct in-process use

## `.cdv` config

```yaml
name: my-vault
engine: robocopy      # robocopy (Windows mirror/sync) | builtin (snapshots). default: robocopy on Windows, else builtin
mode: mirror          # mirror (destination tracks sources 1:1, extras deleted) | copy (additive). robocopy only
sources:
  - path: C:/work/data
    exclude: ["node_modules", "*.tmp"]
destination:
  path: D:/backups/my-vault
# retention only applies to the builtin (snapshot) engine:
# retention:
#   keep: 7
```

- `engine` — who moves the bytes. `robocopy` mirrors/syncs with no history; `builtin`
  is a cross-platform Node fs copier that keeps timestamped snapshots.
- `mode` (robocopy) — `mirror` makes the destination an exact copy of the sources
  (files removed from a source are deleted from the destination, via robocopy `/MIR`);
  `copy` is additive and never deletes.
- `sources` — one or more paths; each may `exclude` files/dirs by name (`*`/`?` globs).
  With multiple sources, each is mirrored into `destination/<basename>`.
- `destination.path` — the mirror root (robocopy), or where snapshot dirs go (builtin).
- `retention.keep` — builtin only: number of recent snapshots to keep.

## CLI

```bash
cdv init my-vault.cdv              # scaffold a new config
cdv validate my-vault.cdv          # check a config, show resolved engine/mode
cdv backup my-vault.cdv            # run a backup (robocopy mirror, or builtin snapshot)
cdv list my-vault.cdv              # list snapshots (builtin engine)
cdv restore my-vault.cdv ./out     # restore the latest snapshot into ./out
cdv restore my-vault.cdv ./out --id 20260710T140512Z
cdv serve                          # JSON-RPC daemon over stdio (for the container)
```

## Daemon / JSON-RPC (`cdv serve`)

Speaks JSON-RPC 2.0 over newline-delimited JSON on stdin/stdout — the same transport
and envelope as [kosmos-runtime](https://github.com/chevp/kosmos-runtime). The kosmos
container spawns it, sends requests, and receives live progress notifications. Closing
stdin (EOF) shuts it down.

Methods: `vault.ping`, `vault.info`, `vault.validate`, `backup.start`,
`backup.cancel`, `snapshot.list`, `restore.start`.

Notifications: `backup.progress` (`{ filesDone, filesTotal, bytesDone, bytesTotal, currentPath }`),
`backup.log`, `backup.done`, `backup.cancelled`, `backup.error`.

```jsonc
→ { "jsonrpc":"2.0", "id":1, "method":"backup.start", "params":{ "configPath":"my-vault.cdv" } }
← { "jsonrpc":"2.0", "id":1, "result":{ "jobId":"job-1", "name":"my-vault" } }
← { "jsonrpc":"2.0", "method":"backup.progress", "params":{ "jobId":"job-1", "filesDone":1, "filesTotal":1, ... } }
← { "jsonrpc":"2.0", "method":"backup.done", "params":{ "jobId":"job-1", "filesCopied":1, "bytesCopied":40, ... } }
```

## Library

```ts
import { loadConfig, runBackup } from "cryo-drive-vault";

const config = loadConfig("my-vault.cdv");
const result = await runBackup(config, {
  onProgress: (p) => console.log(`${p.filesDone}/${p.filesTotal}`),
});
```

## Dev

```bash
npm install
npm run dev -- backup my-vault.cdv
npm run build
```

Zero runtime dependencies — YAML parsing, CLI dispatch, and the JSON-RPC host are
hand-rolled in-tree (see [src/yaml.ts](src/yaml.ts), [src/index.ts](src/index.ts),
[src/rpc/server.ts](src/rpc/server.ts)), following the same convention as
[luma](https://github.com/chevp/luma). The only external program is robocopy, invoked
via `child_process`.
