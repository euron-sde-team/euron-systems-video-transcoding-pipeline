import { mkdir, rm } from "fs/promises";
import path from "path";
import config from "../config";
import { setOrientation, type VideoRow } from "../db/queue";
import { OwnershipLostError } from "../encoding/exec";
import { transcode } from "../encoding/ffmpeg";
import { packageHlsAes } from "../encoding/hls-aes";
import { selectLadder } from "../encoding/ladder";
import { probe } from "../encoding/probe";
// NOT IN USE (HLS-only migration): packageCmaf (cbcs CMAF + DASH) is no longer
// called; its import is removed so src/encoding/shaka.ts is unwired from the build.
import { generateThumbnails } from "../encoding/thumbnails";
import contentKeyService from "../services/content-key.service";
import s3UploadService from "../services/s3-upload.service";
import { HLS_AES_KEY_URI_PLACEHOLDER } from "../utils/const";
import logger from "../utils/logger";
import type { Heartbeat } from "./heartbeat";
import { uploadOutputTree } from "./r2";

export interface PrimaryOutcome {
  /** Total bytes of the packaged output tree uploaded to the R2 output bucket. */
  outputBytes: number;
  /** Probed source duration in seconds (persisted by markReadyAndEnqueue). */
  durationSec: number;
  /**
   * Whether a CAPTIONS background job should be enqueued (the source had audio and
   * captions were not disabled). When false the caller marks captions 'skipped'.
   */
  enqueueCaptions: boolean;
}

interface PipelineConfig {
  captions?: boolean;
  /** Force a caption language (whisper `-l`); defaults to config.CAPTIONS_DEFAULT_LANG ("en"). */
  captionsLang?: string;
}

/**
 * PRIMARY transcode for one claimed video: the playback-critical path ONLY.
 * Decode + ABR ladder + thumbnails + AES-128 HLS packaging + R2 upload, then the
 * caller flips the video to READY. Captions and the downloadable MP4 are NO LONGER
 * produced here, they are decoupled into video_jobs that run after READY (so the
 * video is watchable the moment this returns, not hours later). Everything happens
 * in a per-job temp dir that is always removed in `finally`.
 */
export const runPrimary = async (
  video: VideoRow,
  workerId: string,
  hb: Heartbeat,
  signal: AbortSignal
): Promise<PrimaryOutcome> => {
  const jobDir = path.join(config.WORK_DIR, video.id);
  const sourceDir = path.join(jobDir, "src");
  const renditionsDir = path.join(jobDir, "renditions");
  const outputDir = path.join(jobDir, "output");

  await mkdir(sourceDir, { recursive: true });
  await mkdir(renditionsDir, { recursive: true });
  await mkdir(outputDir, { recursive: true });

  try {
    if (!video.source_key) throw new Error("video has no source_key");
    const ext = video.source_key.split(".").pop() || "mp4";
    const inputPath = path.join(sourceDir, `original.${ext}`);

    // ── download source (same-region S3 → free egress; abortable) ──
    await s3UploadService.downloadToFile(video.source_key, inputPath, signal);

    // ── 1. probe + orientation → ladder (capped to source bitrate) ──
    const probed = await probe(inputPath, signal);
    await setOrientation(video.id, workerId, probed.orientation);
    const ladder = selectLadder(probed.orientation, probed.width, probed.height, probed.bitrateKbps);
    logger.info(
      `[pipeline ${video.id}] ${probed.width}x${probed.height} ${probed.orientation} ` +
        `rot=${probed.rotation}, ${ladder.length} rungs, ${probed.durationSec}s, ` +
        `audio=${probed.hasAudio}, src=${probed.bitrateKbps}kbps`
    );

    // ── 2. transcoding (single decode, many encodes) + thumbnails ──
    // hb.update() double-checks ownership (guarded UPDATE); if the claim was lost
    // it flips the heartbeat's onLost → ac.abort(), so signal.aborted here means
    // a genuine claim loss. The boundary throw bails out of the GAPS between
    // encoder runs (each run() itself SIGKILLs its child on abort mid-encode).
    await hb.update("transcoding", 10);
    if (signal.aborted) throw new OwnershipLostError("primary");
    const { videoFiles, audioFile } = await transcode(
      inputPath,
      renditionsDir,
      ladder,
      probed.hasAudio,
      probed.rotation,
      probed.durationSec,
      signal
    );
    await hb.update("transcoding", 60);
    if (signal.aborted) throw new OwnershipLostError("primary");

    // Thumbnails/poster write straight into outputDir (shipped as-is to R2).
    await generateThumbnails(inputPath, outputDir, probed.width, probed.height, probed.durationSec, signal);
    await hb.update("transcoding", 68);
    if (signal.aborted) throw new OwnershipLostError("primary");

    // ── 3. packaging (generate + store key, then AES-128 HLS-TS, NO captions) ──
    // Captions are decoupled: the master here has NO subtitle rendition. The
    // CAPTIONS job re-uploads master.m3u8 (with subs) once whisper finishes.
    await hb.update("packaging", 78);
    if (signal.aborted) throw new OwnershipLostError("primary");
    const key = await contentKeyService.generateAndStore(video.tenant_id, video.id);
    await packageHlsAes({
      outputDir,
      videoFiles,
      audioFile,
      key: { keyBytes: key.keyBytes },
      keyUriPlaceholder: HLS_AES_KEY_URI_PLACEHOLDER,
      workDir: renditionsDir,
      captions: null,
      durationSec: probed.durationSec,
      signal,
    });
    await hb.update("packaging", 88);
    if (signal.aborted) throw new OwnershipLostError("primary");

    // ── 4. uploading_output → R2 (video is playable once this completes) ──
    // Boundary + signal-aware upload: a claim lost here must NOT ship a full
    // multi-GB tree (billed egress) for a video another actor now owns.
    await hb.update("uploading_output", 92);
    if (signal.aborted) throw new OwnershipLostError("primary");
    const outputPrefix = video.output_prefix ?? `${video.tenant_id}/${video.id}`;
    const { bytes: outputBytes } = await uploadOutputTree(outputDir, outputPrefix, signal);

    const cfg = (video.pipeline_config ?? {}) as PipelineConfig;
    return {
      outputBytes,
      durationSec: probed.durationSec,
      enqueueCaptions: probed.hasAudio && cfg.captions !== false,
    };
  } finally {
    await rm(jobDir, { recursive: true, force: true }).catch(() => {
      /* best-effort cleanup */
    });
  }
};
