/**
 * Parse a single robocopy output line into a file event, or null if the line
 * isn't one (headers, summary table, blank lines).
 *
 * robocopy (with `/NP /NJH /NDL /FP /BYTES`) prints one tab-delimited line per
 * file it touches:
 *
 *     \t    Neue Datei \t\t      12 \t C:\src\a.txt
 *     \t  *EXTRA Datei \t\t       4 \t C:\dst\stale.txt
 *
 * The label ("Neue Datei"/"New File"/"*EXTRA Datei"/…) is localized, so we do
 * NOT match on it. We anchor structurally instead: a field that is purely
 * digits (the byte count) followed by a path-shaped final field. The only
 * non-localized token robocopy keeps is `EXTRA`, which marks a destination file
 * being deleted in mirror mode — safe to key the copy/delete distinction on.
 */
export interface ParsedFileLine {
  bytes: number;
  path: string;
  action: "copy" | "delete";
}

export function parseFileLine(line: string): ParsedFileLine | null {
  if (!line.includes("\t")) return null;
  const fields = line.split("\t");

  let bytesIdx = -1;
  for (let i = 0; i < fields.length; i++) {
    if (/^\s*\d+\s*$/.test(fields[i]!)) {
      bytesIdx = i;
      break;
    }
  }
  // Need a byte field with at least one field after it (the path).
  if (bytesIdx < 0 || bytesIdx >= fields.length - 1) return null;

  const path = fields[fields.length - 1]!.trim();
  if (!path || !/[:\\/]/.test(path)) return null;

  const bytes = Number.parseInt(fields[bytesIdx]!.trim(), 10);
  const label = fields.slice(0, bytesIdx).join(" ");
  const action: "copy" | "delete" = /EXTRA/i.test(label) ? "delete" : "copy";

  return { bytes: Number.isNaN(bytes) ? 0 : bytes, path, action };
}

/**
 * robocopy uses bit-flag exit codes. Anything below 8 is success:
 *   0  no change            1  files copied        2  extra files/dirs
 *   4  mismatches           (bits combine, e.g. 3 = copied + extras purged)
 * 8 and above include at least one failure; 16 is a usage/fatal error.
 */
export function isRobocopySuccess(code: number | null): boolean {
  return code !== null && code < 8;
}
