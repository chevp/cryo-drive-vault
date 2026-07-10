import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, extname } from "node:path";
import { basename } from "node:path";
import { BIN_NAME, CONFIG_EXTENSION } from "../identity.js";
import { c, line } from "../ui.js";

const HELP = `${BIN_NAME} init — scaffold a new ${CONFIG_EXTENSION} config.

Usage: ${BIN_NAME} init <file${CONFIG_EXTENSION}>

Options:
  -h, --help    show this help
`;

function template(name: string): string {
  return `name: ${name}
sources:
  - path: ./data
    exclude: ["node_modules", "*.tmp"]
destination:
  path: ./backups/${name}
retention:
  keep: 7
`;
}

export async function run(argv: string[]): Promise<number> {
  const first = argv[0];
  if (!first || first === "-h" || first === "--help") {
    process.stdout.write(HELP);
    return first ? 0 : 1;
  }

  if (extname(first) !== CONFIG_EXTENSION) {
    process.stderr.write(`${BIN_NAME} init: file must have a '${CONFIG_EXTENSION}' extension, got '${first}'\n`);
    return 1;
  }
  if (existsSync(first)) {
    process.stderr.write(`${BIN_NAME} init: '${first}' already exists\n`);
    return 1;
  }

  const dir = dirname(first);
  if (dir && dir !== ".") mkdirSync(dir, { recursive: true });

  const name = basename(first, CONFIG_EXTENSION);
  writeFileSync(first, template(name), "utf8");
  line(`${c.green("✓")} wrote ${first}`);
  return 0;
}
