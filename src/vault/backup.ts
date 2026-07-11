import { mkdirSync, readdirSync, rmSync } from "node:fs";
import { copyFile, mkdir, readdir, stat } from "node:fs/promises";
import { basename, join } from "node:path";
import type { CdvConfig, CdvSource } from "../config.js";
import { CancelledError } from "../engine/types.js";
import { isExcluded } from "./match.js";
import { ARCHIVE_SUFFIX, createArchive } from "./archive.js";
import { newSnapshotId, snapshotIdFromEntry } from "./snapshot.js";

export interface BackupResult {
  id: string;
  path: string;
  /** Number of sources copied. */
  sources: number;
  /** Number of files copied across all sources. */
  files: number;
  /** Total bytes copied across all sources (pre-compression). */
  bytes: number;
  compressed: boolean;
}

export interface SnapshotRunOptions {
  /** Timestamp for the snapshot id (defaults to now); pinned in tests. */
  now?: Date;
  /** Abort signal — checked between files so a run can be cancelled mid-copy. */
  signal?: AbortSignal;
  /** Invoked after each file is copied, for live progress. */
  onCopy?: (absPath: string, bytes: number) => void;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new CancelledError();
}

/**
 * Recursively copy `src` → `dst`, skipping excluded names. Async and
 * cooperative: it yields to the event loop on every entry (so a pending
 * `backup.cancel` can land) and re-checks the abort signal before each copy.
 */
async function copyTree(src: string, dst: string, exclude: string[] | undefined, opts: SnapshotRunOptions): Promise<void> {
  throwIfAborted(opts.signal);
  const entries = await readdir(src, { withFileTypes: true });
  await mkdir(dst, { recursive: true });
  for (const entry of entries) {
    throwIfAborted(opts.signal);
    if (isExcluded(entry.name, exclude)) continue;
    const from = join(src, entry.name);
    const to = join(dst, entry.name);
    if (entry.isDirectory()) {
      await copyTree(from, to, exclude, opts);
    } else if (entry.isFile() || entry.isSymbolicLink()) {
      // copyFile follows a symlink and copies the target's bytes — the same
      // effect the previous cpSync had.
      const size = await stat(from).then((s) => s.size, () => 0);
      await copyFile(from, to);
      opts.onCopy?.(from, size);
    }
  }
}

function applyRetention(destinationDir: string, keep: number): string[] {
  // Prune both directory and archived snapshots; they share the same id order.
  const snapshots = readdirSync(destinationDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() || entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => snapshotIdFromEntry(name) !== null)
    .sort((a, b) => (snapshotIdFromEntry(a) ?? "").localeCompare(snapshotIdFromEntry(b) ?? ""));

  const removed = snapshots.slice(0, Math.max(0, snapshots.length - keep));
  for (const name of removed) {
    rmSync(join(destinationDir, name), { recursive: true, force: true });
  }
  return removed;
}

export async function runBackup(config: CdvConfig, opts: SnapshotRunOptions = {}): Promise<BackupResult> {
  const id = newSnapshotId(opts.now ?? new Date());
  const snapshotDir = join(config.destination.path, id);
  mkdirSync(snapshotDir, { recursive: true });

  let files = 0;
  let bytes = 0;
  const counting: SnapshotRunOptions = {
    ...opts,
    onCopy: (p, size) => { files += 1; bytes += size; opts.onCopy?.(p, size); },
  };

  try {
    for (const source of config.sources as CdvSource[]) {
      throwIfAborted(opts.signal);
      const dest = join(snapshotDir, basename(source.path));
      await copyTree(source.path, dest, source.exclude, counting);
    }

    throwIfAborted(opts.signal);

    // When compression is on, replace the staged directory with a single
    // `<id>.tar.gz` archive in the destination.
    let outputPath = snapshotDir;
    if (config.compress) {
      const archivePath = join(config.destination.path, id + ARCHIVE_SUFFIX);
      await createArchive(snapshotDir, archivePath, opts.signal);
      rmSync(snapshotDir, { recursive: true, force: true });
      outputPath = archivePath;
    }

    if (config.retention) {
      applyRetention(config.destination.path, config.retention.keep);
    }

    return { id, path: outputPath, sources: config.sources.length, files, bytes, compressed: !!config.compress };
  } catch (err) {
    // Don't leave a half-written snapshot behind on cancel/failure.
    rmSync(snapshotDir, { recursive: true, force: true });
    throw err;
  }
}
