import { mkdir, rm } from "fs/promises";
import path from "path";
import config from "../config";
import { setOrientation, type VideoRow } from "../db/queue";
import { generateCaptions } from "../encoding/captions";
import { muxProcessedDownload } from "../encoding/download-mux";
import { transcode } from "../encoding/ffmpeg";
import { packageHlsAes } from "../encoding/hls-aes";
import { selectLadder } from "../encoding/ladder";
import { probe } from "../encoding/probe";
import { packageCmaf } from "../encoding/shaka";
import { generateThumbnails } from "../encoding/thumbnails";
import contentKeyService from "../services/content-key.service";
import s3UploadService from "../services/s3-upload.service";
import { HLS_AES_KEY_URI_PLACEHOLDER, processedDownloadKey } from "../utils/const";
import logger from "../utils/logger";
import type { Heartbeat } from "./heartbeat";
import { uploadOutputTree } from "./r2";

export interface PipelineOutcome {
  captionsLangs: string[];
  /** Total bytes of the packaged output tree uploaded to the R2 output bucket. */
  outputBytes: number;
}

interface PipelineConfig {
  captions?: boolean;
  /** Force a caption language (whisper `-l`); defaults to config.CAPTIONS_DEFAULT_LANG ("en"). */
  captionsLang?: string;
}

/**
 * Full transcode pipeline for one claimed video. Stages match the `video_stage`
 * enum; each boundary writes stage + progress via the heartbeat so the dashboard
 * shows live status. Everything happens in a per-job temp dir that is always
 * removed in `finally`, disk is the scarce resource on a worker running many
 * jobs back-to-back.
 */
export const transcodePipeline = async (
  video: VideoRow,
  workerId: string,
  hb: Heartbeat
): Promise<PipelineOutcome> => {
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

    // ── download source (same-region S3 → free egress) ──
    await s3UploadService.downloadToFile(video.source_key, inputPath);

    // ── 1. probe + orientation → ladder ──
    const probed = await probe(inputPath);
    await setOrientation(video.id, workerId, probed.orientation);
    const ladder = selectLadder(probed.orientation, probed.width, probed.height);
    logger.info(
      `[pipeline ${video.id}] ${probed.width}x${probed.height} ${probed.orientation} ` +
        `rot=${probed.rotation}, ${ladder.length} rungs, ${probed.durationSec}s, audio=${probed.hasAudio}`
    );

    // ── 2. transcoding (single decode, many encodes) + thumbnails ──
    await hb.update("transcoding", 10);
    const { videoFiles, audioFile } = await transcode(
      inputPath,
      renditionsDir,
      ladder,
      probed.hasAudio,
      probed.rotation,
      probed.durationSec
    );
    await hb.update("transcoding", 55);

    // Thumbnails/poster write straight into outputDir (shipped as-is to R2).
    await generateThumbnails(inputPath, outputDir, probed.width, probed.height, probed.durationSec);
    await hb.update("transcoding", 62);

    // ── 3. transcribing (captions) ──
    const cfg = (video.pipeline_config ?? {}) as PipelineConfig;
    let captions: { vttFile: string; lang: string } | null = null;
    if (cfg.captions !== false) {
      await hb.update("transcribing", 66);
      const captionsLang = cfg.captionsLang ?? config.CAPTIONS_DEFAULT_LANG;
      captions = await generateCaptions(inputPath, renditionsDir, probed.hasAudio, captionsLang);
    }

    // ── 4. packaging (generate + store key, then CMAF cbcs + dual manifest) ──
    await hb.update("packaging", 75);
    const key = await contentKeyService.generateAndStore(video.tenant_id, video.id);
    const hlsKeyUri = config.PUBLIC_API_BASE
      ? `${config.PUBLIC_API_BASE.replace(/\/+$/, "")}/api/v1/videos/${video.id}/key?format=raw`
      : undefined;
    await packageCmaf({ outputDir, videoFiles, audioFile, captions, key, hlsKeyUri });
    await hb.update("packaging", 82);

    // ── 4b. AES-128 HLS-TS tree (Safari native path), same content key ──
    // Shaka can't emit METHOD=AES-128 and cbcs needs FairPlay on Apple, so this
    // parallel TS tree (remuxed, no re-encode) is what Safari/iOS play natively.
    await packageHlsAes({
      outputDir,
      videoFiles,
      audioFile,
      key: { keyBytes: key.keyBytes },
      keyUriPlaceholder: HLS_AES_KEY_URI_PLACEHOLDER,
      workDir: renditionsDir,
      captions,
      durationSec: probed.durationSec,
    });
    await hb.update("packaging", 85);

    // ── 4c. processed downloadable MP4 → PRIVATE upload bucket (non-fatal) ──
    try {
      const processed = await muxProcessedDownload(videoFiles, audioFile, renditionsDir);
      if (processed) {
        await s3UploadService.uploadFile(
          processedDownloadKey(video.tenant_id, video.id),
          processed,
          "video/mp4"
        );
      }
    } catch (err) {
      logger.error(
        `[pipeline ${video.id}] processed download failed (non-fatal): ${(err as Error).message}`
      );
    }

    // ── 5. uploading_output → R2 ──
    await hb.update("uploading_output", 90);
    const outputPrefix = video.output_prefix ?? `${video.tenant_id}/${video.id}`;
    const { bytes: outputBytes } = await uploadOutputTree(outputDir, outputPrefix);

    return { captionsLangs: captions ? [captions.lang] : [], outputBytes };
  } finally {
    await rm(jobDir, { recursive: true, force: true }).catch(() => {
      /* best-effort cleanup */
    });
  }
};
