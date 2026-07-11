import { cpSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { CdvConfig } from "../config.js";
import { ARCHIVE_SUFFIX, extractArchive } from "./archive.js";
import { listSnapshots } from "./list.js";

export class RestoreError extends Error {}

export function resolveSnapshotId(config: CdvConfig, requestedId?: string): string {
  const snapshots = listSnapshots(config);
  if (requestedId) {
    if (!snapshots.some((s) => s.id === requestedId)) {
      throw new RestoreError(`no snapshot '${requestedId}' in '${config.destination.path}'`);
    }
    return requestedId;
  }
  const latest = snapshots.at(-1);
  if (!latest) {
    throw new RestoreError(`no snapshots found in '${config.destination.path}'`);
  }
  return latest.id;
}

export async function runRestore(config: CdvConfig, targetDir: string, requestedId?: string): Promise<string> {
  const id = resolveSnapshotId(config, requestedId);
  const snapshotDir = join(config.destination.path, id);
  const archivePath = join(config.destination.path, id + ARCHIVE_SUFFIX);
  if (existsSync(snapshotDir)) {
    cpSync(snapshotDir, targetDir, { recursive: true });
  } else if (existsSync(archivePath)) {
    await extractArchive(archivePath, targetDir);
  } else {
    throw new RestoreError(`snapshot '${id}' is missing from '${config.destination.path}'`);
  }
  return id;
}
