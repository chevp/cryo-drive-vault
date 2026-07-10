import { BIN_NAME, CONFIG_EXTENSION } from "../identity.js";
import { loadConfig } from "../config.js";
import { runBackup } from "../vault/backup.js";
import { c, kv, line, section } from "../ui.js";

const HELP = `${BIN_NAME} backup — run a backup for a ${CONFIG_EXTENSION} config.

Usage: ${BIN_NAME} backup <file${CONFIG_EXTENSION}>

Options:
  -h, --help    show this help
`;

export async function run(argv: string[]): Promise<number> {
  const first = argv[0];
  if (!first || first === "-h" || first === "--help") {
    process.stdout.write(HELP);
    return first ? 0 : 1;
  }

  const config = loadConfig(first);
  const result = runBackup(config);

  section(`backup: ${config.name}`);
  kv("snapshot", result.id);
  kv("sources", String(result.sources));
  kv("path", result.path);
  line(`\n${c.green("✓")} backup complete`);
  return 0;
}
