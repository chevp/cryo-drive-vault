import { readFileSync } from "node:fs";
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

export interface CdvConfig {
  name: string;
  sources: CdvSource[];
  destination: CdvDestination;
  retention?: CdvRetention;
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

  return {
    name: root.name,
    sources,
    destination: { path: destinationRecord.path },
    retention,
  };
}

export function loadConfig(filePath: string): CdvConfig {
  if (extname(filePath) !== CONFIG_EXTENSION) {
    throw new CdvConfigError(`config file must have a '${CONFIG_EXTENSION}' extension, got '${filePath}'`);
  }
  const raw = readFileSync(filePath, "utf8");
  return validateConfig(parseYaml(raw));
}
