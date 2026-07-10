import { BIN_NAME, CONFIG_EXTENSION } from "../identity.js";
import { loadConfig } from "../config.js";
import { listSnapshots } from "../vault/list.js";
import { c, line, section } from "../ui.js";

const HELP = `${BIN_NAME} list — list snapshots in a config's destination.

Usage: ${BIN_NAME} list <file${CONFIG_EXTENSION}>

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
  const snapshots = listSnapshots(config);

  section(`snapshots: ${config.name}`);
  if (snapshots.length === 0) {
    line(`  ${c.dim("(none yet — run '" + BIN_NAME + " backup " + first + "')")}`);
    return 0;
  }
  for (const s of snapshots) {
    const when = s.createdAt ? s.createdAt.toISOString() : c.dim("(unknown date)");
    line(`  ${c.cyan(s.id)}  ${when}`);
  }
  return 0;
}
