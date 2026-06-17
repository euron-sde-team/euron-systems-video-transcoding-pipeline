import { mkdir, writeFile } from "fs/promises";
import path from "path";
import config from "../config";
import { run } from "./exec";

export interface ThumbnailsResult {
  posterFile: string;
  spriteDir: string;
  vttFile: string;
  spriteCount: number;
}

const THUMB_W = 160;
const INTERVAL_SEC = 5;
const COLS = 10;
const ROWS = 10;
const PER_SPRITE = COLS * ROWS;

const even = (n: number) => (n % 2 === 0 ? n : n + 1);
const pad3 = (n: number) => String(n).padStart(3, "0");

const vttTime = (sec: number): string => {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const ms = Math.round((sec - Math.floor(sec)) * 1000);
  const p = (n: number, l = 2) => String(n).padStart(l, "0");
  return `${p(h)}:${p(m)}:${p(s)}.${p(ms, 3)}`;
};

/**
 * Two cheap passes: a poster frame and a scrub-preview sprite sheet, plus a
 * #xywh WebVTT mapping each 5s interval to a tile region. Runs in parallel with
 * nothing else; it's a separate decode but a fast one (1 frame / 5s, downscaled).
 */
export const generateThumbnails = async (
  inputPath: string,
  workDir: string,
  srcWidth: number,
  srcHeight: number,
  durationSec: number
): Promise<ThumbnailsResult> => {
  const spriteDir = path.join(workDir, "thumbnails");
  await mkdir(spriteDir, { recursive: true });

  const posterFile = path.join(workDir, "poster.jpg");
  const posterAt = durationSec > 2 ? 1 : 0;

  // Poster (representative frame).
  await run(
    config.FFMPEG_BIN,
    ["-y", "-ss", String(posterAt), "-i", inputPath, "-frames:v", "1", "-q:v", "2", posterFile],
    "ffmpeg-poster"
  );

  const thumbH = even(Math.max(2, Math.round((THUMB_W * srcHeight) / srcWidth)));
  const thumbCount = Math.max(1, Math.ceil(durationSec / INTERVAL_SEC));
  const spriteCount = Math.ceil(thumbCount / PER_SPRITE);

  // Sprite sheets: 1 frame every 5s, downscaled, tiled 10x10.
  await run(
    config.FFMPEG_BIN,
    [
      "-y",
      "-i",
      inputPath,
      "-vf",
      `fps=1/${INTERVAL_SEC},scale=${THUMB_W}:-1,tile=${COLS}x${ROWS}`,
      "-q:v",
      "3",
      path.join(spriteDir, "sprite_%03d.jpg"),
    ],
    "ffmpeg-sprite"
  );

  // thumbnails.vtt, each cue points at a tile region inside its sprite sheet.
  let vtt = "WEBVTT\n\n";
  for (let i = 0; i < thumbCount; i++) {
    const start = i * INTERVAL_SEC;
    const end = Math.min((i + 1) * INTERVAL_SEC, durationSec || (i + 1) * INTERVAL_SEC);
    const spriteIndex = Math.floor(i / PER_SPRITE) + 1; // ffmpeg %03d starts at 001
    const within = i % PER_SPRITE;
    const col = within % COLS;
    const row = Math.floor(within / COLS);
    const x = col * THUMB_W;
    const y = row * thumbH;
    vtt += `${vttTime(start)} --> ${vttTime(end)}\n`;
    vtt += `sprite_${pad3(spriteIndex)}.jpg#xywh=${x},${y},${THUMB_W},${thumbH}\n\n`;
  }

  const vttFile = path.join(spriteDir, "thumbnails.vtt");
  await writeFile(vttFile, vtt, "utf8");

  return { posterFile, spriteDir, vttFile, spriteCount };
};
