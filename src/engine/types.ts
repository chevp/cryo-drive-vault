import type { CdvConfig } from "../config.js";

/** A single file the engine acted on, streamed live during a backup. */
export interface FileEvent {
  /** Absolute path of the file. */
  path: string;
  /** Bytes for this file (0 if the engine didn't report a size). */
  bytes: number;
  /** `copy` — written to the destination; `delete` — removed from the destination (mirror). */
  action: "copy" | "delete";
}

/** Coarse progress, emitted repeatedly while a backup runs. */
export interface ProgressEvent {
  /** Files processed so far. */
  filesDone: number;
  /** Total files expected (from a pre-scan); 0 when unknown/indeterminate. */
  filesTotal: number;
  /** Bytes processed so far. */
  bytesDone: number;
  /** Total bytes expected; 0 when unknown. */
  bytesTotal: number;
  /** Path of the most recent file, for a "copying X" label. */
  currentPath: string;
}

/** Terminal summary of a completed backup. */
export interface BackupResult {
  engine: string;
  filesCopied: number;
  filesDeleted: number;
  bytesCopied: number;
  /** Where the backup landed (mirror root, or snapshot dir for builtin). */
  destination: string;
  /** Snapshot id when the engine is snapshot-based (builtin); undefined for mirror. */
  snapshotId?: string;
}

export interface RunHooks {
  onProgress?: (p: ProgressEvent) => void;
  onFile?: (f: FileEvent) => void;
  /** Raw diagnostic line from the underlying tool (stderr/stdout), for a live log. */
  onLog?: (line: string) => void;
  /** Abort the run (kills the child process); surfaces as a CancelledError. */
  signal?: AbortSignal;
}

export class EngineError extends Error {}
export class CancelledError extends EngineError {
  constructor() {
    super("backup cancelled");
  }
}

export interface BackupEngine {
  readonly name: string;
  /** Is this engine usable on the current host? (e.g. robocopy only on win32) */
  available(): Promise<boolean>;
  run(config: CdvConfig, hooks: RunHooks): Promise<BackupResult>;
}
