import { basename } from "node:path";

/** Display name for the running binary — drives error prefixes and help text. */
function deriveBinName(): string {
  const env = process.env.CDV_INVOKED_AS?.trim();
  if (env) return env;
  const argv1 = process.argv[1];
  if (!argv1) return "cdv";
  let name = basename(argv1);
  if (name.endsWith(".cmd")) name = name.slice(0, -4);
  if (name.endsWith(".exe")) name = name.slice(0, -4);
  return name || "cdv";
}

export const BIN_NAME = deriveBinName();
export const CONFIG_EXTENSION = ".cdv";
