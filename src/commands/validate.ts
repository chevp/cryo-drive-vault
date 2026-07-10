import { BIN_NAME, CONFIG_EXTENSION } from "../identity.js";
import { loadConfig } from "../config.js";
import { c, kv, line, section } from "../ui.js";

const HELP = `${BIN_NAME} validate — check a ${CONFIG_EXTENSION} config for errors.

Usage: ${BIN_NAME} validate <file${CONFIG_EXTENSION}>

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
  section("config");
  kv("name", config.name);
  kv("sources", String(config.sources.length));
  kv("destination", config.destination.path);
  if (config.retention) kv("retention", `keep ${config.retention.keep}`);
  line(`\n${c.green("✓")} ${first} is valid`);
  return 0;
}
