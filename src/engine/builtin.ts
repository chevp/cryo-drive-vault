import type { CdvConfig } from "../config.js";
import { runBackup as runSnapshotBackup } from "../vault/backup.js";
import type { BackupEngine, BackupResult, RunHooks } from "./types.js";

/**
 * Cross-platform fallback engine: the hand-rolled Node fs snapshot copier in
 * `src/vault/backup.ts`. Unlike robocopy this keeps history — each run writes a
 * fresh timestamped snapshot and prunes to `retention.keep`. Used when robocopy
 * is unavailable (non-Windows) or `engine: builtin` is set explicitly.
 */
export class BuiltinEngine implements BackupEngine {
  readonly name = "builtin";

  async available(): Promise<boolean> {
    return true;
  }

  async run(config: CdvConfig, hooks: RunHooks): Promise<BackupResult> {
    hooks.onLog?.(
      `builtin snapshot copy${config.compress ? " (tar.gz)" : ""} → ${config.destination.path}`,
    );
    let filesDone = 0;
    let bytesDone = 0;
    const result = await runSnapshotBackup(config, {
      signal: hooks.signal,
      onCopy: (path, bytes) => {
        filesDone += 1;
        bytesDone += bytes;
        // filesTotal is unknown without a pre-scan; stream the running count +
        // bytes + current path so the UI shows live activity (and cancel stays snappy).
        hooks.onProgress?.({ filesDone, filesTotal: 0, bytesDone, bytesTotal: 0, currentPath: path });
      },
    });
    if (result.compressed) hooks.onLog?.(`compressed snapshot → ${result.path}`);
    hooks.onProgress?.({
      filesDone: result.files,
      filesTotal: result.files,
      bytesDone: result.bytes,
      bytesTotal: result.bytes,
      currentPath: result.path,
    });
    return {
      engine: this.name,
      filesCopied: result.files,
      filesDeleted: 0,
      bytesCopied: result.bytes,
      destination: result.path,
      snapshotId: result.id,
    };
  }
}
