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
    hooks.onLog?.(`builtin snapshot copy → ${config.destination.path}`);
    const result = runSnapshotBackup(config);
    hooks.onProgress?.({
      filesDone: result.sources,
      filesTotal: result.sources,
      bytesDone: 0,
      bytesTotal: 0,
      currentPath: result.path,
    });
    return {
      engine: this.name,
      filesCopied: result.sources,
      filesDeleted: 0,
      bytesCopied: 0,
      destination: result.path,
      snapshotId: result.id,
    };
  }
}
