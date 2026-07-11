import { readFileSync, writeFileSync } from "node:fs";
import { extname } from "node:path";
import { parseYaml, type YamlValue } from "./yaml.js";
import { CONFIG_EXTENSION } from "./identity.js";

export interface CdvSource {
  path: string;
  exclude?: string[];
}

export interface CdvDestination {
  path: string;
}

export interface CdvRetention {
  keep: number;
}

/**
 * Which program actually moves the bytes.
 *   - `robocopy` — Windows-native mirror/sync (professional CLI). No history:
 *     the destination is kept 1:1 in step with the sources.
 *   - `builtin`  — hand-rolled Node fs snapshot copier (timestamped snapshots
 *     + retention). Cross-platform fallback, keeps history.
 * When unset, the engine is resolved at run time: `robocopy` on win32, else
 * `builtin` (see engine/index.ts).
 */
export type CdvEngine = "robocopy" | "builtin";

/**
 * How the engine treats the destination.
 *   - `mirror` — destination becomes an exact copy of the sources; files no
 *     longer present in a source are deleted from the destination (robocopy /MIR).
 *   - `copy`   — additive: new/changed files are copied, nothing is deleted.
 * Only meaningful for the `robocopy` engine (the `builtin` engine always writes
 * a fresh timestamped snapshot).
 */
export type CdvMode = "mirror" | "copy";

export interface CdvConfig {
  name: string;
  engine?: CdvEngine;
  mode?: CdvMode;
  sources: CdvSource[];
  destination: CdvDestination;
  retention?: CdvRetention;
  /**
   * When true, the `builtin` engine writes each snapshot as a single
   * gzip-compressed tar archive (`<id>.tar.gz`) in the destination instead of a
   * plain directory. Ignored by `robocopy` (which keeps no snapshots). Requires
   * the system `tar` (bundled on Windows 10+, macOS and Linux).
   */
  compress?: boolean;
}

export class CdvConfigError extends Error {}

function asRecord(value: YamlValue | undefined): Record<string, YamlValue> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, YamlValue>)
    : null;
}

export function validateConfig(doc: YamlValue): CdvConfig {
  const root = asRecord(doc);
  if (!root) {
    throw new CdvConfigError("config must be a YAML mapping");
  }

  if (typeof root.name !== "string" || root.name.trim() === "") {
    throw new CdvConfigError("'name' is required and must be a non-empty string");
  }

  if (!Array.isArray(root.sources) || root.sources.length === 0) {
    throw new CdvConfigError("'sources' is required and must be a non-empty list");
  }
  const sources: CdvSource[] = root.sources.map((entry, index) => {
    if (typeof entry === "string") {
      return { path: entry };
    }
    const record = asRecord(entry);
    if (record && typeof record.path === "string") {
      const exclude = Array.isArray(record.exclude)
        ? record.exclude.filter((e): e is string => typeof e === "string")
        : undefined;
      return { path: record.path, exclude };
    }
    throw new CdvConfigError(`sources[${index}] must be a path string or a { path, exclude } mapping`);
  });

  let engine: CdvEngine | undefined;
  if (root.engine !== undefined) {
    if (root.engine !== "robocopy" && root.engine !== "builtin") {
      throw new CdvConfigError("'engine' must be 'robocopy' or 'builtin'");
    }
    engine = root.engine;
  }

  let mode: CdvMode | undefined;
  if (root.mode !== undefined) {
    if (root.mode !== "mirror" && root.mode !== "copy") {
      throw new CdvConfigError("'mode' must be 'mirror' or 'copy'");
    }
    mode = root.mode;
  }

  const destinationRecord = asRecord(root.destination);
  if (!destinationRecord || typeof destinationRecord.path !== "string") {
    throw new CdvConfigError("'destination.path' is required and must be a string");
  }

  let retention: CdvRetention | undefined;
  if (root.retention !== undefined) {
    const retentionRecord = asRecord(root.retention);
    const keep = retentionRecord?.keep;
    if (typeof keep !== "number" || keep < 1) {
      throw new CdvConfigError("'retention.keep' must be a positive number");
    }
    retention = { keep };
  }

  let compress: boolean | undefined;
  if (root.compress !== undefined) {
    if (typeof root.compress !== "boolean") {
      throw new CdvConfigError("'compress' must be a boolean");
    }
    compress = root.compress;
  }

  return {
    name: root.name,
    engine,
    mode,
    sources,
    destination: { path: destinationRecord.path },
    retention,
    compress,
  };
}

export function loadConfig(filePath: string): CdvConfig {
  if (extname(filePath) !== CONFIG_EXTENSION) {
    throw new CdvConfigError(`config file must have a '${CONFIG_EXTENSION}' extension, got '${filePath}'`);
  }
  const raw = readFileSync(filePath, "utf8");
  return validateConfig(parseYaml(raw));
}

/**
 * Emit a YAML scalar for the `.cdv` subset our parser reads back (see yaml.ts).
 * Windows paths carry `:`, `\` and spaces, so anything but a plain identifier is
 * single-quoted (backslashes stay literal inside single quotes; `'` is doubled).
 */
function emitScalar(value: string | number): string {
  if (typeof value === "number") return String(value);
  const bareSafe = /^[A-Za-z0-9_.\-]+$/.test(value)
    && !["true", "false", "null", "~"].includes(value.toLowerCase());
  if (bareSafe) return value;
  return `'${value.replace(/'/g, "''")}'`;
}

/**
 * Serialize a validated config back to `.cdv` YAML. The output round-trips
 * through {@link loadConfig}; only the schema fields are written (comments and
 * unknown keys in the original file are not preserved).
 */
export function serializeConfig(config: CdvConfig): string {
  const lines: string[] = [];
  lines.push(`name: ${emitScalar(config.name)}`);
  if (config.engine) lines.push(`engine: ${emitScalar(config.engine)}`);
  if (config.mode) lines.push(`mode: ${emitScalar(config.mode)}`);

  lines.push("sources:");
  for (const source of config.sources) {
    if (source.exclude && source.exclude.length > 0) {
      lines.push(`  - path: ${emitScalar(source.path)}`);
      lines.push(`    exclude:`);
      for (const pattern of source.exclude) lines.push(`      - ${emitScalar(pattern)}`);
    } else {
      lines.push(`  - ${emitScalar(source.path)}`);
    }
  }

  lines.push("destination:");
  lines.push(`  path: ${emitScalar(config.destination.path)}`);

  if (config.retention) {
    lines.push("retention:");
    lines.push(`  keep: ${emitScalar(config.retention.keep)}`);
  }

  if (config.compress) lines.push(`compress: true`);

  return lines.join("\n") + "\n";
}

/** Validate `doc` and write it back to `filePath` as `.cdv` YAML. */
export function writeConfig(filePath: string, doc: YamlValue): CdvConfig {
  if (extname(filePath) !== CONFIG_EXTENSION) {
    throw new CdvConfigError(`config file must have a '${CONFIG_EXTENSION}' extension, got '${filePath}'`);
  }
  const config = validateConfig(doc);
  writeFileSync(filePath, serializeConfig(config), "utf8");
  return config;
}
