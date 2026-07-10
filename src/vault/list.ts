import { readdirSync } from "node:fs";
import type { CdvConfig } from "../config.js";
import { isSnapshotId, snapshotDate } from "./snapshot.js";

export interface SnapshotInfo {
  id: string;
  createdAt: Date | null;
}

export function listSnapshots(config: CdvConfig): SnapshotInfo[] {
  let entries: string[];
  try {
    entries = readdirSync(config.destination.path, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && isSnapshotId(entry.name))
      .map((entry) => entry.name);
  } catch (err: any) {
    if (err?.code === "ENOENT") return [];
    throw err;
  }

  return entries
    .sort()
    .map((id) => ({ id, createdAt: snapshotDate(id) }));
}
