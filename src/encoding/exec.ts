import { spawn } from "child_process";
import logger from "../utils/logger";

export interface RunResult {
  stdout: string;
  stderr: string;
}

/**
 * Spawn a binary and await completion. Rejects on non-zero exit with the tail of
 * stderr (ffmpeg/packager/whisper write progress + errors there). We stream
 * rather than buffer the whole output because transcode logs can be large.
 */
export const run = (
  bin: string,
  args: string[],
  label: string,
  opts?: { cwd?: string }
): Promise<RunResult> => {
  return new Promise((resolve, reject) => {
    logger.debug(`[exec ${label}] ${bin} ${args.join(" ")}`);
    const child = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"], cwd: opts?.cwd });

    let stdout = "";
    let stderrTail = "";
    const TAIL = 8000;

    child.stdout.on("data", (d: Buffer) => {
      stdout += d.toString();
    });
    child.stderr.on("data", (d: Buffer) => {
      stderrTail = (stderrTail + d.toString()).slice(-TAIL);
    });

    child.on("error", (err) => reject(new Error(`[${label}] spawn failed: ${err.message}`)));
    child.on("close", (code) => {
      if (code === 0) resolve({ stdout, stderr: stderrTail });
      else reject(new Error(`[${label}] exited ${code}: ${stderrTail.slice(-2000)}`));
    });
  });
};
