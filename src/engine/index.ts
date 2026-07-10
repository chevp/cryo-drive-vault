import type { CdvConfig } from "../config.js";
import type { BackupEngine, BackupResult, RunHooks } from "./types.js";
import { RobocopyEngine } from "./robocopy.js";
import { BuiltinEngine } from "./builtin.js";

export * from "./types.js";

/**
 * Resolve which engine to use. An explicit `engine:` in the config wins; when
 * unset, robocopy on Windows and builtin elsewhere. If robocopy is requested
 * but unavailable (non-Windows), fall back to builtin rather than fail.
 */
export async function selectEngine(config: CdvConfig): Promise<BackupEngine> {
  const wanted = config.engine ?? (process.platform === "win32" ? "robocopy" : "builtin");
  const engine: BackupEngine = wanted === "robocopy" ? new RobocopyEngine() : new BuiltinEngine();
  if (await engine.available()) return engine;
  return new BuiltinEngine();
}

/** Run a backup through the config's resolved engine, streaming progress via hooks. */
export async function runBackup(config: CdvConfig, hooks: RunHooks = {}): Promise<BackupResult> {
  const engine = await selectEngine(config);
  return engine.run(config, hooks);
}
