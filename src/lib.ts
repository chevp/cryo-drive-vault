/**
 * Programmatic entry point — import this from kosmos-container (or any other
 * Node module) instead of shelling out to the `cdv` binary.
 */
export { loadConfig, validateConfig, CdvConfigError } from "./config.js";
export type { CdvConfig, CdvSource, CdvDestination, CdvRetention } from "./config.js";
export { runBackup } from "./vault/backup.js";
export type { BackupResult } from "./vault/backup.js";
export { listSnapshots } from "./vault/list.js";
export type { SnapshotInfo } from "./vault/list.js";
export { runRestore, resolveSnapshotId, RestoreError } from "./vault/restore.js";
