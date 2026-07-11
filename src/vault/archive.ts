import { spawn } from "node:child_process";
import { createReadStream, createWriteStream, mkdirSync } from "node:fs";
import { CancelledError } from "../engine/types.js";

/**
 * gzip-compressed tar archiving for snapshots, delegated to the system `tar`
 * (bsdtar on Windows 10+, GNU/bsd tar on macOS and Linux) — same "let a
 * professional CLI move the bytes" philosophy as the robocopy engine, and it
 * keeps cryo-drive-vault at zero runtime dependencies (no `tar` npm package).
 *
 * `tar` is always run with its **cwd** set to the directory it operates on and
 * the archive streamed through **stdin/stdout** (`-f -`). No Windows path is
 * ever passed as a `tar` argument — which matters because GNU tar (e.g.
 * Git-for-Windows) reads a `D:` in a path argument as a remote `host:path`
 * ("Cannot connect to D:") and mangles cross-drive `-C` directories. Node's
 * `spawn({ cwd })` resolves the drive natively, so any source/destination drive
 * works. Streaming also keeps the whole archive off the JS heap and, being
 * async, lets a `backup.cancel` interrupt an in-flight compression.
 */

/** Suffix appended to a snapshot id when a run is compressed. */
export const ARCHIVE_SUFFIX = ".tar.gz";

function mapSpawnError(err: NodeJS.ErrnoException): Error {
  if (err.name === "AbortError") return new CancelledError();
  if (err.code === "ENOENT") {
    return new Error("compression needs the system 'tar' on PATH (bundled with Windows 10+, macOS and Linux)");
  }
  return err;
}

/** Pack the whole contents of `sourceDir` into `archivePath` (`.tar.gz`). */
export function createArchive(sourceDir: string, archivePath: string, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("tar", ["-czf", "-", "."], { cwd: sourceDir, signal, windowsHide: true });
    const out = createWriteStream(archivePath);
    let stderr = "";
    let settled = false;
    let exitCode: number | null = null;
    let flushed = false;

    const fail = (err: Error): void => { if (!settled) { settled = true; reject(err); } };
    const done = (): void => {
      if (settled || !flushed || exitCode === null) return;
      if (exitCode === 0) { settled = true; resolve(); }
      else fail(new Error(`tar create failed (exit ${exitCode})${stderr.trim() ? `: ${stderr.trim()}` : ""}`));
    };

    child.stderr.on("data", (d: Buffer) => { stderr += d.toString("utf8"); });
    child.on("error", (err: NodeJS.ErrnoException) => fail(mapSpawnError(err)));
    out.on("error", fail);
    out.on("finish", () => { flushed = true; done(); });
    child.stdout.pipe(out); // stdout end() closes `out`, firing `finish`
    child.on("close", (code) => { exitCode = code; if (code !== 0) fail(new Error(`tar create failed (exit ${code})${stderr.trim() ? `: ${stderr.trim()}` : ""}`)); else done(); });
  });
}

/** Extract `archivePath` (`.tar.gz`) into `targetDir`, creating it if needed. */
export function extractArchive(archivePath: string, targetDir: string, signal?: AbortSignal): Promise<void> {
  mkdirSync(targetDir, { recursive: true });
  return new Promise((resolve, reject) => {
    const child = spawn("tar", ["-xzf", "-"], { cwd: targetDir, signal, windowsHide: true });
    let stderr = "";
    let settled = false;
    const fail = (err: Error): void => { if (!settled) { settled = true; reject(err); } };

    child.stderr.on("data", (d: Buffer) => { stderr += d.toString("utf8"); });
    child.on("error", (err: NodeJS.ErrnoException) => fail(mapSpawnError(err)));

    const input = createReadStream(archivePath);
    input.on("error", fail);
    child.stdin.on("error", () => { /* tar may exit before we finish writing; ignore EPIPE */ });
    input.pipe(child.stdin);

    child.on("close", (code) => {
      if (settled) return;
      if (code === 0) { settled = true; resolve(); }
      else fail(new Error(`tar extract failed (exit ${code})${stderr.trim() ? `: ${stderr.trim()}` : ""}`));
    });
  });
}
