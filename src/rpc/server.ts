import { createInterface } from "node:readline";
import type { Readable, Writable } from "node:stream";
import { loadConfig, validateConfig, writeConfig, type CdvConfig } from "../config.js";
import { runBackup } from "../engine/index.js";
import { CancelledError } from "../engine/types.js";
import { listSnapshots } from "../vault/list.js";
import { runRestore } from "../vault/restore.js";
import { ERR, type RpcRequest, type RpcResponse } from "./protocol.js";
import { version } from "../version.js";

interface Job {
  id: string;
  controller: AbortController;
}

/**
 * JSON-RPC host for `cdv serve`. Reads NDJSON requests from `input`, writes
 * responses and `backup.*` notifications to `output`. Long-running backups are
 * tracked as jobs so the client can cancel them and receive live progress.
 */
export class RpcServer {
  private jobs = new Map<string, Job>();
  private jobSeq = 0;

  constructor(
    private readonly input: Readable,
    private readonly output: Writable,
  ) {}

  /** Resolves when the input stream closes (EOF) — the normal shutdown signal. */
  serve(): Promise<void> {
    const rl = createInterface({ input: this.input, crlfDelay: Infinity });
    return new Promise((resolve) => {
      rl.on("line", (line) => {
        const trimmed = line.trim();
        if (trimmed) void this.handleLine(trimmed);
      });
      rl.on("close", () => {
        for (const job of this.jobs.values()) job.controller.abort();
        resolve();
      });
    });
  }

  private write(obj: RpcResponse | { jsonrpc: "2.0"; method: string; params: unknown }): void {
    this.output.write(JSON.stringify(obj) + "\n");
  }

  private notify(method: string, params: unknown): void {
    this.write({ jsonrpc: "2.0", method, params });
  }

  private reply(id: RpcRequest["id"], result: unknown): void {
    this.write({ jsonrpc: "2.0", id: id ?? null, result });
  }

  private fail(id: RpcRequest["id"], code: number, message: string, data?: unknown): void {
    this.write({ jsonrpc: "2.0", id: id ?? null, error: { code, message, data } });
  }

  private async handleLine(line: string): Promise<void> {
    let req: RpcRequest;
    try {
      req = JSON.parse(line) as RpcRequest;
    } catch {
      return this.fail(null, ERR.parse, "invalid JSON");
    }
    if (!req || req.jsonrpc !== "2.0" || typeof req.method !== "string") {
      return this.fail(req?.id ?? null, ERR.invalidRequest, "invalid request");
    }

    try {
      await this.dispatch(req);
    } catch (err) {
      this.fail(req.id, ERR.internal, err instanceof Error ? err.message : String(err));
    }
  }

  private async dispatch(req: RpcRequest): Promise<void> {
    const params = (req.params ?? {}) as Record<string, unknown>;
    switch (req.method) {
      case "vault.ping":
        return this.reply(req.id, { pong: true, echo: req.params ?? null });

      case "vault.info":
        return this.reply(req.id, {
          name: "cdv",
          version,
          pid: process.pid,
          platform: process.platform,
          methods: [
            "vault.ping", "vault.info", "vault.validate", "vault.read", "vault.write",
            "backup.start", "backup.cancel",
            "snapshot.list", "restore.start",
          ],
        });

      case "vault.validate": {
        const config = this.requireConfig(params);
        return this.reply(req.id, {
          name: config.name,
          engine: config.engine ?? (process.platform === "win32" ? "robocopy" : "builtin"),
          mode: config.mode ?? "mirror",
          sources: config.sources.length,
          destination: config.destination.path,
          retention: config.retention?.keep ?? null,
        });
      }

      case "vault.read": {
        // Full config incl. actual source/destination paths — for the editor
        // form (vault.validate only reports counts). Engine/mode are resolved to
        // concrete values so the form shows what a run would actually use.
        const config = this.requireConfig(params);
        return this.reply(req.id, {
          name: config.name,
          engine: config.engine ?? (process.platform === "win32" ? "robocopy" : "builtin"),
          mode: config.mode ?? "mirror",
          sources: config.sources.map((s) => ({ path: s.path, exclude: s.exclude ?? [] })),
          destination: { path: config.destination.path },
          retention: config.retention ?? null,
          compress: config.compress ?? false,
        });
      }

      case "vault.write": {
        // Validate + persist an edited config back to its `.cdv` file.
        const configPath = params.configPath;
        if (typeof configPath !== "string") {
          return this.fail(req.id, ERR.invalidParams, "'configPath' is required");
        }
        if (!params.config || typeof params.config !== "object") {
          return this.fail(req.id, ERR.invalidParams, "'config' object is required");
        }
        const saved = writeConfig(configPath, params.config as never);
        return this.reply(req.id, {
          name: saved.name,
          engine: saved.engine ?? (process.platform === "win32" ? "robocopy" : "builtin"),
          mode: saved.mode ?? "mirror",
          sources: saved.sources.map((s) => ({ path: s.path, exclude: s.exclude ?? [] })),
          destination: { path: saved.destination.path },
          retention: saved.retention ?? null,
          compress: saved.compress ?? false,
        });
      }

      case "backup.start":
        return this.startBackup(req, this.requireConfig(params));

      case "backup.cancel": {
        const jobId = String(params.jobId ?? "");
        const job = this.jobs.get(jobId);
        if (!job) return this.fail(req.id, ERR.invalidParams, `no such job: ${jobId}`);
        job.controller.abort();
        return this.reply(req.id, { cancelling: true, jobId });
      }

      case "snapshot.list": {
        const config = this.requireConfig(params);
        const snapshots = listSnapshots(config).map((s) => ({
          id: s.id,
          createdAt: s.createdAt ? s.createdAt.toISOString() : null,
          compressed: s.compressed,
        }));
        return this.reply(req.id, { snapshots });
      }

      case "restore.start": {
        const config = this.requireConfig(params);
        const target = String(params.target ?? "");
        if (!target) return this.fail(req.id, ERR.invalidParams, "'target' is required");
        const snapshotId = params.snapshotId ? String(params.snapshotId) : undefined;
        const restoredId = await runRestore(config, target, snapshotId);
        return this.reply(req.id, { restoredId, target });
      }

      default:
        return this.fail(req.id, ERR.methodNotFound, `method not found: ${req.method}`);
    }
  }

  /** Accept either `{ configPath }` (server reads the file) or `{ config }` (inline object). */
  private requireConfig(params: Record<string, unknown>): CdvConfig {
    if (typeof params.configPath === "string") return loadConfig(params.configPath);
    if (params.config && typeof params.config === "object") {
      return validateConfig(params.config as never);
    }
    throw new Error("params must include 'configPath' or 'config'");
  }

  private startBackup(req: RpcRequest, config: CdvConfig): void {
    const jobId = `job-${++this.jobSeq}`;
    const controller = new AbortController();
    this.jobs.set(jobId, { id: jobId, controller });

    // Reply immediately with the job handle; progress streams as notifications.
    this.reply(req.id, { jobId, name: config.name });

    runBackup(config, {
      signal: controller.signal,
      onProgress: (p) => this.notify("backup.progress", { jobId, ...p }),
      onLog: (message) => this.notify("backup.log", { jobId, message }),
    }).then(
      (result) => {
        this.jobs.delete(jobId);
        this.notify("backup.done", { jobId, ...result });
      },
      (err) => {
        this.jobs.delete(jobId);
        if (err instanceof CancelledError) {
          this.notify("backup.cancelled", { jobId });
        } else {
          this.notify("backup.error", { jobId, message: err instanceof Error ? err.message : String(err) });
        }
      },
    );
  }
}
