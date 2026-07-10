import { BIN_NAME, CONFIG_EXTENSION } from "../identity.js";

export async function run(_argv: string[]): Promise<number> {
  process.stdout.write(`${BIN_NAME} — configure and run kosmos backups via ${CONFIG_EXTENSION} (YAML) files.

Usage: ${BIN_NAME} <command> [options]

Commands:
  init <file>              scaffold a new ${CONFIG_EXTENSION} config
  validate <file>          check a ${CONFIG_EXTENSION} config for errors
  backup <file>             run a backup for a ${CONFIG_EXTENSION} config
  list <file>               list snapshots in a config's destination
  restore <file> <target>   restore a snapshot into <target> (--id <snapshot>)
  help                      show this help

Run '${BIN_NAME} <command> --help' for command-specific options.
`);
  return 0;
}
