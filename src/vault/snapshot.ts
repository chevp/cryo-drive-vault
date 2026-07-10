/** Snapshot directory names sort lexicographically because they're ISO-derived: 20260710T140512Z. */
const SNAPSHOT_ID_PATTERN = /^(\d{8}T\d{6}Z)$/;

export function newSnapshotId(now: Date): string {
  return now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

export function isSnapshotId(name: string): boolean {
  return SNAPSHOT_ID_PATTERN.test(name);
}

export function snapshotDate(id: string): Date | null {
  if (!isSnapshotId(id)) return null;
  const iso = `${id.slice(0, 4)}-${id.slice(4, 6)}-${id.slice(6, 8)}T${id.slice(9, 11)}:${id.slice(11, 13)}:${id.slice(13, 15)}Z`;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}
