import { BIN_NAME, CONFIG_EXTENSION } from "../identity.js";
import { loadConfig } from "../config.js";
import { runBackup } from "../engine/index.js";
import { c, kv, line, section } from "../ui.js";

const HELP = `${BIN_NAME} backup — run a backup for a ${CONFIG_EXTENSION} config.

Usage: ${BIN_NAME} backup <file${CONFIG_EXTENSION}>

Options:
  -q, --quiet   suppress the per-file progress line
  -h, --help    show this help
`;

function human(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(1)} ${units[unit]}`;
}

export async function run(argv: string[]): Promise<number> {
  const first = argv[0];
  if (!first || first === "-h" || first === "--help") {
    process.stdout.write(HELP);
    return first ? 0 : 1;
  }
  const quiet = argv.includes("-q") || argv.includes("--quiet");

  const config = loadConfig(first);
  section(`backup: ${config.name}`);

  const result = await runBackup(config, {
    onProgress: quiet
      ? undefined
      : (p) => {
          if (!process.stdout.isTTY) return;
          const pct = p.filesTotal > 0 ? Math.floor((p.filesDone / p.filesTotal) * 100) : 0;
          const label = p.currentPath.length > 60 ? "…" + p.currentPath.slice(-59) : p.currentPath;
          process.stdout.write(`\r  ${c.dim(`${pct}%`)} ${p.filesDone}/${p.filesTotal || "?"}  ${label}`.padEnd(90));
        },
  });
  if (!quiet && process.stdout.isTTY) process.stdout.write("\r".padEnd(92) + "\r");

  kv("engine", result.engine);
  if (result.snapshotId) kv("snapshot", result.snapshotId);
  kv("copied", `${result.filesCopied} files · ${human(result.bytesCopied)}`);
  if (result.filesDeleted > 0) kv("deleted", `${result.filesDeleted} files (mirror)`);
  kv("destination", result.destination);
  line(`\n${c.green("✓")} backup complete`);
  return 0;
}
