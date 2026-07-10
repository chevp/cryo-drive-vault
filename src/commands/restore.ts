import { BIN_NAME, CONFIG_EXTENSION } from "../identity.js";
import { loadConfig } from "../config.js";
import { runRestore } from "../vault/restore.js";
import { c, kv, line, section } from "../ui.js";

const HELP = `${BIN_NAME} restore — restore a snapshot into a target directory.

Usage: ${BIN_NAME} restore <file${CONFIG_EXTENSION}> <target-dir> [options]

Options:
  --id <snapshot>   snapshot id to restore (defaults to the latest)
  -h, --help        show this help
`;

export async function run(argv: string[]): Promise<number> {
  const first = argv[0];
  if (!first || first === "-h" || first === "--help") {
    process.stdout.write(HELP);
    return first ? 0 : 1;
  }

  const target = argv[1];
  if (!target) {
    process.stderr.write(`${BIN_NAME} restore: missing <target-dir>\n`);
    process.stdout.write(HELP);
    return 1;
  }

  let requestedId: string | undefined;
  const idIdx = argv.indexOf("--id");
  if (idIdx >= 0) requestedId = argv[idIdx + 1];

  const config = loadConfig(first);
  const restoredId = runRestore(config, target, requestedId);

  section(`restore: ${config.name}`);
  kv("snapshot", restoredId);
  kv("target", target);
  line(`\n${c.green("✓")} restore complete`);
  return 0;
}
