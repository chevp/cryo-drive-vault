import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import type { CdvConfig, CdvSource } from "../config.js";
import {
  type BackupEngine,
  type BackupResult,
  type RunHooks,
  CancelledError,
  EngineError,
} from "./types.js";
import { isRobocopySuccess, parseFileLine } from "./robocopy-parse.js";

/**
 * Backup engine that shells out to robocopy — Windows' native, battle-tested
 * mirror/sync tool. `mode: mirror` uses /MIR (destination tracks the sources
 * 1:1, extras deleted); `mode: copy` uses /E (additive, nothing deleted).
 *
 * robocopy takes exactly one source dir → one dest dir per invocation, so with
 * multiple sources each is mirrored into `destination/<basename>` — the same
 * per-source layout the builtin engine uses. A `/L` (list-only) pre-scan runs
 * first to get file/byte totals so progress can report a real percentage.
 */
export class RobocopyEngine implements BackupEngine {
  readonly name = "robocopy";

  async available(): Promise<boolean> {
    return process.platform === "win32";
  }

  async run(config: CdvConfig, hooks: RunHooks): Promise<BackupResult> {
    const mode = config.mode ?? "mirror";
    const dest = resolve(config.destination.path);

    const jobs = config.sources.map((source) => {
      const abs = resolve(source.path);
      if (!existsSync(abs)) {
        throw new EngineError(`source not found: ${source.path}`);
      }
      return { source, src: abs, dst: join(dest, basename(abs)) };
    });

    // Phase 1 — pre-scan every source (list only) to size the progress bar.
    let filesTotal = 0;
    let bytesTotal = 0;
    for (const job of jobs) {
      const scan = await this.invoke(job.src, job.dst, job.source, mode, hooks, true, () => {});
      filesTotal += scan.files;
      bytesTotal += scan.bytes;
    }

    // Phase 2 — real run, streaming progress against the pre-scanned totals.
    let filesDone = 0;
    let bytesDone = 0;
    let filesCopied = 0;
    let filesDeleted = 0;
    let bytesCopied = 0;

    for (const job of jobs) {
      const res = await this.invoke(job.src, job.dst, job.source, mode, hooks, false, (ev) => {
        filesDone += 1;
        bytesDone += ev.bytes;
        if (ev.action === "copy") {
          filesCopied += 1;
          bytesCopied += ev.bytes;
        } else {
          filesDeleted += 1;
        }
        hooks.onFile?.(ev);
        hooks.onProgress?.({
          filesDone,
          filesTotal,
          bytesDone,
          bytesTotal,
          currentPath: ev.path,
        });
      });
      void res;
    }

    return {
      engine: this.name,
      filesCopied,
      filesDeleted,
      bytesCopied,
      destination: dest,
    };
  }

  private buildArgs(
    src: string,
    dst: string,
    source: CdvSource,
    mode: "mirror" | "copy",
    listOnly: boolean,
  ): string[] {
    const args = [src, dst];
    args.push(mode === "mirror" ? "/MIR" : "/E");
    if (!listOnly) args.push("/MT:8");
    // /R and /W override robocopy's insane defaults (1M retries, 30s waits) so
    // a single locked file can't hang the backup forever.
    args.push("/R:2", "/W:2", "/NP", "/NJH", "/NDL", "/FP", "/BYTES");
    if (listOnly) args.push("/L");

    const excludes = source.exclude ?? [];
    if (excludes.length > 0) {
      // Feed every pattern to both /XF (files) and /XD (dirs) — a file pattern
      // matches no dirs and vice versa, so the union is safe and covers both.
      args.push("/XF", ...excludes);
      args.push("/XD", ...excludes);
    }
    return args;
  }

  private invoke(
    src: string,
    dst: string,
    source: CdvSource,
    mode: "mirror" | "copy",
    hooks: RunHooks,
    listOnly: boolean,
    onFile: (ev: { path: string; bytes: number; action: "copy" | "delete" }) => void,
  ): Promise<{ files: number; bytes: number }> {
    const args = this.buildArgs(src, dst, source, mode, listOnly);

    return new Promise((resolvePromise, reject) => {
      const child = spawn("robocopy", args, { windowsHide: true, signal: hooks.signal });

      let files = 0;
      let bytes = 0;
      const tail: string[] = [];
      let stdoutBuf = "";

      const handleLine = (line: string): void => {
        const trimmed = line.replace(/\r$/, "");
        if (!trimmed) return;
        const parsed = parseFileLine(trimmed);
        if (parsed) {
          files += 1;
          bytes += parsed.bytes;
          onFile(parsed);
        } else if (!listOnly) {
          hooks.onLog?.(trimmed);
        }
        tail.push(trimmed);
        if (tail.length > 40) tail.shift();
      };

      child.stdout?.on("data", (chunk: Buffer) => {
        stdoutBuf += chunk.toString("utf8");
        let nl: number;
        while ((nl = stdoutBuf.indexOf("\n")) >= 0) {
          handleLine(stdoutBuf.slice(0, nl));
          stdoutBuf = stdoutBuf.slice(nl + 1);
        }
      });
      child.stderr?.on("data", (chunk: Buffer) => {
        for (const line of chunk.toString("utf8").split(/\r?\n/)) {
          if (line.trim()) hooks.onLog?.(line.trim());
        }
      });

      child.on("error", (err: NodeJS.ErrnoException) => {
        if (err.name === "AbortError") return reject(new CancelledError());
        if (err.code === "ENOENT") {
          return reject(new EngineError("robocopy not found — this engine needs Windows"));
        }
        reject(err);
      });

      child.on("close", (code, signal) => {
        if (stdoutBuf.trim()) handleLine(stdoutBuf);
        if (hooks.signal?.aborted) return reject(new CancelledError());
        if (signal) return reject(new EngineError(`robocopy killed by ${signal}`));
        if (!isRobocopySuccess(code)) {
          reject(new EngineError(`robocopy failed (exit ${code}):\n${tail.join("\n")}`));
          return;
        }
        resolvePromise({ files, bytes });
      });
    });
  }
}
