import { BIN_NAME } from "./identity.js";
import * as helpCmd from "./commands/help.js";
import * as initCmd from "./commands/init.js";
import * as validateCmd from "./commands/validate.js";
import * as backupCmd from "./commands/backup.js";
import * as listCmd from "./commands/list.js";
import * as restoreCmd from "./commands/restore.js";

type CommandRunner = (argv: string[]) => Promise<number>;

const COMMANDS: Record<string, CommandRunner> = {
  init: initCmd.run,
  validate: validateCmd.run,
  backup: backupCmd.run,
  list: listCmd.run,
  restore: restoreCmd.run,

  help: helpCmd.run,
  "-h": helpCmd.run,
  "--help": helpCmd.run,
};

async function main(): Promise<number> {
  const [, , cmd = "help", ...rest] = process.argv;

  const runner = COMMANDS[cmd];
  if (!runner) {
    process.stderr.write(`${BIN_NAME}: unknown command '${cmd}'\n`);
    await helpCmd.run([]);
    return 1;
  }

  try {
    return await runner(rest);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`${BIN_NAME} ${cmd}: ${msg}\n`);
    return 1;
  }
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (err) => {
    process.stderr.write(`${BIN_NAME}: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exitCode = 1;
  },
);
