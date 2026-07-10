/**
 * Programmatic entry point — import this from kosmos-container (or any other
 * Node module) instead of shelling out to the `cdv` binary. For a long-lived
 * connection with live progress, prefer the JSON-RPC daemon (`cdv serve`, see
 * src/rpc/server.ts) over calling these functions directly.
 */
export { loadConfig, validateConfig, CdvConfigError } from "./config.js";
export type {
  CdvConfig,
  CdvSource,
  CdvDestination,
  CdvRetention,
  CdvEngine,
  CdvMode,
} from "./config.js";

// Engine layer — robocopy (mirror/sync) + builtin (snapshot) behind one API.
export { runBackup, selectEngine } from "./engine/index.js";
export { EngineError, CancelledError } from "./engine/types.js";
export type {
  BackupEngine,
  BackupResult,
  ProgressEvent,
  FileEvent,
  RunHooks,
} from "./engine/types.js";

// Snapshot-oriented helpers (builtin engine).
export { listSnapshots } from "./vault/list.js";
export type { SnapshotInfo } from "./vault/list.js";
export { runRestore, resolveSnapshotId, RestoreError } from "./vault/restore.js";
