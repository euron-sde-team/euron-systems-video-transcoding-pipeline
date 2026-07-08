import { mkdir, rm, writeFile } from "fs/promises";
import path from "path";
import config from "../../config";
import {
  markCaptionsReady,
  markCaptionsSkipped,
  setArtifactProcessing,
  type VideoJobRow,
} from "../../db/queue";
import { generateCaptions } from "../../encoding/captions";
import { buildMasterPlaylist, writeSubtitleRendition } from "../../encoding/hls-aes";
import { selectLadder } from "../../encoding/ladder";
import { probe } from "../../encoding/probe";
import videosRepository from "../../repositories/videos.repository";
import s3UploadService from "../../services/s3-upload.service";
import logger from "../../utils/logger";
import { uploadOutputTree } from "../r2";

interface PipelineConfig {
  captions?: boolean;
  captionsLang?: string;
}

/**
 * CAPTIONS background job (decoupled from PRIMARY). Re-downloads the source, runs
 * whisper, then re-uploads ONLY the small manifest files: the subtitle rendition
 * (subs/<lang>.*) and a rebuilt master.m3u8 that now exposes the CC track. The rung
 * TS segments are untouched (already on R2 from PRIMARY). Because uploadOutputTree
 * gives master.m3u8 a 5-min TTL, a fresh playback session picks up captions with no
 * cache-busting. Throws on failure so the worker requeues just THIS job.
 */
export const runCaptionsJob = async (job: VideoJobRow): Promise<void> => {
  const video = await videosRepository.findById(job.video_id);
  if (!video) throw new Error(`captions job: video ${job.video_id} not found`);
  if (!video.source_key) throw new Error(`captions job: video ${job.video_id} has no source_key`);

  await setArtifactProcessing(job.video_id, "CAPTIONS");

  const jobDir = path.join(config.WORK_DIR, `cap-${job.id}`);
  const sourceDir = path.join(jobDir, "src");
  // Upload root: uploadOutputTree(jobDir, prefix) maps hls-aes/* → {prefix}/hls-aes/*.
  const capRoot = path.join(jobDir, "hls-aes");
  await mkdir(sourceDir, { recursive: true });
  await mkdir(capRoot, { recursive: true });

  try {
    const ext = video.source_key.split(".").pop() || "mp4";
    const inputPath = path.join(sourceDir, `original.${ext}`);
    await s3UploadService.downloadToFile(video.source_key, inputPath);

    const probed = await probe(inputPath);
    if (!probed.hasAudio) {
      logger.info(`[captions ${job.video_id}] source has no audio, marking skipped`);
      await markCaptionsSkipped(job.video_id);
      return;
    }

    const cfg = (video.pipeline_config ?? {}) as PipelineConfig;
    const lang = cfg.captionsLang ?? config.CAPTIONS_DEFAULT_LANG;
    const captions = await generateCaptions(inputPath, sourceDir, probed.hasAudio, lang);
    if (!captions) {
      throw new Error("caption generation returned null (whisper failed or produced no vtt)");
    }

    // Rebuild the AES master WITH the subtitle rendition using the SAME deterministic
    // ladder PRIMARY used, then upload only master.m3u8 + subs/* (segments untouched).
    await writeSubtitleRendition(capRoot, captions.vttFile, captions.lang, probed.durationSec);
    const ladder = selectLadder(probed.orientation, probed.width, probed.height, probed.bitrateKbps);
    const master = buildMasterPlaylist(
      ladder.map((rung) => ({ rung })),
      probed.hasAudio,
      captions.lang
    );
    await writeFile(path.join(capRoot, "master.m3u8"), master);

    // Upload ONLY the hls-aes subtree (master.m3u8 + subs/*). Uploading jobDir would
    // also push the re-downloaded source + WAV under src/ to the public output bucket.
    const outputPrefix = video.output_prefix ?? `${video.tenant_id}/${video.id}`;
    await uploadOutputTree(capRoot, `${outputPrefix}/hls-aes`);

    await markCaptionsReady(job.video_id, [captions.lang]);
    logger.info(`[captions ${job.video_id}] ready (${captions.lang})`);
  } finally {
    await rm(jobDir, { recursive: true, force: true }).catch(() => {
      /* best-effort cleanup */
    });
  }
};
