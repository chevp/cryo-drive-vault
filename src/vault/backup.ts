import { mkdirSync, cpSync, readdirSync, rmSync } from "node:fs";
import { basename, join } from "node:path";
import type { CdvConfig } from "../config.js";
import { isExcluded } from "./match.js";
import { isSnapshotId, newSnapshotId } from "./snapshot.js";

export interface BackupResult {
  id: string;
  path: string;
  sources: number;
}

function copySource(source: { path: string; exclude?: string[] }, snapshotDir: string): void {
  const dest = join(snapshotDir, basename(source.path));
  cpSync(source.path, dest, {
    recursive: true,
    filter: (candidate) => !isExcluded(basename(candidate), source.exclude),
  });
}

function applyRetention(destinationDir: string, keep: number): string[] {
  const snapshots = readdirSync(destinationDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && isSnapshotId(entry.name))
    .map((entry) => entry.name)
    .sort();

  const removed = snapshots.slice(0, Math.max(0, snapshots.length - keep));
  for (const name of removed) {
    rmSync(join(destinationDir, name), { recursive: true, force: true });
  }
  return removed;
}

export function runBackup(config: CdvConfig, now: Date = new Date()): BackupResult {
  const id = newSnapshotId(now);
  const snapshotDir = join(config.destination.path, id);
  mkdirSync(snapshotDir, { recursive: true });

  for (const source of config.sources) {
    copySource(source, snapshotDir);
  }

  if (config.retention) {
    applyRetention(config.destination.path, config.retention.keep);
  }

  return { id, path: snapshotDir, sources: config.sources.length };
}
