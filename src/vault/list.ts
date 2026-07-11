import { readdirSync } from "node:fs";
import type { CdvConfig } from "../config.js";
import { snapshotDate, snapshotIdFromEntry } from "./snapshot.js";

export interface SnapshotInfo {
  id: string;
  createdAt: Date | null;
  /** True when stored as a `<id>.tar.gz` archive rather than a plain directory. */
  compressed: boolean;
}

export function listSnapshots(config: CdvConfig): SnapshotInfo[] {
  let ids: Array<{ id: string; compressed: boolean }>;
  try {
    ids = readdirSync(config.destination.path, { withFileTypes: true })
      .flatMap((entry) => {
        // Directories are uncompressed snapshots; regular files may be archives.
        const isArchive = entry.isFile();
        if (!entry.isDirectory() && !isArchive) return [];
        const id = snapshotIdFromEntry(entry.name);
        return id ? [{ id, compressed: isArchive }] : [];
      });
  } catch (err: any) {
    if (err?.code === "ENOENT") return [];
    throw err;
  }

  return ids
    .sort((a, b) => a.id.localeCompare(b.id))
    .map(({ id, compressed }) => ({ id, createdAt: snapshotDate(id), compressed }));
}
