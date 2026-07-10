import { BIN_NAME } from "../identity.js";
import { RpcServer } from "../rpc/server.js";

const HELP = `${BIN_NAME} serve — run the JSON-RPC backup daemon over stdio.

Speaks JSON-RPC 2.0 over newline-delimited JSON on stdin/stdout (same transport
as kosmos-runtime). Intended to be spawned by the kosmos container, which drives
backups and receives live progress notifications. Closing stdin shuts it down.

Usage: ${BIN_NAME} serve

Methods: vault.ping, vault.info, vault.validate, backup.start, backup.cancel,
         snapshot.list, restore.start
Notifications: backup.progress, backup.log, backup.done, backup.cancelled, backup.error

Options:
  -h, --help    show this help
`;

export async function run(argv: string[]): Promise<number> {
  if (argv[0] === "-h" || argv[0] === "--help") {
    process.stdout.write(HELP);
    return 0;
  }

  process.stderr.write(`${BIN_NAME} serve: ready (JSON-RPC/NDJSON on stdio)\n`);
  const server = new RpcServer(process.stdin, process.stdout);
  await server.serve();
  return 0;
}
